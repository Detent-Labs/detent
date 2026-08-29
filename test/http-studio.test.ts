/**
 * The `/drafts` HTTP surface (src/http/studio-routes.ts): 401 without a
 * credential, 403 without `system:developer`, success with it, plus the
 * 404/400/409 mappings specific to drafts. DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, createInstance } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { clearInstanceAudit } from "./audit-cleanup.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefinitionStore, publishBody } from "../src/engine/definitions.js";
import { INSTANCE_QUERY_DATA_SOURCE_TYPE, createInstanceQueryDataSourceHandlerDef } from "../src/engine/instance-query-source.js";
import { migrateInstances } from "../src/engine/migration.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { DEVELOPER_ROLE, PUBLISH_ROLE, TEMPLATES_ROLE, ADMIN_ROLE, REPORTS_ROLE, AUTHOR_ROLE, DATALISTS_ROLE } from "../src/auth/authorize.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessId, ProcessBody } from "../src/schema/definition.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
reg.set("http.request", { handler: async () => undefined });
dataSourceReg.set("static", { resolve: async () => [] });
dataSourceReg.set(INSTANCE_QUERY_DATA_SOURCE_TYPE, createInstanceQueryDataSourceHandlerDef(200));
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE drafts, templates, outbox, instances, history_entries, instance_events, definitions, migration_plans, permission_grants`;
  if (DB) await clearInstanceAudit();
});

const developer: Actor = { id: "user_dev", roles: [DEVELOPER_ROLE] };
const bystander: Actor = { id: "user_bystander", roles: [] };
const publisher: Actor = { id: "user_publisher", roles: [DEVELOPER_ROLE, PUBLISH_ROLE] };
const publishOnly: Actor = { id: "user_publish_only", roles: [PUBLISH_ROLE] };
const curator: Actor = { id: "user_curator", roles: [TEMPLATES_ROLE] };
const author: Actor = { id: "user_author", roles: [AUTHOR_ROLE] };
const authorPublisher: Actor = { id: "user_author_publisher", roles: [AUTHOR_ROLE, PUBLISH_ROLE] };
const financeAuthor: Actor = { id: "user_finance_author", roles: [AUTHOR_ROLE, "finance-authors"] };
const financeGrantOnly: Actor = { id: "user_finance_grant_only", roles: ["finance-authors"] };

/** Writes a `"publish"` grant directly, bypassing the admin route — that route's own behavior is covered in `test/http-admin.test.ts`. */
const grantPublish = async (role: string, processId: string): Promise<void> => {
  await sql`INSERT INTO permission_grants (role, permission, scope) VALUES (${role}, ${"publish"}, ${{ type: "process", config: { processId } }})`;
};

/** Same as `grantPublish`, for `"migrate"`. */
const grantMigrate = async (role: string, processId: string): Promise<void> => {
  await sql`INSERT INTO permission_grants (role, permission, scope) VALUES (${role}, ${"migrate"}, ${{ type: "process", config: { processId } }})`;
};

let n = 0;
const pid = () => `proc_http_studio_${++n}`;

const authoredBody = (label: string) => ({
  key: "wf",
  label: { en: label },
  baseLocale: "en",
  fields: [],
  workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }] },
});

