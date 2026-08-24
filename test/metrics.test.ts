/**
 * `src/http/metrics.ts`: `GET /metrics`, Prometheus text-exposition format.
 * Format/shape assertions run unconditionally; value-correctness assertions
 * are DB-backed (skip when DATABASE_URL is unset), following
 * `test/health.test.ts`'s pattern for the sibling unauthenticated routes.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { createServer } from "../src/http/server.js";
import { handleMetrics } from "../src/http/metrics.js";
import type { ProcessBody, Instance } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

let n = 0;
const pid = () => `proc_metrics_${++n}` as Instance["processId"];

const waitBody = (label: string): ProcessBody =>
  ({
    key: "metrics_wait",
    label: { en: label },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", paths: [{ id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual" }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

test("handleMetrics never throws: a broken db reports 503 with the same content type, not an uncaught rejection", async () => {
  const badDb = (() => {
    throw new Error("connection refused");
  }) as unknown as Parameters<typeof handleMetrics>[0];
  const result = await handleMetrics(badDb);
  expect(result.status).toBe(503);
  expect(result.contentType).toBe("text/plain; version=0.0.4; charset=utf-8");
});

test.skipIf(!DB)("handleMetrics returns well-formed Prometheus text with the three gauge names, all zero on an empty database", async () => {
  const result = await handleMetrics(sql);
  expect(result.status).toBe(200);
  expect(result.contentType).toBe("text/plain; version=0.0.4; charset=utf-8");
  const text = new TextDecoder().decode(result.data);
  expect(text).toContain("workflow_timer_overdue_count 0");
  expect(text).toContain("workflow_timer_lag_seconds 0");
  expect(text).toContain("workflow_instances_faulted 0");
  expect(text).not.toContain("workflow_outbox_backlog"); // no rows at all -> no status present
  for (const line of text.trim().split("\n")) {
    expect(line).toMatch(/^workflow_\w+(\{[^}]*\})? -?\d+(\.\d+)?$/);
  }
});

test.skipIf(!DB)("handleMetrics reports a dead-lettered outbox row, an overdue timer, and a faulted instance", async () => {
  const P = pid();
  const v = await publishBody(P, waitBody("metrics"), reg, dataSourceReg);
  const body = (await createDefinitionStore(sql).resolveBody(P, v.version))!;

  const overdue = await createInstance(body, { processId: P, version: v.version }, sql);
  await sql`UPDATE instances SET next_timer_at = now() - interval '10 minutes' WHERE instance_id = ${overdue.instanceId}`;

  const faulted = await createInstance(body, { processId: P, version: v.version }, sql);
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${faulted.instanceId}`;

  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, status, attempts, field_version, created_at, next_attempt_at, last_error)
    VALUES ('metrics_dl_1', ${overdue.instanceId}, 1, 'action_dl', ${{ id: "action_dl", type: "noop", config: {} }}, 'dead-letter', 5, 1, now(), now(), 'boom')`;

  const result = await handleMetrics(sql);
  const text = new TextDecoder().decode(result.data);

  expect(text).toContain('workflow_outbox_backlog{status="dead-letter"} 1');
  expect(text).toMatch(/workflow_timer_overdue_count 1/);
  const lagLine = text.split("\n").find((l) => l.startsWith("workflow_timer_lag_seconds"))!;
  expect(Number(lagLine.split(" ")[1])).toBeGreaterThanOrEqual(600 - 5);
  expect(text).toContain("workflow_instances_faulted 1");
});

/**
 * `createServer` reads `METRICS_TOKEN` once, at construction, so a test sets
 * the variable before building its own handler and restores it afterwards.
 */
function serverWithToken(token: string | undefined): (req: Request) => Promise<Response> {
  const before = process.env.METRICS_TOKEN;
  if (token === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = token;
  try {
    return createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");
  } finally {
    if (before === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = before;
  }
}

const TOKEN = "s3cret-scrape-token";

test.skipIf(!DB)("an authorized GET /metrics returns Prometheus text, ignores CORS, and is not treated as a preflight", async () => {
  const fetch = serverWithToken(TOKEN);
  const res = await fetch(new Request("http://x/metrics", { headers: { Origin: "http://example.com", Authorization: `Bearer ${TOKEN}` } }));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  // Binary responses all carry nosniff; only a download carries a disposition.
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("Content-Disposition")).toBeNull();

  const preflight = await fetch(new Request("http://x/metrics", { method: "OPTIONS" }));
  expect(preflight.status).toBe(404);
});

test.skipIf(!DB)("a scrape with no token, a wrong token, or a token of the wrong length gets 401 and no metric line", async () => {
  const fetch = serverWithToken(TOKEN);
  const cases: (Record<string, string> | undefined)[] = [
    undefined,
    { Authorization: `Bearer ${TOKEN}x` },
    { Authorization: "Bearer " },
    { Authorization: `Bearer ${TOKEN.slice(0, 4)}` },
    { Authorization: TOKEN },
    { Authorization: `Basic ${TOKEN}` },
  ];
  for (const headers of cases) {
    const res = await fetch(new Request("http://x/metrics", headers ? { headers } : {}));
    // A length mismatch must not escape timingSafeEqual as a RangeError; that
    // would surface as 500 rather than 401.
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("workflow_");
  }
});

test.skipIf(!DB)("an unset or empty METRICS_TOKEN leaves the route unregistered, so a scrape gets the JSON 404 envelope", async () => {
  for (const token of [undefined, ""]) {
    const fetch = serverWithToken(token);
    const res = await fetch(new Request("http://x/metrics"));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("workflow_");
  }
});
