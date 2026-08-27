/**
 * `BINARY_ROUTES` (src/http/server.ts): the declared ledger of routes that
 * return stored bytes rather than a JSON envelope. Drives the
 * `Content-Disposition` assertion generically over every entry, so a route
 * added to the ledger without an update here still gets checked — the
 * route-table drift class `CLAUDE.md`'s `/admin/*` collision names.
 *
 * No port: calls `createServer`'s handler directly with `new Request(...)`,
 * the way `test/http-static.test.ts` does. DB-backed: the `filename: true`
 * entry needs a published process, an instance and an uploaded attachment
 * row.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authHeaders, authedReq } from "./helpers/http-fixture.js";
import { clearInstanceAudit } from "./audit-cleanup.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { createServer, BINARY_ROUTES } from "../src/http/server.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const user1: Actor = { id: "user_1", roles: [] };

const jsonReq = (url: string, method: string, actor: Actor, body: unknown = {}) =>
  new Request(url, { method, headers: { ...authHeaders(actor), "content-type": "application/json" }, body: JSON.stringify(body) });

let n = 0;
const pid = () => `proc_disposition_${++n}` as ProcessId;

/** step_a --(path_ab, manual, guardless)--> step_b (terminal). No assignment: the starter alone may read an attachment. */
const simpleBody = (): ProcessBody =>
  ({
    key: "disposition_body",
    label: { en: "Disposition Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const TOKEN = "disposition-scrape-token";

/**
 * `createServer` reads `METRICS_TOKEN` once, at construction
 * (`test/metrics.test.ts`'s `serverWithToken` comment), so the variable is
 * set for this one construction and restored immediately after, rather than
 * left in place for the rest of the process's test run.
 */
function serverWithToken(): (req: Request) => Promise<Response> {
  const before = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = TOKEN;
  try {
    return createServer(dataSourceReg, reg, sql, devHeaderResolver);
  } finally {
    if (before === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = before;
  }
}

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_attachments, definitions`;
  if (DB) await clearInstanceAudit();
});

const fetch = serverWithToken();

test.skipIf(!DB)("every BINARY_ROUTES entry marked filename: true carries Content-Disposition: attachment, percent-encoded", async () => {
  const PID = pid();
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("hello").toString("base64");
  const uploaded = (await (
    await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "a report.txt", contentType: "text/plain", dataBase64 }))
  ).json()) as { id: string };

  const filenameRoutes = BINARY_ROUTES.filter((r) => r.filename);
  expect(filenameRoutes.length).toBeGreaterThan(0);
  for (const route of filenameRoutes) {
    const path = route.pattern.replace(":instanceId", created.instanceId).replace(":attachmentId", uploaded.id);
    const res = await fetch(authedReq(`http://x${path}`, route.method, user1));
    expect(res.status, `${route.method} ${route.pattern}`).toBe(200);
    expect(res.headers.get("Content-Disposition"), `${route.method} ${route.pattern}`).toBe('attachment; filename="a%20report.txt"');
  }
});

test.skipIf(!DB)("every BINARY_ROUTES entry marked filename: false carries no Content-Disposition", async () => {
  const noFilenameRoutes = BINARY_ROUTES.filter((r) => !r.filename);
  expect(noFilenameRoutes.length).toBeGreaterThan(0);
  for (const route of noFilenameRoutes) {
    const res = await fetch(new Request(`http://x${route.pattern}`, { method: route.method, headers: { Authorization: `Bearer ${TOKEN}` } }));
    expect(res.status, `${route.method} ${route.pattern}`).toBe(200);
    expect(res.headers.get("Content-Disposition"), `${route.method} ${route.pattern}`).toBeNull();
  }
});

test.skipIf(!DB)("a JSON envelope carries no Content-Disposition", async () => {
  const res = await fetch(authedReq("http://x/instances", "GET", user1));
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("Content-Disposition")).toBeNull();
});