/** Unlike `authoredBody` (deliberately invalid — no exit — legal for a draft), this has an exit and publishes cleanly. */
const publishableBody = (label: string, fields: { id: string; key: string; label: { en: string }; type: string }[] = []) => ({
  key: "wf",
  label: { en: label },
  baseLocale: "en",
  fields,
  workflow: {
    initialStep: "step_a",
    steps: [
      { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
      { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
    ],
  },
});

/** A dataSources entry of type "instance.query" naming `targetProcessId`, on an otherwise-publishable body. */
const instanceQueryDraftBody = (targetProcessId: string) => ({
  key: "wf",
  label: { en: "IQ Draft" },
  baseLocale: "en",
  fields: [],
  dataSources: [{ id: "ds_iq", key: "iq", type: "instance.query", config: { processId: targetProcessId, labelFieldId: "field_label" } }],
  workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
});

/** step_t: field_label, terminal. Published directly (bypassing HTTP) as the instance.query target. */
const instanceQueryTargetBody = () => ({
  key: "iq_target",
  label: { en: "IQ Target" },
  baseLocale: "en",
  fields: [{ id: "field_label", key: "label", label: { en: "Label" }, type: "string" }],
  workflow: { initialStep: "step_t", steps: [{ id: "step_t", key: "t", label: { en: "T" }, type: "task", terminal: true }] },
});

/** A running instance pinned to a published version, its body resolved from the store so its hash matches the compiled pin — same pattern as migration.test.ts's `mkInstance`. */
const mkInstance = async (processId: ProcessId, version: number, data?: Record<string, unknown>) => {
  const body = (await createDefinitionStore(sql).resolveBody(processId, version))!;
  return createInstance(body, { processId, version, ...(data ? { data: data as never } : {}) }, sql);
};

// ============================================================
// GET /drafts
// ============================================================

test.skipIf(!DB)("GET /drafts with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request("http://x/drafts"));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /drafts without system:developer maps to 403", async () => {
  const res = await fetch(authedReq("http://x/drafts", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /drafts with system:developer succeeds", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq("http://x/drafts", "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { processId: string }[];
  expect(body.map((d) => d.processId)).toContain(processId);
});

// ============================================================
// GET /drafts/:processId
// ============================================================

test.skipIf(!DB)("GET /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /drafts/:processId without system:developer maps to 403", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "GET", bystander));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /drafts/:processId for an absent draft maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "GET", developer));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("a developer reads and writes a draft", async () => {
  const processId = pid();
  const putRes = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  expect(putRes.status).toBe(200);

  const getRes = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", developer));
  expect(getRes.status).toBe(200);
  const body = (await getRes.json()) as { body: { label: { en: string } }; revision: number; updatedBy: string };
  expect(body.body.label.en).toBe("v1");
  expect(body.revision).toBe(0);
  expect(body.updatedBy).toBe(developer.id);
});

test.skipIf(!DB)("a developer's draft response reports canPlanMigration true", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", developer));
  const body = (await res.json()) as { canPlanMigration: boolean };
  expect(body.canPlanMigration).toBe(true);
});

test.skipIf(!DB)("an author with no matching grant sees canPlanMigration false", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", author, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", author));
  const body = (await res.json()) as { canPlanMigration: boolean };
  expect(body.canPlanMigration).toBe(false);
});

test.skipIf(!DB)("an author with a matching grant sees canPlanMigration true", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", financeAuthor, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  await grantMigrate("finance-authors", processId);

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", financeAuthor));
  const body = (await res.json()) as { canPlanMigration: boolean };
  expect(body.canPlanMigration).toBe(true);
});

// ============================================================
// PUT /drafts/:processId
// ============================================================

test.skipIf(!DB)("PUT /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`, { method: "PUT", body: "{}" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("PUT /drafts/:processId without system:developer maps to 403 and writes nothing", async () => {
  const processId = pid();
  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", bystander, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a malformed envelope maps to 400", async () => {
  const processId = pid();
  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: [], layout: {}, revision: 0 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a stale-revision PUT maps to 409 and leaves the stored row unchanged", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v2"), layout: {}, revision: 0 })); // -> revision 1

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v3"), layout: {}, revision: 0 }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("draft-conflict");

  const stored = (await sql`SELECT body, revision FROM drafts WHERE process_id = ${processId}`) as { body: { label: { en: string } }; revision: number }[];
  expect(stored[0]!.revision).toBe(1);
  expect(stored[0]!.body.label.en).toBe("v2");
});

// ============================================================
// DELETE /drafts/:processId
// ============================================================

test.skipIf(!DB)("DELETE /drafts/:processId with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}`, { method: "DELETE" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("DELETE /drafts/:processId without system:developer maps to 403 and deletes nothing", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", bystander));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(1);
});

