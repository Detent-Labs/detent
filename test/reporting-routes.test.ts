/**
 * The `/reporting/*` HTTP surface (src/http/reporting-routes.ts): 403 without
 * `system:reports`, success with it, 403-not-404 for an unknown process id
 * without the role, 404 with it, 400 for a malformed range, and the role's own
 * isolation — holding only it opens no admin, studio, publish or cancel path.
 * DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { REPORTS_ROLE, ADMIN_ROLE } from "../src/auth/authorize.js";
import { publishBody } from "../src/engine/definitions.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

const FROM = "2026-07-01T00:00:00.000Z";
const TO = "2026-07-31T00:00:00.000Z";
const RANGE = `from=${FROM}&to=${TO}`;

const owner: Actor = { id: "user_owner", roles: [REPORTS_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

const req = (url: string, actor: Actor, method = "GET") =>
  new Request(url, {
    method,
    headers: { "X-Actor-Id": actor.id, ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}) },
  });

let n = 0;
const pid = () => `proc_rep_http_${++n}` as ProcessId;

const body = (label: string): ProcessBody =>
  ({
    key: "rep_http",
    label: { en: label },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => { if (DB) await initSchema(); });
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, auth_users, migration_plans`;
});

const VIEWS = ["cycle-time", "bottleneck", "sla"] as const;

test.skipIf(!DB)("every reporting route answers 200 for an actor holding the reports role", async () => {
  const P = pid();
  await publishBody(P, body("v1"), reg, dataSourceReg);

  const list = await fetch(req("http://x/reporting/processes", owner));
  expect(list.status).toBe(200);
  expect(Array.isArray(((await list.json()) as { processes: unknown[] }).processes)).toBe(true);

  for (const view of VIEWS) {
    const res = await fetch(req(`http://x/reporting/${P}/${view}?${RANGE}`, owner));
    expect(res.status).toBe(200);
  }
});

test.skipIf(!DB)("every reporting route answers 403 without the reports role", async () => {
  const P = pid();
  await publishBody(P, body("v1"), reg, dataSourceReg);

  expect((await fetch(req("http://x/reporting/processes", bystander))).status).toBe(403);
  for (const view of VIEWS) {
    expect((await fetch(req(`http://x/reporting/${P}/${view}?${RANGE}`, bystander))).status).toBe(403);
  }
});

test.skipIf(!DB)("no other reserved role opens the reporting surface", async () => {
  const P = pid();
  await publishBody(P, body("v1"), reg, dataSourceReg);
  expect((await fetch(req(`http://x/reporting/${P}/sla?${RANGE}`, admin))).status).toBe(403);
});

test.skipIf(!DB)("a caller lacking the role gets 403, not 404, for a process id that does not exist", async () => {
  for (const view of VIEWS) {
    const res = await fetch(req(`http://x/reporting/proc_does_not_exist/${view}?${RANGE}`, bystander));
    expect(res.status).toBe(403);
  }
});

test.skipIf(!DB)("an unknown process id with the role gets 404", async () => {
  for (const view of VIEWS) {
    const res = await fetch(req(`http://x/reporting/proc_does_not_exist/${view}?${RANGE}`, owner));
    expect(res.status).toBe(404);
  }
});

test.skipIf(!DB)("a malformed range gets 400", async () => {
  const P = pid();
  await publishBody(P, body("v1"), reg, dataSourceReg);
  const bad = [
    `from=not-a-date&to=${TO}`,
    `from=${FROM}&to=nonsense`,
    `from=${TO}&to=${FROM}`,
    `to=${TO}`,
    `from=${FROM}`,
  ];
  for (const qs of bad) {
    const res = await fetch(req(`http://x/reporting/${P}/cycle-time?${qs}`, owner));
    expect(res.status).toBe(400);
  }
});

test.skipIf(!DB)("the reports role grants no operator, authoring, publish or cancel access", async () => {
  const P = pid();
  const v = await publishBody(P, body("v1"), reg, dataSourceReg);
  const inst = await createInstance(body("v1"), { processId: P, version: v.version, startedBy: "user_someone_else" }, sql);

  expect((await fetch(req("http://x/admin/outbox", owner))).status).toBe(403);
  expect((await fetch(req("http://x/drafts", owner))).status).toBe(403);
  expect((await fetch(req("http://x/processes", owner, "POST"))).status).toBe(403);
  expect((await fetch(req(`http://x/instances/${inst.instanceId}/cancel`, owner, "POST"))).status).toBe(403);
});

test.skipIf(!DB)("no reporting route mutates engine state", async () => {
  const P = pid();
  const v = await publishBody(P, body("v1"), reg, dataSourceReg);
  await createInstance(body("v1"), { processId: P, version: v.version }, sql);

  const snapshot = async () => {
    const [row] = (await sql`SELECT
      (SELECT count(*) FROM instances)::int AS instances,
      (SELECT count(*) FROM history_entries)::int AS history,
      (SELECT count(*) FROM instance_events)::int AS events,
      (SELECT count(*) FROM outbox)::int AS outbox,
      (SELECT count(*) FROM definitions)::int AS definitions,
      (SELECT coalesce(sum(transition_seq), 0) FROM instances)::int AS seqs`) as Record<string, number>[];
    return row!;
  };

  const before = await snapshot();
  await fetch(req("http://x/reporting/processes", owner));
  for (const view of VIEWS) await fetch(req(`http://x/reporting/${P}/${view}?${RANGE}`, owner));
  expect(await snapshot()).toEqual(before);
});