test.skipIf(!DB)("DELETE /drafts/:processId with system:developer removes the draft", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", developer));
  expect(res.status).toBe(204);

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("DELETE /drafts/:processId for a process with no draft maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}`, "DELETE", developer));
  expect(res.status).toBe(404);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-found");
});

// ============================================================
// POST /drafts/:processId/publish
// ============================================================

test.skipIf(!DB)("POST /drafts/:processId/publish with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/drafts/${pid()}/publish`, { method: "POST" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("POST /drafts/:processId/publish without system:developer maps to 403, even holding system:publish", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publishOnly));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("POST /drafts/:processId/publish without system:publish maps to 403, even holding system:developer", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", developer));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("an author holding a grant publishes their own process without system:publish", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", financeAuthor, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await grantPublish("finance-authors", processId);

  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", financeAuthor));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { version: number };
  expect(body.version).toBe(1);
});

test.skipIf(!DB)("that same grant publishes no other process", async () => {
  const grantedProcessId = pid();
  const otherProcessId = pid();
  await fetch(authedReq(`http://x/drafts/${grantedProcessId}`, "PUT", financeAuthor, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${otherProcessId}`, "PUT", financeAuthor, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await grantPublish("finance-authors", grantedProcessId);

  const res = await fetch(authedReq(`http://x/drafts/${otherProcessId}/publish`, "POST", financeAuthor));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("a grant carries no authoring role: a grant holder with neither system:author nor system:developer still gets 403", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await grantPublish("finance-authors", processId);

  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", financeGrantOnly));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("publishing a process with no draft maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/drafts/${pid()}/publish`, "POST", publisher));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("a successful publish stamps base_version, leaves revision unchanged, and returns the new version", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { processId: string; version: number; definitionHash: string; status: string };
  expect(body.processId).toBe(processId);
  expect(body.version).toBe(1);
  expect(body.status).toBe("published");

  const stored = (await sql`SELECT base_version, revision FROM drafts WHERE process_id = ${processId}`) as { base_version: number | null; revision: number }[];
  expect(stored[0]!.base_version).toBe(1);
  expect(stored[0]!.revision).toBe(0);
});

test.skipIf(!DB)("a second publish after further edits updates base_version to the latest", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 1

  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v2"), layout: {}, revision: 0 })); // -> revision 1
  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 2
  expect(res.status).toBe(200);
  const body = (await res.json()) as { version: number };
  expect(body.version).toBe(2);

  const stored = (await sql`SELECT base_version FROM drafts WHERE process_id = ${processId}`) as { base_version: number | null }[];
  expect(stored[0]!.base_version).toBe(2);
});

test.skipIf(!DB)("a successful publish carries findings in its response body", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));

  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { findings: unknown[] };
  expect(body.findings).toEqual([]);
});

test.skipIf(!DB)("publishing a draft carrying an instance.query source without a read grant on its target fails with an authorization error", async () => {
  const targetId = pid();
  await publishBody(targetId as ProcessId, instanceQueryTargetBody() as unknown as ProcessBody, reg, dataSourceReg);

  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: instanceQueryDraftBody(targetId), layout: {}, revision: 0 }));

  // authorPublisher: AUTHOR_ROLE + PUBLISH_ROLE, no ADMIN_ROLE and no grant row.
  const res = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", authorPublisher));
  expect(res.status).toBe(403);
  const errBody = (await res.json()) as { error: { type: string } };
  expect(errBody.error.type).toBe("authorization");
});

// ============================================================
// GET /processes/:processId/versions/:version
// ============================================================

test.skipIf(!DB)("GET /processes/:processId/versions/:version with no resolvable credential maps to 401", async () => {
  const res = await fetch(new Request(`http://x/processes/${pid()}/versions/1`));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("GET /processes/:processId/versions/:version without system:developer maps to 403, even though the metadata sibling requires no role", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  const versionRes = await fetch(authedReq(`http://x/processes/${processId}/versions/1`, "GET", bystander));
  expect(versionRes.status).toBe(403);

  const metadataRes = await fetch(authedReq(`http://x/processes/${processId}/versions`, "GET", bystander));
  expect(metadataRes.status).toBe(200);
});

test.skipIf(!DB)("GET /processes/:processId/versions/:version returns the compiled body for a published version", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  const res = await fetch(authedReq(`http://x/processes/${processId}/versions/1`, "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { key: string; label: { en: string } };
  expect(body.key).toBe("wf");
  expect(body.label.en).toBe("v1");
});

test.skipIf(!DB)("GET /processes/:processId/versions/:version for a version never published maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/processes/${pid()}/versions/1`, "GET", developer));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("GET /processes/:processId/versions/:version with a non-numeric version maps to 400", async () => {
  const res = await fetch(authedReq(`http://x/processes/${pid()}/versions/abc`, "GET", developer));
  expect(res.status).toBe(400);
});

// ============================================================
// GET/PUT /migration-plans/:processId/:fromVersion/:toVersion
// ============================================================

test.skipIf(!DB)("GET /migration-plans/... without system:developer maps to 403", async () => {
  const res = await fetch(authedReq(`http://x/migration-plans/${pid()}/1/2`, "GET", bystander));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("PUT /migration-plans/... without system:developer maps to 403 and registers nothing", async () => {
  const processId = pid();
  const res = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", bystander, {}));
  expect(res.status).toBe(403);

  const rows = (await sql`SELECT 1 FROM migration_plans WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("GET /migration-plans/... for an unregistered key maps to 404", async () => {
  const res = await fetch(authedReq(`http://x/migration-plans/${pid()}/1/2`, "GET", developer));
  expect(res.status).toBe(404);
});

test.skipIf(!DB)("register-then-read round trip; re-registering an unapplied plan overwrites the spec", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 1
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v2"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 2

  const putRes = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", developer, {}));
  expect(putRes.status).toBe(200);

  const getRes = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "GET", developer));
  expect(getRes.status).toBe(200);
  const got = (await getRes.json()) as { appliedAt: string | null };
  expect(got.appliedAt).toBeNull();

  const putRes2 = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", developer, { transforms: {} }));
  expect(putRes2.status).toBe(200);
});

test.skipIf(!DB)("an author holding a scoped migrate grant registers and reads a plan without system:developer", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 1
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v2"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher)); // -> version 2
  await grantMigrate("finance-authors", processId);

  const putRes = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", financeAuthor, {}));
  expect(putRes.status).toBe(200);

  const getRes = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "GET", financeAuthor));
  expect(getRes.status).toBe(200);
});

test.skipIf(!DB)("registering a plan with fromVersion equal to toVersion maps to 409 migration-plan", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  const res = await fetch(authedReq(`http://x/migration-plans/${processId}/1/1`, "PUT", developer, {}));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("migration-plan");
});

test.skipIf(!DB)("registering against an already-applied plan is rejected", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v2"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", developer, {}));
  await migrateInstances(processId as ProcessId, 1, 2, sql); // no instances -> empty run, still freezes

  const res = await fetch(authedReq(`http://x/migration-plans/${processId}/1/2`, "PUT", developer, { transforms: {} }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("migration-plan");
});

// ============================================================
// GET /processes/:processId/versions/:version/orphan-keys
// ============================================================

test.skipIf(!DB)("GET .../orphan-keys without system:developer maps to 403", async () => {
  const res = await fetch(authedReq(`http://x/processes/${pid()}/versions/1/orphan-keys`, "GET", bystander));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET .../orphan-keys for an unpublished version maps to 409 migration-plan", async () => {
  const res = await fetch(authedReq(`http://x/processes/${pid()}/versions/1/orphan-keys`, "GET", developer));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("migration-plan");
});

test.skipIf(!DB)("GET .../orphan-keys for a clean published version returns an empty result", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  const res = await fetch(authedReq(`http://x/processes/${processId}/versions/1/orphan-keys`, "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { orphans: unknown[]; unreadable: string[] };
  expect(body.orphans).toEqual([]);
  expect(body.unreadable).toEqual([]);
});

test.skipIf(!DB)("an author holding a scoped migrate grant scans orphan keys without system:developer", async () => {
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));
  await grantMigrate("finance-authors", processId);

  const res = await fetch(authedReq(`http://x/processes/${processId}/versions/1/orphan-keys`, "GET", financeAuthor));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("GET .../orphan-keys reports an instance's data keys absent from the version's field catalog", async () => {
  const processId = pid();
  const fieldA = { id: "field_a", key: "a", label: { en: "A" }, type: "string" };
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("v1", [fieldA]), layout: {}, revision: 0 }));
  await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));

  const inst = await mkInstance(processId as ProcessId, 1, { field_a: "kept", field_ghost: "orphan" });

  const res = await fetch(authedReq(`http://x/processes/${processId}/versions/1/orphan-keys`, "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { orphans: { instanceId: string; keys: string[] }[] };
  expect(body.orphans).toEqual([{ instanceId: inst.instanceId, keys: ["field_ghost"] }]);
});

// ============================================================
// CORS preflight
// ============================================================

test("OPTIONS preflight on the drafts listing route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/drafts", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the drafts item route returns 204 permitting GET, PUT, DELETE", async () => {
  const res = await fetch(new Request("http://x/drafts/proc_x", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT, DELETE");
});

test("OPTIONS preflight on the draft publish route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/drafts/proc_x/publish", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the version-body route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/processes/proc_x/versions/1", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the migration-plans route returns 204 permitting GET, PUT", async () => {
  const res = await fetch(new Request("http://x/migration-plans/proc_x/1/2", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT");
});

test("OPTIONS preflight on the orphan-keys route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/processes/proc_x/versions/1/orphan-keys", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the registry route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/registry", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

// ============================================================
// GET /registry
// ============================================================

test.skipIf(!DB)("GET /registry lists the registered action, data-source and assignment type names for a developer", async () => {
  const res = await fetch(authedReq("http://x/registry", "GET", developer));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    actionTypes: string[];
    dataSourceTypes: string[];
    assignmentStrategyTypes: string[];
  };
  expect(body.actionTypes).toContain("http.request");
  expect(body.dataSourceTypes).toContain("static");
  expect(body.assignmentStrategyTypes).toContain("static");
  expect(body.assignmentStrategyTypes).toContain("org.manager-of-starter");
});

test.skipIf(!DB)("GET /registry keeps the type-name arrays to exactly those three keys' worth of type names", async () => {
  const res = await fetch(authedReq("http://x/registry", "GET", developer));
  const body = (await res.json()) as { actionTypes: string[]; dataSourceTypes: string[]; assignmentStrategyTypes: string[] };
  expect(body.actionTypes).toEqual(["http.request"]);
  expect(body.dataSourceTypes).toEqual(["static", INSTANCE_QUERY_DATA_SOURCE_TYPE]);
  // All three entries the shipped registry holds: the built-in `static`, and
  // the org-aware `org.manager-of-starter`/`org.group-members` the
  // composition root adds.
  expect(body.assignmentStrategyTypes).toEqual(["static", "org.manager-of-starter", "org.group-members"]);
});

test.skipIf(!DB)("GET /registry carries a config-schema description only for a schema-backed type", async () => {
  const res = await fetch(authedReq("http://x/registry", "GET", developer));
  const body = (await res.json()) as {
    actionSchemas: Record<string, unknown>;
    dataSourceSchemas: Record<string, unknown>;
    assignmentStrategySchemas: Record<string, unknown[]>;
  };
  // The test registry's own "http.request" and "static" data-source entries declare no
  // configSchema, so neither carries a description; the default assignment registry's
  // built-in "static" strategy does declare one.
  expect(body.actionSchemas).toEqual({});
  expect(body.dataSourceSchemas).toEqual({});
  expect(body.assignmentStrategySchemas.static).toEqual([{ key: "candidates", kind: "string-array", required: true }]);
  // org.manager-of-starter declares a strict empty config: a schema with no key,
  // which is what makes any authored key a publish error.
  expect(body.assignmentStrategySchemas["org.manager-of-starter"]).toEqual([]);
});

test.skipIf(!DB)("GET /registry without system:developer maps to 403", async () => {
  const res = await fetch(authedReq("http://x/registry", "GET", bystander));
  expect(res.status).toBe(403);
});

test("GET /registry with no resolvable credential is 401", async () => {
  const res = await fetch(new Request("http://x/registry"));
  expect(res.status).toBe(401);
});

// ============================================================
// PUT /drafts/:processId — baseVersion passthrough
// ============================================================

test.skipIf(!DB)("a PUT carrying baseVersion stamps it and the GET reports it", async () => {
  // The route-level half of the seeding path: drafts.ts is covered directly in
  // drafts.test.ts, but nothing there proves handleSaveDraft forwards the field.
  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", publisher, { body: publishableBody("v1"), layout: {}, revision: 0 }));
  const published = await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher));
  expect(published.status).toBe(200);
  await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", developer));

  const put = await fetch(
    authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("seeded"), layout: {}, revision: 0, baseVersion: 1 }),
  );
  expect(put.status).toBe(200);
  expect(((await put.json()) as { baseVersion: number | null }).baseVersion).toBe(1);

  const got = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", developer));
  expect(((await got.json()) as { baseVersion: number | null }).baseVersion).toBe(1);
});

test.skipIf(!DB)("a PUT with a malformed baseVersion maps to 400 and writes nothing", async () => {
  const processId = pid();
  const res = await fetch(
    authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0, baseVersion: 0 }),
  );
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("request-shape");

  const rows = (await sql`SELECT 1 FROM drafts WHERE process_id = ${processId}`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a PUT with an unresolvable baseVersion maps to 400", async () => {
  const processId = pid();
  const res = await fetch(
    authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: authoredBody("v1"), layout: {}, revision: 0, baseVersion: 9 }),
  );
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("request-shape");
});

// ============================================================
// /templates: the read asymmetry, the write gate, and the blast radius of the
// curating role (process-templates capability)
// ============================================================

const templateBody = (label: string) => ({ ...authoredBody(label), description: { en: `${label} description` } });

test.skipIf(!DB)("a curator writes a template and reads it back", async () => {
  const put = await fetch(authedReq("http://x/templates/approval", "PUT", curator, { body: templateBody("Approval"), layout: {} }));
  expect(put.status).toBe(200);

  const get = await fetch(authedReq("http://x/templates/approval", "GET", curator));
  expect(get.status).toBe(200);
  expect(((await get.json()) as { body: { label: { en: string } } }).body.label.en).toBe("Approval");
});

test.skipIf(!DB)("a developer reads templates but writes none", async () => {
  await fetch(authedReq("http://x/templates/approval", "PUT", curator, { body: templateBody("Approval"), layout: {} }));

  const list = await fetch(authedReq("http://x/templates", "GET", developer));
  expect(list.status).toBe(200);
  const rows = (await list.json()) as { templateKey: string; label: { en: string } }[];
  expect(rows).toHaveLength(1);
  expect(rows[0]!.label.en).toBe("Approval");
  // The list projects a label and carries no body: a body may reach the envelope bound.
  expect(rows[0]).not.toHaveProperty("body");

  const write = await fetch(authedReq("http://x/templates/other", "PUT", developer, { body: templateBody("Other"), layout: {} }));
  expect(write.status).toBe(403);
  const del = await fetch(authedReq("http://x/templates/approval", "DELETE", developer));
  expect(del.status).toBe(403);
});

test.skipIf(!DB)("an actor holding neither role reaches no template route", async () => {
  for (const [url, method] of [
    ["http://x/templates", "GET"],
    ["http://x/templates/approval", "GET"],
    ["http://x/templates/approval", "PUT"],
    ["http://x/templates/approval", "DELETE"],
  ] as const) {
    const body = method === "PUT" ? { body: templateBody("x"), layout: {} } : undefined;
    const res = await fetch(authedReq(url, method, bystander, body));
    expect(res.status).toBe(403);
  }
});

test.skipIf(!DB)("a request with no credential reaches no template route", async () => {
  const res = await fetch(new Request("http://x/templates", { method: "GET" }));
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("a curator reads a published version's body, the one source a template comes from", async () => {
  const processId = pid();
  const published = await fetch(
    authedReq(`http://x/drafts/${processId}`, "PUT", developer, { body: publishableBody("Seedable"), layout: {}, revision: 0 }),
  );
  expect(published.status).toBe(200);
  expect((await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", publisher))).status).toBe(200);

  const res = await fetch(authedReq(`http://x/processes/${processId}/versions/1`, "GET", curator));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { label: { en: string } }).label.en).toBe("Seedable");
});

test.skipIf(!DB)("a curator reaches no draft, no publish, no admin route and no reporting route", async () => {
  const processId = pid();
  expect((await fetch(authedReq("http://x/drafts", "GET", curator))).status).toBe(403);
  expect((await fetch(authedReq(`http://x/drafts/${processId}`, "GET", curator))).status).toBe(403);
  expect(
    (await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", curator, { body: authoredBody("v1"), layout: {}, revision: 0 })))
      .status,
  ).toBe(403);
  expect((await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", curator))).status).toBe(403);
  expect((await fetch(authedReq("http://x/registry", "GET", curator))).status).toBe(403);
  expect((await fetch(authedReq("http://x/admin/outbox", "GET", curator))).status).toBe(403);
  expect((await fetch(authedReq("http://x/reporting/processes", "GET", curator))).status).toBe(403);
});

test.skipIf(!DB)("neither the admin nor the reports role reaches a template write", async () => {
  for (const actor of [
    { id: "user_admin", roles: [ADMIN_ROLE] },
    { id: "user_reports", roles: [REPORTS_ROLE] },
  ] as Actor[]) {
    const res = await fetch(authedReq("http://x/templates/approval", "PUT", actor, { body: templateBody("x"), layout: {} }));
    expect(res.status).toBe(403);
  }
});

test.skipIf(!DB)("a GET for an unknown template maps to 404", async () => {
  const res = await fetch(authedReq("http://x/templates/absent", "GET", curator));
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("not-found");
});

test.skipIf(!DB)("a DELETE removes the template and a second one maps to 404", async () => {
  await fetch(authedReq("http://x/templates/approval", "PUT", curator, { body: templateBody("Approval"), layout: {} }));
  expect((await fetch(authedReq("http://x/templates/approval", "DELETE", curator))).status).toBe(204);
  expect((await fetch(authedReq("http://x/templates/approval", "DELETE", curator))).status).toBe(404);
});

test.skipIf(!DB)("a PUT with a non-object body maps to 400 and writes nothing", async () => {
  const res = await fetch(authedReq("http://x/templates/approval", "PUT", curator, { body: [1, 2], layout: {} }));
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("request-shape");

  const rows = (await sql`SELECT 1 FROM templates WHERE template_key = 'approval'`) as unknown[];
  expect(rows.length).toBe(0);
});

test.skipIf(!DB)("a PUT under a key outside the slug grammar maps to 400", async () => {
  const res = await fetch(authedReq("http://x/templates/Not%20A%20Slug", "PUT", curator, { body: templateBody("x"), layout: {} }));
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: { type: string } }).error.type).toBe("request-shape");
});

/* --------------------------------------------------- the author role's reach
 * `system:author` admits the no-code authoring subset and nothing beyond it.
 * These pair with the `system:developer` cases above: no route below loses a
 * developer, and none of them gains a curator.
 */

test.skipIf(!DB)("an author reads and writes a draft", async () => {
  const processId = pid();
  const put = await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", author, { body: authoredBody("v1"), layout: {}, revision: 0 }));
  expect(put.status).toBe(200);
  const got = await fetch(authedReq(`http://x/drafts/${processId}`, "GET", author));
  expect(got.status).toBe(200);
  expect(((await got.json()) as { body: { label: { en: string } } }).body.label.en).toBe("v1");
  expect((await fetch(authedReq("http://x/drafts", "GET", author))).status).toBe(200);
  expect((await fetch(authedReq(`http://x/drafts/${processId}`, "DELETE", author))).status).toBe(204);
});

test.skipIf(!DB)("an author reads the registry, which drives the plugin-config form", async () => {
  const res = await fetch(authedReq("http://x/registry", "GET", author));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { actionTypes: string[] }).actionTypes).toContain("http.request");
});

test.skipIf(!DB)("an actor holding neither authoring role reaches no registry", async () => {
  expect((await fetch(authedReq("http://x/registry", "GET", bystander))).status).toBe(403);
  expect((await fetch(authedReq("http://x/registry", "GET", curator))).status).toBe(403);
});

test.skipIf(!DB)("an author reaches no migration route, while a developer still does", async () => {
  const processId = pid();
  const plan = `http://x/migration-plans/${processId}/1/2`;
  const orphans = `http://x/processes/${processId}/versions/1/orphan-keys`;
  expect((await fetch(authedReq(plan, "GET", author))).status).toBe(403);
  expect((await fetch(authedReq(plan, "PUT", author, { fieldMap: {} }))).status).toBe(403);
  expect((await fetch(authedReq(orphans, "GET", author))).status).toBe(403);
  // The developer keeps every one of them: 404 and 200 both mean the gate passed.
  expect((await fetch(authedReq(plan, "GET", developer))).status).toBe(404);
});

test.skipIf(!DB)("an author publishes only with the publish role", async () => {
  const processId = pid();
  expect(
    (await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", author, { body: publishableBody("Authored"), layout: {}, revision: 0 })))
      .status,
  ).toBe(200);
  expect((await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", author))).status).toBe(403);
  expect((await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", authorPublisher))).status).toBe(200);
});

test.skipIf(!DB)("an author reads the templates and a published version body, and writes no template", async () => {
  await fetch(authedReq("http://x/templates/approval", "PUT", curator, { body: templateBody("Approval"), layout: {} }));
  expect((await fetch(authedReq("http://x/templates", "GET", author))).status).toBe(200);
  expect((await fetch(authedReq("http://x/templates/approval", "GET", author))).status).toBe(200);
  expect(
    (await fetch(authedReq("http://x/templates/other", "PUT", author, { body: templateBody("x"), layout: {} }))).status,
  ).toBe(403);
  expect((await fetch(authedReq("http://x/templates/approval", "DELETE", author))).status).toBe(403);

  const processId = pid();
  await fetch(authedReq(`http://x/drafts/${processId}`, "PUT", author, { body: publishableBody("Seedable"), layout: {}, revision: 0 }));
  expect((await fetch(authedReq(`http://x/drafts/${processId}/publish`, "POST", authorPublisher))).status).toBe(200);
  expect((await fetch(authedReq(`http://x/processes/${processId}/versions/1`, "GET", author))).status).toBe(200);
});

test.skipIf(!DB)("an author reads the data list keys the picker offers, and writes none", async () => {
  // The read is what fills the `"db.list"` picker in the data source panel.
  expect((await fetch(authedReq("http://x/admin/data-lists", "GET", author))).status).toBe(200);
  const write = await fetch(authedReq("http://x/admin/data-lists/cost_centres/values", "PUT", author, { values: [] }));
  expect(write.status).toBe(403);
  // The maintainer still writes, and the developer still reads.
  expect((await fetch(authedReq("http://x/admin/data-lists", "GET", developer))).status).toBe(200);
  expect((await fetch(authedReq("http://x/admin/data-lists", "GET", { id: "user_dl", roles: [DATALISTS_ROLE] } as Actor))).status).toBe(200);
});

test.skipIf(!DB)("an author reaches no other admin route and no reporting route", async () => {
  expect((await fetch(authedReq("http://x/admin/outbox", "GET", author))).status).toBe(403);
  expect((await fetch(authedReq("http://x/admin/users", "GET", author))).status).toBe(403);
  expect((await fetch(authedReq("http://x/reporting/processes", "GET", author))).status).toBe(403);
});
