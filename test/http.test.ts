/**
 * HTTP wrapper (src/http/): the five REST/JSON routes over the Runtime API
 * Layer. DB-backed (skips when DATABASE_URL is unset), following the same
 * pattern as test/runtime-api.test.ts. Calls the exported `fetch` handler
 * directly with `new Request(...)` — no real port, no network I/O.
 *
 * Actor is resolved via the injected ActorResolver (default: the dev
 * header-based resolver), from `X-Actor-Id`/`X-Actor-Roles` request headers —
 * not from a client-supplied `actor` field in the body/query anymore, since
 * this suite now also covers the auth-actor-assignment-claim change.
 */
import { readFileSync } from "node:fs";
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authHeaders, authedReq } from "./helpers/http-fixture.js";
import { clearInstanceAudit } from "./audit-cleanup.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { INSTANCE_QUERY_DATA_SOURCE_TYPE, createInstanceQueryDataSourceHandlerDef } from "../src/engine/instance-query-source.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { ConcurrencyConflict } from "../src/engine/transition.js";
import { createServer } from "../src/http/server.js";
import { mapError } from "../src/http/errors.js";
import { parseMaxAttachmentBytes, parseLimit } from "../src/http/routes.js";
import { MAX_LIST_LIMIT, MAX_RECORD_LIMIT } from "../src/runtime/api.js";
import { devHeaderResolver, type ActorResolver } from "../src/auth/resolve.js";
import { PUBLISH_ROLE, CANCEL_ANY_ROLE, ADMIN_ROLE, DEVELOPER_ROLE, type Permission } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const cel = (src: string) => ({ lang: "cel", src });
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
dataSourceReg.set("static", { resolve: async (ctx) => (ctx.config as { options: unknown[] }).options as never });
dataSourceReg.set(INSTANCE_QUERY_DATA_SOURCE_TYPE, createInstanceQueryDataSourceHandlerDef(200));
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, instance_drafts, definitions, permission_grants`;
  if (DB) await clearInstanceAudit();
});

// ============================================================
// Fixture bodies
// ============================================================

/** step_a: field_amount (required, number) --(path_ab, manual, guardless)--> step_b (terminal). */
const simpleBody = (): ProcessBody =>
  ({
    key: "simple_body",
    label: { en: "Simple Body" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_amount", required: true }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_x: field_approved (boolean) --(path_done, manual, guard: data.approved == true)--> step_done. */
const guardedBody = (): ProcessBody =>
  ({
    key: "guarded_body",
    label: { en: "Guarded Body" },
    baseLocale: "en",
    fields: [{ id: "field_approved", key: "approved", label: { en: "Approved" }, type: "boolean" }],
    workflow: {
      initialStep: "step_x",
      steps: [
        {
          id: "step_x",
          key: "x",
          label: { en: "X" },
          type: "task",
          view: { fields: [{ ref: "field_approved" }] },
          paths: [{ id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual", guard: cel("data.approved == true") }],
        },
        { id: "step_done", key: "done_step", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/**
 * step_a (manual, seeds field_marker) --> step_g <--> step_h, both single
 * guardless automatic paths — a non-terminating cascade. Same shape as
 * runtime-api.test.ts's cascadeLoopBody.
 */
const cascadeLoopBody = (): ProcessBody =>
  ({
    key: "cascade_loop_body",
    label: { en: "Cascade Loop Body" },
    baseLocale: "en",
    fields: [{ id: "field_marker", key: "marker", label: { en: "Marker" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_marker" }] },
          paths: [{ id: "path_ag", key: "ag", label: "Ag", to: "step_g", trigger: "manual" }],
        },
        { id: "step_g", key: "g", label: { en: "G" }, type: "task", paths: [{ id: "path_gh", key: "gh", label: "Gh", to: "step_h", trigger: "automatic" }] },
        { id: "step_h", key: "h", label: { en: "H" }, type: "task", paths: [{ id: "path_hg", key: "hg", label: "Hg", to: "step_g", trigger: "automatic" }] },
      ],
    },
  }) as unknown as ProcessBody;

/** Two divergent guardless manual paths off one step, both leading to a terminal step. Same shape as runtime-api.test.ts's twoPathsBody. */
const twoPathsBody = (): ProcessBody =>
  ({
    key: "two_paths_body",
    label: { en: "Two Paths Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          paths: [
            { id: "path_x", key: "x", label: "X", to: "step_x", trigger: "manual" },
            { id: "path_y", key: "y", label: "Y", to: "step_y", trigger: "manual" },
          ],
        },
        { id: "step_x", key: "x_step", label: { en: "X" }, type: "task", terminal: true },
        { id: "step_y", key: "y_step", label: { en: "Y" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_a --(path_admin, manual, guard: 'admin' in actor.roles)--> step_admin (terminal). */
const roleGuardedBody = (): ProcessBody =>
  ({
    key: "role_guarded_body",
    label: { en: "Role Guarded Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          paths: [{ id: "path_admin", key: "admin", label: "Admin", to: "step_admin", trigger: "manual", guard: cel("'admin' in actor.roles") }],
        },
        { id: "step_admin", key: "admin_step", label: { en: "Admin" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_a (assigned to "approver"/"user_1"), initial --(path_ab, manual, guardless)--> step_b (terminal). */
const assignedBody = (): ProcessBody =>
  ({
    key: "assigned_body",
    label: { en: "Assigned Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["approver", "user_1"] } } },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const pid = (n: string) => n as ProcessId;

/** Writes a process-scoped grant directly, bypassing the admin route — that route's own behavior is covered in `test/http-admin.test.ts`. */
const grantRole = async (role: string, permission: Permission, processId: string): Promise<void> => {
  await sql`INSERT INTO permission_grants (role, permission, scope) VALUES (${role}, ${permission}, ${{ type: "process", config: { processId } }})`;
};



/** A POST request carrying auth headers plus a JSON body (defaulting to `{}` so route handlers that call req.json() unconditionally never see an empty body). */
const jsonReq = (url: string, method: string, actor: Actor, body: unknown = {}) =>
  new Request(url, {
    method,
    headers: { ...authHeaders(actor), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** A GET/no-body request carrying only auth headers (view, claim, release). */
const user1: Actor = { id: "user_1", roles: [] };
const financeAuthor: Actor = { id: "user_finance", roles: ["finance-authors"] };
/** Carries all three reserved roles, for the publish / cancel-any-instance / admin-gated routes this suite exercises as an administrator. */
const admin: Actor = { id: "user_admin", roles: [PUBLISH_ROLE, CANCEL_ANY_ROLE, ADMIN_ROLE] };
/** Neither the reserved role nor (in these tests) the instance's starter — a plain third party. */
const bystander: Actor = { id: "user_bystander", roles: [] };
/** system:developer, no system:admin — for the record route's developer-and-starter bypass. */
const developer: Actor = { id: "user_developer", roles: [DEVELOPER_ROLE] };
/** PUBLISH_ROLE alone, no ADMIN_ROLE — passes the route's own publish gate but holds no read grant on any process, for instance.query's publish-time read-grant check. */
const publisherNoRead: Actor = { id: "user_publisher_no_read", roles: [PUBLISH_ROLE] };

// ============================================================
// Happy path per route
// ============================================================

test.skipIf(!DB)("POST /processes/:processId/instances creates an instance and returns 201", async () => {
  const PID = pid("proc_http_create");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { instanceId: string; currentStepId: string };
  expect(body.currentStepId).toBe("step_a");
  expect(body.instanceId).toMatch(/^inst_/);
});

test.skipIf(!DB)("POST /processes/:processId/instances with a data seed reflects it in the created Instance", async () => {
  const PID = pid("proc_http_create_seed");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { data: { field_amount: 7 } }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: Record<string, unknown> };
  expect(body.data).toEqual({ field_amount: 7 });
});

test.skipIf(!DB)("POST /processes/:processId/instances with an explicit version pins to it, not the newest", async () => {
  const PID = pid("proc_http_create_version");
  const v1 = await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const v2 = await publishBody(PID, guardedBody(), reg, dataSourceReg); // a distinct body -> assigns v2
  expect(v2.version).toBe(v1.version + 1);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { version: v1.version }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { version: number; currentStepId: string };
  expect(body.version).toBe(v1.version);
  expect(body.currentStepId).toBe("step_a"); // simpleBody's initial step, not guardedBody's step_x
});

test.skipIf(!DB)("GET /instances/:instanceId resolves a view and returns 200", async () => {
  const PID = pid("proc_http_view");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1));
  expect(res.status).toBe(200);
  const view = (await res.json()) as { step: { key: string }; status: string; availablePaths: unknown[] };
  expect(view.step.key).toBe("a");
  expect(view.status).toBe("running");
  expect(view.availablePaths).toEqual([{ id: "path_ab", key: "ab", label: "Ab" }]);
});

test.skipIf(!DB)("GET /instances/:instanceId resolves a dataSource-bound field's options", async () => {
  const PID = pid("proc_http_ds_view");
  const dsFieldBody = {
    key: "ds_view_body",
    label: { en: "DS View Body" },
    baseLocale: "en",
    fields: [{ id: "field_country", key: "country", label: { en: "Country" }, type: "string", dataSource: "ds_countries" }],
    dataSources: [{ id: "ds_countries", key: "countries", type: "static", config: { options: [{ value: "us", label: { en: "United States" } }] } }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", view: { fields: [{ ref: "field_country" }] }, terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  await publishBody(PID, dsFieldBody, reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1));
  expect(res.status).toBe(200);
  const view = (await res.json()) as { fields: { field: { key: string }; options?: { value: string; label: { en: string } }[] }[] };
  const country = view.fields.find((f) => f.field.key === "country")!;
  expect(country.options).toEqual([{ value: "us", label: { en: "United States" } }]);
});

test.skipIf(!DB)("POST /instances/:instanceId/submit commits a transition and returns 200", async () => {
  const PID = pid("proc_http_submit");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { currentStepId: string; status: string };
  expect(body.currentStepId).toBe("step_b");
  expect(body.status).toBe("completed");
});

// ============================================================
// PUT /instances/:instanceId/draft
// ============================================================

test.skipIf(!DB)("PUT /instances/:instanceId/draft saves for the current claimant and returns 200 with updatedBy/updatedAt", async () => {
  const PID = pid("proc_http_draft_ok");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/draft`, "PUT", user1, { data: { field_amount: 3 } }));
  expect(res.status).toBe(200);
  const saved = (await res.json()) as { updatedBy: string; updatedAt: string };
  expect(saved.updatedBy).toBe(user1.id);
  expect(saved.updatedAt).toBeDefined();

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as {
    draft?: { data: Record<string, unknown> };
  };
  expect(view.draft?.data).toEqual({ field_amount: 3 });
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft with a non-object data body is 400, and stores nothing", async () => {
  const PID = pid("proc_http_draft_400");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/draft`, "PUT", user1, { data: "not-an-object" }));
  expect(res.status).toBe(400);

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as { draft?: unknown };
  expect(view.draft).toBeUndefined();
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft with no data field saves an empty draft", async () => {
  const PID = pid("proc_http_draft_default");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/draft`, "PUT", user1, {}));
  expect(res.status).toBe(200);

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as {
    draft?: { data: Record<string, unknown> };
  };
  expect(view.draft?.data).toEqual({});
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft with no resolvable credential short-circuits with 401, before saving", async () => {
  const PID = pid("proc_http_draft_401");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(
    new Request(`http://x/instances/${created.instanceId}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: {} }) }),
  );
  expect(res.status).toBe(401);
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft for a non-starter, non-admin actor on an assignment-less step is 403", async () => {
  const PID = pid("proc_http_draft_403");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/draft`, "PUT", bystander, { data: {} }));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft on a non-running instance is 409, InstanceNotRunningError", async () => {
  const PID = pid("proc_http_draft_409");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }));

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/draft`, "PUT", user1, { data: {} }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-not-running");
});

test.skipIf(!DB)("PUT /instances/:instanceId/draft on an unknown instance maps to 500, not 404", async () => {
  const res = await fetch(jsonReq("http://x/instances/inst_does_not_exist/draft", "PUT", user1, { data: {} }));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("internal");
});

test.skipIf(!DB)("GET /instances/:instanceId on a non-running (completed) instance still resolves, with no available paths", async () => {
  const PID = pid("proc_http_view_completed");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1));
  expect(res.status).toBe(200);
  const view = (await res.json()) as { status: string; availablePaths: unknown[] };
  expect(view.status).toBe("completed");
  expect(view.availablePaths).toEqual([]);
});

test.skipIf(!DB)("GET /instances/:instanceId for a third-party authenticated actor is 403 authorization, mirroring the record route", async () => {
  const PID = pid("proc_http_view_third_party");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /instances/:instanceId for a nonexistent instance, as an unrelated actor, is also 403 — non-disclosure", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist", "GET", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

// ============================================================
// Typed error mappings
// ============================================================

test.skipIf(!DB)("a submission validation failure maps to 422", async () => {
  const PID = pid("proc_http_422");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: "not-a-number" } }),
  );
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: unknown[] } };
  expect(body.error.type).toBe("validation");
  expect(body.error.issues).toEqual([{ kind: "type-mismatch", fieldId: "field_amount", expected: "number" }]);
});

test.skipIf(!DB)("a guard refusal maps to 409", async () => {
  const PID = pid("proc_http_409_guard");
  await publishBody(PID, guardedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_done", data: {} }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("guard-refused");
});

test("a concurrency conflict maps to 409", () => {
  // Unreachable through the HTTP surface itself: ConcurrencyConflict is only
  // raised by executeManualTransition racing a stale snapshot, a path
  // routes.ts never calls (submitAndTransition's own row lock serializes
  // concurrent HTTP submissions instead of racing) — see
  // runtime-api.test.ts's dedicated race test. errors.ts's mapping is a pure
  // function, so it is exercised directly.
  const result = mapError(new ConcurrencyConflict("inst_x", 3));
  expect(result).toEqual({ status: 409, body: { error: { type: "concurrency-conflict" } } });
});

test.skipIf(!DB)("a pin mismatch maps to 500 (via GET on a corrupted pin)", async () => {
  const PID = pid("proc_http_500_pin");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  await sql`UPDATE instances SET body = jsonb_set(body, '{definitionHash}', '"deadbeef"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  // ADMIN_ROLE, not user1: authorize-instance-access collapses a non-admin
  // caller's load failure (including a pin mismatch) into 403 authorization,
  // so only the admin path still surfaces the underlying 500.
  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", admin));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("internal");
});

test.skipIf(!DB)("an unknown instanceId maps to 500, not 404, for an ADMIN_ROLE caller", async () => {
  // ADMIN_ROLE: a non-admin caller now gets 403 authorization for a
  // nonexistent instance (non-disclosure), not 500 — see
  // "GET /instances/:instanceId for a nonexistent instance ... is also 403".
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist", "GET", admin));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string; message: string } };
  expect(body.error.type).toBe("internal");
  expect(body.error.message).toContain("inst_does_not_exist");
});

test.skipIf(!DB)("an unrecognized internal failure is 500 with no message, and is logged server-side with the method and path", async () => {
  const PID = pid("proc_http_fallback_500");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  // A deliberately broken dependency, not a mock: corrupt the persisted
  // currentStepId to a step id absent from the published body, so
  // `findStep`'s defensive (deliberately untyped) throw fires — a genuine
  // internal fault mapError has no typed mapping for, unlike NotFoundError.
  await sql`UPDATE instances SET body = jsonb_set(body, '{currentStepId}', '"step_does_not_exist"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", admin));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { type: string; message?: string } };
    expect(body.error.type).toBe("internal");
    expect(body.error.message).toBeUndefined(); // message-free, unlike the typed NotFoundError case above
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("GET");
    expect(logged).toContain(`/instances/${created.instanceId}`);
    expect(logged).toContain("step_does_not_exist"); // the actual fault, visible server-side only
  } finally {
    errorSpy.mockRestore();
  }
});

// ============================================================
// Request bodies are parsed, never cast (submit / create-instance)
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/submit with no pathId is a 400 request-shape, and writes nothing", async () => {
  const PID = pid("proc_http_submit_no_pathid");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { data: { field_amount: 10 } }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as { step: { key: string } };
  expect(view.step.key).toBe("a"); // unmoved
});

test.skipIf(!DB)("POST /instances/:instanceId/submit with a pathId but no data is accepted with an empty data, per the declared default", async () => {
  const PID = pid("proc_http_submit_no_data");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_x" }));
  expect(res.status).toBe(200); // not 500 (the pre-fix Object.keys(undefined) TypeError) and not 400
  const body = (await res.json()) as { currentStepId: string };
  expect(body.currentStepId).toBe("step_x");
});

test.skipIf(!DB)("POST /instances/:instanceId/submit with malformed JSON is a 400 request-shape, not a 500", async () => {
  const PID = pid("proc_http_submit_bad_json");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(
    new Request(`http://x/instances/${created.instanceId}/submit`, { method: "POST", headers: authHeaders(user1), body: "{not json" }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes/:processId/instances with malformed JSON is a 400 request-shape, not a 500", async () => {
  const PID = pid("proc_http_create_bad_json");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(new Request(`http://x/processes/${PID}/instances`, { method: "POST", headers: authHeaders(user1), body: "not json at all" }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes/:processId/instances with a non-integer version is a 400", async () => {
  const PID = pid("proc_http_create_bad_version_1");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { version: 1.5 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes/:processId/instances with a negative version is a 400", async () => {
  const PID = pid("proc_http_create_bad_version_2");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { version: -1 }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes/:processId/instances with version as a string is a 400", async () => {
  const PID = pid("proc_http_create_bad_version_3");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { version: "1" }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// AutomaticCascadeLoop -> 200 with faulted view
// ============================================================

test.skipIf(!DB)("a post-commit cascade loop surfaces as 200 with a faulted view, not an error", async () => {
  const PID = pid("proc_http_cascade_loop");
  await publishBody(PID, cascadeLoopBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, {
      pathId: "path_ag",
      data: { field_marker: "kept-despite-fault" },
    }),
  );
  expect(res.status).toBe(200);
  const view = (await res.json()) as { status: string };
  expect(view.status).toBe("faulted");
});

// ============================================================
// Actor resolution
// ============================================================

test.skipIf(!DB)("GET with no roles header defaults to []", async () => {
  const PID = pid("proc_http_roles_default");
  await publishBody(PID, roleGuardedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1));
  const view = (await res.json()) as { availablePaths: unknown[] };
  expect(view.availablePaths).toEqual([]); // no roles -> guard 'admin' in actor.roles is false
});

test.skipIf(!DB)("GET roles header parses a comma-separated list", async () => {
  const PID = pid("proc_http_roles_multi");
  await publishBody(PID, roleGuardedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", { id: "user_1", roles: ["employee", "admin"] }));
  const view = (await res.json()) as { availablePaths: { key: string }[] };
  expect(view.availablePaths.map((p) => p.key)).toEqual(["admin"]);
});

test.skipIf(!DB)("a request with no X-Actor-Id header maps to 401, not processed", async () => {
  const PID = pid("proc_http_401");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await fetch(new Request(`http://x/processes/${PID}/instances`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  expect(res.status).toBe(401);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("actor-resolution");
});

test.skipIf(!DB)("an actor field in the request body is ignored; the resolved header-actor is authoritative", async () => {
  const PID = pid("proc_http_body_actor_ignored");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  // user1's headers resolve the actor; the body's conflicting `actor` field must be ignored.
  const res = await fetch(
    jsonReq(`http://x/processes/${PID}/instances`, "POST", user1, { actor: { id: "someone_else", roles: ["admin"] } }),
  );
  expect(res.status).toBe(201);
  const created = (await res.json()) as { instanceId: string };

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as {
    step: { key: string };
  };
  expect(view.step.key).toBe("a"); // created and readable under user1, proving the body's actor was never used
});

test.skipIf(!DB)("POST /instances/:instanceId/claim on a step with no declared assignment maps to 403 not-assigned", async () => {
  const PID = pid("proc_http_claim_403_unassigned");
  await publishBody(PID, simpleBody(), reg, dataSourceReg); // step_a declares no assignment
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-assigned");
});

test.skipIf(!DB)("an injected fake resolver is honored instead of the default dev header resolver", async () => {
  const PID = pid("proc_http_fake_resolver");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const fakeResolver: ActorResolver = async () => ({ id: "fixed_actor", roles: [] });
  const fakeFetch = createServer(dataSourceReg, reg, sql, fakeResolver);

  // No auth headers at all — the fake resolver ignores the credential entirely.
  const res = await fakeFetch(new Request(`http://x/processes/${PID}/instances`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  expect(res.status).toBe(201);
});

// ============================================================
// CORS
// ============================================================

// Three explicitly-configured servers, one per mode, so each test states
// which configuration it exercises rather than depending on a default.
// `fetch` (the module-level default) stays unconfigured (undefined = no
// CORS headers) and is what every non-CORS test above already uses.
const corsFetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, "*");
const ALLOWED_ORIGIN = "https://app.example";
const DISALLOWED_ORIGIN = "https://evil.example";
const allowlistFetch = createServer(dataSourceReg, reg, sql, devHeaderResolver, [ALLOWED_ORIGIN]);

const withOrigin = (req: Request, origin: string): Request => {
  const copy = new Request(req);
  copy.headers.set("Origin", origin);
  return copy;
};

test.skipIf(!DB)("wildcard config: a normal response carries the CORS allow-origin header", async () => {
  const PID = pid("proc_http_cors_normal");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);

  const res = await corsFetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test.skipIf(!DB)("wildcard config: an error response also carries the CORS allow-origin header", async () => {
  // admin: a non-admin caller now gets 403 for a nonexistent instance
  // (authorize-instance-access); this test wants the ordinary 500
  // not-found mapping as its error fixture, unrelated to CORS.
  const res = await corsFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", admin));
  expect(res.status).toBe(500);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test.skipIf(!DB)("wildcard config: no Vary header, since the response does not depend on the request origin", async () => {
  const res = await corsFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
  expect(res.headers.get("Vary")).toBeNull();
});

test.skipIf(!DB)("unset config (the default): no allow-origin header, but status and body are unchanged", async () => {
  const withCors = await corsFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
  const withoutCors = await fetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
  expect(withoutCors.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(withoutCors.status).toBe(withCors.status);
  expect(await withoutCors.json()).toEqual(await withCors.json());
});

test.skipIf(!DB)("allowlist config: an allowed origin is echoed back with Vary: Origin", async () => {
  const req = withOrigin(authedReq("http://x/instances/inst_does_not_exist", "GET", user1), ALLOWED_ORIGIN);
  const res = await allowlistFetch(req);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  expect(res.headers.get("Vary")).toBe("Origin");
});

test.skipIf(!DB)("allowlist config: a disallowed origin gets no allow-origin header, but still Vary: Origin", async () => {
  const req = withOrigin(authedReq("http://x/instances/inst_does_not_exist", "GET", user1), DISALLOWED_ORIGIN);
  const res = await allowlistFetch(req);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(res.headers.get("Vary")).toBe("Origin");
});

test.skipIf(!DB)("allowlist config: a request with no Origin header still executes normally", async () => {
  // admin: see the wildcard-config error-response test above for why.
  const res = await allowlistFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", admin));
  expect(res.status).toBe(500); // the ordinary "instance not found" mapping, unaffected by CORS
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("wildcard config: OPTIONS preflight on the create-instance route returns 204 with CORS headers, without creating an instance", async () => {
  const res = await corsFetch(new Request("http://x/processes/proc_x/instances", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the get-instance-view route returns 204 with CORS headers", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the submit route returns 204 with CORS headers, without submitting", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/submit", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the claim route returns 204 with CORS headers, without claiming", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/claim", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the release route returns 204 with CORS headers, without releasing", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/release", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the delegate route returns 204 with CORS headers, without delegating", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/delegate", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the comments route returns 204 with CORS headers, without posting or listing", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/comments", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the attachments collection route returns 204 with CORS headers, without uploading or listing", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/attachments", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("wildcard config: OPTIONS preflight on the attachment item route returns 204 with CORS headers, without downloading", async () => {
  const res = await corsFetch(new Request("http://x/instances/inst_x/attachments/attachment_x", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("allowlist config: an allowed-origin preflight echoes that origin", async () => {
  const req = withOrigin(new Request("http://x/instances/inst_x", { method: "OPTIONS" }), ALLOWED_ORIGIN);
  const res = await allowlistFetch(req);
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("allowlist config: a disallowed-origin preflight is still 204 with methods/headers, but no allow-origin", async () => {
  const req = withOrigin(new Request("http://x/instances/inst_x", { method: "OPTIONS" }), DISALLOWED_ORIGIN);
  const res = await allowlistFetch(req);
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Actor-Id, X-Actor-Roles, Authorization");
});

test("unset config (the default): OPTIONS preflight is 204 with methods/headers, but no allow-origin", async () => {
  const res = await fetch(new Request("http://x/instances/inst_x", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

// ============================================================
// Assignment claim/release routes + enforcement error mappings
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/claim succeeds for an eligible candidate and returns 200", async () => {
  const PID = pid("proc_http_claim");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { assignment: { claimedBy: string } };
  expect(body.assignment.claimedBy).toBe("user_1");
});

test.skipIf(!DB)("POST /instances/:instanceId/claim by a non-candidate maps to 403 not-a-candidate", async () => {
  const PID = pid("proc_http_claim_403a");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", { id: "outsider", roles: [] }));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-a-candidate");
});

test.skipIf(!DB)("POST /instances/:instanceId/claim on an already-claimed step maps to 403 already-claimed", async () => {
  const PID = pid("proc_http_claim_403b");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", { id: "approver_2", roles: ["approver"] }));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("already-claimed");
});

test.skipIf(!DB)("POST /instances/:instanceId/release succeeds for the claimant and returns 200", async () => {
  const PID = pid("proc_http_release");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/release`, "POST", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { assignment: { claimedBy?: string } };
  expect(body.assignment.claimedBy).toBeUndefined();
});

test.skipIf(!DB)("POST /instances/:instanceId/release by a non-claimant maps to 403 not-claimant", async () => {
  const PID = pid("proc_http_release_403");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/release`, "POST", { id: "approver_2", roles: ["approver"] }));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-claimant");
});

test.skipIf(!DB)("POST /instances/:instanceId/delegate succeeds for the claimant and returns 200", async () => {
  const PID = pid("proc_http_delegate");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/delegate`, "POST", user1, { toActorId: "outsider" }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { assignment: { claimedBy: string } };
  expect(body.assignment.claimedBy).toBe("outsider");
});

test.skipIf(!DB)("POST /instances/:instanceId/delegate by a non-claimant maps to 403 not-claimant", async () => {
  const PID = pid("proc_http_delegate_403");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/delegate`, "POST", { id: "approver_2", roles: ["approver"] }, { toActorId: "outsider" }),
  );
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-claimant");
});

test.skipIf(!DB)("POST /instances/:instanceId/delegate with an unknown target maps to 422 unknown-delegate", async () => {
  const PID = pid("proc_http_delegate_422");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  // The delegator has to resolve in `auth_users` for the target check to run
  // at all. Without this row the deployment reads as external-IdP and any
  // target is accepted — which is what the 200 test above relies on.
  await sql`INSERT INTO auth_users (user_id, email, password_hash) VALUES (${user1.id}, ${"http-delegate-422@example.com"}, ${"x"})`;
  try {
    const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/delegate`, "POST", user1, { toActorId: "user_typo" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { type: string; message: string } };
    expect(body.error.type).toBe("unknown-delegate");
    expect(body.error.message).toContain("user_typo"); // names the target, so an operator sees which id was wrong
  } finally {
    await sql`DELETE FROM auth_users WHERE user_id = ${user1.id}`;
  }
});

test.skipIf(!DB)("POST /instances/:instanceId/delegate with a missing toActorId maps to 400 request-shape", async () => {
  const PID = pid("proc_http_delegate_400");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/delegate`, "POST", user1, {}));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// Comment routes
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/comments succeeds for an eligible candidate and returns 201", async () => {
  const PID = pid("proc_http_comment_post");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/comments`, "POST", user1, { text: "checked the amount" }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { actorId: string; text: string };
  expect(body.actorId).toBe("user_1");
  expect(body.text).toBe("checked the amount");
});

test.skipIf(!DB)("GET /instances/:instanceId/comments returns 200 with the posted comment", async () => {
  const PID = pid("proc_http_comment_list");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/comments`, "POST", user1, { text: "a note" }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/comments`, "GET", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { text: string }[] };
  expect(body.items).toHaveLength(1);
  expect(body.items[0]!.text).toBe("a note");
});

test.skipIf(!DB)("POST /instances/:instanceId/comments with empty text maps to 400 request-shape", async () => {
  const PID = pid("proc_http_comment_empty");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/comments`, "POST", user1, { text: "   " }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /instances/:instanceId/comments with over-length text maps to 400 request-shape", async () => {
  const PID = pid("proc_http_comment_toolong");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/comments`, "POST", user1, { text: "x".repeat(10_001) }));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("an actor with no relation to the instance gets 403 on both comment routes", async () => {
  const PID = pid("proc_http_comment_403");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const postRes = await fetch(jsonReq(`http://x/instances/${created.instanceId}/comments`, "POST", bystander, { text: "should not land" }));
  expect(postRes.status).toBe(403);
  const listRes = await fetch(authedReq(`http://x/instances/${created.instanceId}/comments`, "GET", bystander));
  expect(listRes.status).toBe(403);
});

// ============================================================
// Attachment routes
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/attachments succeeds for an eligible candidate and returns 201 without data", async () => {
  const PID = pid("proc_http_attachment_post");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const dataBase64 = Buffer.from("receipt total: 42").toString("base64");
  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "receipt.txt", contentType: "text/plain", dataBase64 }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { actorId: string; filename: string; contentType: string; sizeBytes: number; data?: unknown };
  expect(body.actorId).toBe("user_1");
  expect(body.filename).toBe("receipt.txt");
  expect(body.contentType).toBe("text/plain");
  expect(body.sizeBytes).toBe(Buffer.from("receipt total: 42").length);
  expect(body.data).toBeUndefined();
});

test.skipIf(!DB)("GET /instances/:instanceId/attachments returns 200 with metadata only", async () => {
  const PID = pid("proc_http_attachment_list");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("a file").toString("base64");
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "a.txt", contentType: "text/plain", dataBase64 }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/attachments`, "GET", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: { filename: string; data?: unknown }[] };
  expect(body.items).toHaveLength(1);
  expect(body.items[0]!.filename).toBe("a.txt");
  expect(body.items[0]!.data).toBeUndefined();
});

test.skipIf(!DB)("GET /instances/:instanceId/attachments/:attachmentId returns 200 with the raw bytes and content-type", async () => {
  const PID = pid("proc_http_attachment_download");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("receipt total: 42").toString("base64");
  const uploaded = (await (
    await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "receipt.txt", contentType: "text/plain", dataBase64 }))
  ).json()) as { id: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/attachments/${uploaded.id}`, "GET", user1));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/plain");
  expect(await res.text()).toBe("receipt total: 42");
});

test.skipIf(!DB)("POST /instances/:instanceId/attachments over MAX_ATTACHMENT_BYTES maps to 400 request-shape", async () => {
  const PID = pid("proc_http_attachment_oversized");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  const dataBase64 = oversized.toString("base64");
  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "big.bin", contentType: "application/octet-stream", dataBase64 }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /instances/:instanceId/attachments with an over-length filename maps to 400 request-shape", async () => {
  const PID = pid("proc_http_attachment_longname");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const dataBase64 = Buffer.from("x").toString("base64");
  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "x".repeat(256), contentType: "text/plain", dataBase64 }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /instances/:instanceId/attachments with an over-length contentType maps to 400 request-shape", async () => {
  const PID = pid("proc_http_attachment_longtype");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const dataBase64 = Buffer.from("x").toString("base64");
  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "a.txt", contentType: "x".repeat(256), dataBase64 }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// A parameter, a CR and an LF are each outside the MIME token pair. The CR case
// is the one that used to reach `new Response()` and turn a download into a 500.
for (const [label, contentType] of [
  ["a parameter", "text/html; charset=utf-8"],
  ["a CRLF injection", "text/html\r\nX-Injected: 1"],
  ["a bare LF", "text/plain\nX-Injected: 1"],
  ["no subtype", "text-plain"],
  ["a leading space", " text/plain"],
] as const) {
  test.skipIf(!DB)(`POST /instances/:instanceId/attachments with a contentType holding ${label} maps to 400 request-shape`, async () => {
    const PID = pid(`proc_http_attachment_mime_${label.replace(/\W/g, "_")}`);
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

    const dataBase64 = Buffer.from("x").toString("base64");
    const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "a.txt", contentType, dataBase64 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("request-shape");
  });
}

test.skipIf(!DB)("POST /instances/:instanceId/attachments accepts a MIME type carrying the punctuation the token pair permits", async () => {
  const PID = pid("proc_http_attachment_mime_ok");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const dataBase64 = Buffer.from("<svg/>").toString("base64");
  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "d.svg", contentType: "image/svg+xml", dataBase64 }),
  );
  expect(res.status).toBe(201);
  expect(((await res.json()) as { contentType: string }).contentType).toBe("image/svg+xml");
});

test("parseMaxAttachmentBytes throws on a value that is not a positive integer, naming the variable", () => {
  for (const bad of ["5MB", "0", "-1", "1.5", "", "abc"]) {
    expect(() => parseMaxAttachmentBytes(bad)).toThrow("MAX_ATTACHMENT_BYTES");
  }
  expect(parseMaxAttachmentBytes(undefined)).toBe(5 * 1024 * 1024);
  expect(parseMaxAttachmentBytes("1024")).toBe(1024);
});

test.skipIf(!DB)("a download arrives as a file, not as a document: Content-Disposition and nosniff on a stored text/html", async () => {
  const PID = pid("proc_http_attachment_disposition");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("<script>alert(1)</script>").toString("base64");
  const uploaded = (await (
    await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "evil report.html", contentType: "text/html", dataBase64 }))
  ).json()) as { id: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/attachments/${uploaded.id}`, "GET", user1));
  expect(res.status).toBe(200);
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  // Percent-encoded, so a quote or a CR in a stored filename cannot open a
  // second header. The space becomes %20 as a consequence.
  expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="evil%20report.html"');
});

test.skipIf(!DB)("an actor with no relation to the instance gets 403 on all three attachment routes", async () => {
  const PID = pid("proc_http_attachment_403");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("visible to candidate").toString("base64");
  const uploaded = (await (
    await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", user1, { filename: "a.txt", contentType: "text/plain", dataBase64 }))
  ).json()) as { id: string };

  const postRes = await fetch(jsonReq(`http://x/instances/${created.instanceId}/attachments`, "POST", bystander, { filename: "b.txt", contentType: "text/plain", dataBase64 }));
  expect(postRes.status).toBe(403);
  const listRes = await fetch(authedReq(`http://x/instances/${created.instanceId}/attachments`, "GET", bystander));
  expect(listRes.status).toBe(403);
  const getRes = await fetch(authedReq(`http://x/instances/${created.instanceId}/attachments/${uploaded.id}`, "GET", bystander));
  expect(getRes.status).toBe(403);
});

test.skipIf(!DB)("downloading an attachment id that belongs to a different instance maps to 500", async () => {
  const PID = pid("proc_http_attachment_wronginstance");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const instA = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const instB = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const dataBase64 = Buffer.from("belongs to B").toString("base64");
  const uploadedOnB = (await (
    await fetch(jsonReq(`http://x/instances/${instB.instanceId}/attachments`, "POST", user1, { filename: "b.txt", contentType: "text/plain", dataBase64 }))
  ).json()) as { id: string };

  const res = await fetch(authedReq(`http://x/instances/${instA.instanceId}/attachments/${uploadedOnB.id}`, "GET", user1));
  expect(res.status).toBe(500);
});

// ============================================================
// InstanceNotRunningError -> 409 (submit/claim/release against a non-running instance)
// ============================================================

test.skipIf(!DB)("submitting to a cancelled instance maps to 409 instance-not-running and writes nothing", async () => {
  const PID = pid("proc_http_submit_cancelled");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }),
  );
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-not-running");

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as { status: string };
  expect(view.status).toBe("cancelled"); // unchanged; the submission wrote nothing
});

test.skipIf(!DB)("submitting to a faulted instance maps to 409 instance-not-running, every time", async () => {
  const PID = pid("proc_http_submit_faulted");
  await publishBody(PID, cascadeLoopBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const first = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ag", data: { field_marker: "x" } }),
  );
  expect(first.status).toBe(200); // AutomaticCascadeLoop -> faulted view, not an error response
  const view = (await first.json()) as { status: string };
  expect(view.status).toBe("faulted");

  for (let i = 0; i < 2; i++) {
    const retry = await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ag", data: {} }));
    expect(retry.status).toBe(409);
    const body = (await retry.json()) as { error: { type: string } };
    expect(body.error.type).toBe("instance-not-running");
  }
});

test.skipIf(!DB)("claiming a cancelled instance's step maps to 409 instance-not-running", async () => {
  const PID = pid("proc_http_claim_cancelled");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-not-running");
});

test.skipIf(!DB)("releasing a claim on a cancelled instance maps to 409 instance-not-running", async () => {
  const PID = pid("proc_http_release_cancelled");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/release`, "POST", user1));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-not-running");
});

test.skipIf(!DB)("delegating a claim on a cancelled instance maps to 409 instance-not-running", async () => {
  const PID = pid("proc_http_delegate_cancelled");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/delegate`, "POST", user1, { toActorId: "outsider" }));
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("instance-not-running");
});

test.skipIf(!DB)("submitting an unclaimed assigned step maps to 403 not-claimed", async () => {
  const PID = pid("proc_http_submit_403a");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: {} }));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-claimed");
});

test.skipIf(!DB)("submitting a step claimed by a different actor maps to 403 not-claimant", async () => {
  const PID = pid("proc_http_submit_403b");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", { id: "approver_2", roles: ["approver"] }, { pathId: "path_ab", data: {} }),
  );
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("not-claimant");
});

// ============================================================
// Async settle: book step over HTTP against the real expense-approval example
// ============================================================

test.skipIf(!DB)("happy path through expense-approval.json settles the async 'book' step via manual drain", async () => {
  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  const authored = raw.definition as ProcessBody;
  const expenseReg = createRegistry();
  expenseReg.set("http.request", { handler: async () => ({ body: { status: "booked" } }) });
  expenseReg.set("notification.email", { handler: async () => ({}) });
  const expenseFetch = createServer(dataSourceReg, expenseReg, sql, devHeaderResolver);

  const PID = pid("proc_http_expense");
  await publishBody(PID, authored, expenseReg, dataSourceReg);

  const amountField = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
  const reasonField = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002";
  const reviewNoteField = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003";
  const submitPath = "path_bbbb2222-0001-4a1c-8e2f-000000000001";
  const approvePath = "path_bbbb2222-0002-4a1c-8e2f-000000000002";
  const actor: Actor = { id: "user_demo", roles: ["employee", "finance-approver"] };

  const created = (await (await expenseFetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", actor))).json()) as { instanceId: string };

  // "capture" and "review" both declare an assignment (employee /
  // finance-approver respectively); user_demo holds both roles, but each
  // step still requires its own claim before submitAndTransition accepts it.
  await expenseFetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", actor));
  await expenseFetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", actor, {
      pathId: submitPath,
      data: { [amountField]: 42, [reasonField]: "Taxi" },
    }),
  );
  await expenseFetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", actor));
  const afterReview = (await (
    await expenseFetch(
      jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", actor, {
        pathId: approvePath,
        data: { [reviewNoteField]: "Looks fine" },
      }),
    )
  ).json()) as { status: string };
  expect(afterReview.status).toBe("running"); // parked at "book" until the async action settles

  const definitionStore = createDefinitionStore(sql);
  let view = (await (await expenseFetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", actor))).json()) as {
    step: { key: string };
    status: string;
  };
  for (let i = 0; i < 5 && view.status === "running" && view.step.key === "book"; i++) {
    await drainOutbox(sql, expenseReg);
    await drainResolutions(sql, definitionStore.resolveBody);
    view = (await (await expenseFetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", actor))).json()) as {
      step: { key: string };
      status: string;
    };
  }

  expect(view.status).toBe("completed");
});

// ============================================================
// GET /instances (listing)
// ============================================================

test.skipIf(!DB)("GET /instances with no query lists every instance, no data field", async () => {
  const PID = pid("proc_http_list_all");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));

  const res = await fetch(authedReq("http://x/instances", "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: Record<string, unknown>[]; cursor?: string };
  expect(page.items.length).toBe(3);
  for (const item of page.items) expect(item.data).toBeUndefined();
});

test.skipIf(!DB)("GET /instances?assignedTo=&status= lists an actor's inbox", async () => {
  const PID = pid("proc_http_list_inbox");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances?assignedTo=user_1&status=running`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("GET /instances?scope=mine returns the same instances as assignedTo=<actor.id> for the calling actor", async () => {
  const PID = pid("proc_http_list_scope_mine");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances?scope=mine`, "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("GET /instances?scope=mine cannot be used to see another actor's instances", async () => {
  const PID = pid("proc_http_list_scope_mine_isolated");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));

  // "approver" is a candidate on the same step-shape but never claimed this instance, and user_1 holds the claim.
  const res = await fetch(authedReq(`http://x/instances?scope=mine`, "GET", { id: "approver", roles: [] }));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).not.toContain(created.instanceId);
});

test.skipIf(!DB)("GET /instances?scope=mine&assignedTo=<other> is a 400 request error", async () => {
  const res = await fetch(authedReq(`http://x/instances?scope=mine&assignedTo=someone_else`, "GET", user1));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?scope=sideways is a 400 request error", async () => {
  const res = await fetch(authedReq(`http://x/instances?scope=sideways`, "GET", user1));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// scope=started: a participant finds a case they raised. The access half
// already worked — loadInstanceForActor admits the starter — so these cover
// the list half alone.

test.skipIf(!DB)("GET /instances?scope=started needs no role and lists the caller's own cases", async () => {
  const PID = pid("proc_http_scope_started");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances?scope=started`, "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toContain(created.instanceId);
});

test.skipIf(!DB)("GET /instances?scope=started never carries another actor's case", async () => {
  const PID = pid("proc_http_scope_started_isolated");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const mine = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const theirs = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { id: "user_2", roles: [] }))).json()) as {
    instanceId: string;
  };

  const res = await fetch(authedReq(`http://x/instances?scope=started`, "GET", user1));
  const page = (await res.json()) as { items: { instanceId: string }[] };
  const ids = page.items.map((i) => i.instanceId);
  expect(ids).toContain(mine.instanceId);
  expect(ids).not.toContain(theirs.instanceId);
});

test.skipIf(!DB)("GET /instances?scope=started carries a case assigned to somebody else", async () => {
  // The whole point of the scope: `assignedBody`'s step names "approver" and
  // "user_1" as candidates, so a case user_2 starts never reaches user_2's
  // own inbox. It still reaches their started list.
  const PID = pid("proc_http_scope_started_unassigned");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const starter: Actor = { id: "user_outsider", roles: [] };
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", starter))).json()) as { instanceId: string };

  const inbox = (await (await fetch(authedReq(`http://x/instances?scope=mine`, "GET", starter))).json()) as { items: { instanceId: string }[] };
  expect(inbox.items.map((i) => i.instanceId)).not.toContain(created.instanceId);

  const started = (await (await fetch(authedReq(`http://x/instances?scope=started`, "GET", starter))).json()) as {
    items: { instanceId: string }[];
  };
  expect(started.items.map((i) => i.instanceId)).toContain(created.instanceId);
});

test.skipIf(!DB)("GET /instances?scope=started carries a finished case", async () => {
  const PID = pid("proc_http_scope_started_finished");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const cancelled = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", user1));
  expect(cancelled.status).toBe(200);

  const res = await fetch(authedReq(`http://x/instances?scope=started`, "GET", user1));
  const page = (await res.json()) as { items: { instanceId: string; status: string }[] };
  const row = page.items.find((i) => i.instanceId === created.instanceId);
  expect(row?.status).toBe("cancelled");
});

test.skipIf(!DB)("GET /instances?scope=started&startedBy=<id> is a 400 request error", async () => {
  const res = await fetch(authedReq(`http://x/instances?scope=started&startedBy=someone_else`, "GET", user1));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?scope=started accepts an explicit assignedTo, which narrows rather than widens", async () => {
  // It reaches nothing outside what this caller started, so it needs no role.
  const PID = pid("proc_http_scope_started_assigned_to");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const wide = (await (await fetch(authedReq(`http://x/instances?scope=started`, "GET", user1))).json()) as { items: { instanceId: string }[] };
  expect(wide.items.map((i) => i.instanceId)).toContain(created.instanceId);

  const res = await fetch(authedReq(`http://x/instances?scope=started&assignedTo=nobody_at_all`, "GET", user1));
  expect(res.status).toBe(200);
  const narrow = (await res.json()) as { items: { instanceId: string }[] };
  expect(narrow.items.map((i) => i.instanceId)).not.toContain(created.instanceId);
});

test.skipIf(!DB)("GET /instances?status=running&status=cancelled widens the filter", async () => {
  const PID = pid("proc_http_list_multistatus");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const running = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const toCancel = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${toCancel.instanceId}/cancel`, "POST", admin));

  const res = await fetch(authedReq(`http://x/instances?status=running&status=cancelled`, "GET", admin));
  const page = (await res.json()) as { items: { instanceId: string }[] };
  const ids = page.items.map((i) => i.instanceId);
  expect(ids).toContain(running.instanceId);
  expect(ids).toContain(toCancel.instanceId);
});

test.skipIf(!DB)("GET /instances?limit=2 pages through more instances than the limit", async () => {
  const PID = pid("proc_http_list_paging");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  for (let i = 0; i < 5; i++) await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));

  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const url = new URL("http://x/instances");
    url.searchParams.set("limit", "2");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(authedReq(url.toString(), "GET", admin));
    const page = (await res.json()) as { items: { instanceId: string }[]; cursor?: string };
    for (const item of page.items) seen.add(item.instanceId);
    cursor = page.cursor;
    if (!cursor) break;
  }
  expect(seen.size).toBe(5);
  expect(cursor).toBeUndefined();
});

test.skipIf(!DB)("GET /instances?limit=abc is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?limit=abc", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?status=sideways is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?status=sideways", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// version / excludeInstanceId / createdAfter+Before / dataWhere
// (instance-query-core)
// ============================================================

test.skipIf(!DB)("GET /instances?processId=&version= filters by version, and omits an instance pinned to another version", async () => {
  const PID = pid("proc_http_list_version");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const onV1 = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await publishBody(PID, { ...simpleBody(), label: { en: "V2" } }, reg, dataSourceReg);
  const onV2 = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances?processId=${PID}&version=2`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toEqual([onV2.instanceId]);
  expect(page.items.map((i) => i.instanceId)).not.toContain(onV1.instanceId);
});

test.skipIf(!DB)("GET /instances?version=abc is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?processId=p1&version=abc", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// rebuild-instance-expression-indexes: the reported regression. Before that
// change the text comparison answered an empty 200 for a version past int4;
// after it, the `::int` bind raised and the wrapper answered 500 with no
// message. parseVersion bounds it, so both edges of the range stay a 400.
test.skipIf(!DB)("GET /instances?version= beyond int4 is a 400 request error, not a 500", async () => {
  for (const version of ["2147483648", "-2147483649", "99999999999"]) {
    const res = await fetch(authedReq(`http://x/instances?processId=p1&version=${version}`, "GET", admin));
    expect({ version, status: res.status }).toEqual({ version, status: 400 });
  }
});

test.skipIf(!DB)("GET /instances?version= at either int4 edge reaches the query and returns an empty page", async () => {
  for (const version of ["2147483647", "-2147483648"]) {
    const res = await fetch(authedReq(`http://x/instances?processId=p1&version=${version}`, "GET", admin));
    expect({ version, status: res.status }).toEqual({ version, status: 200 });
    const body = (await res.json()) as { items: unknown[] };
    expect({ version, items: body.items }).toEqual({ version, items: [] });
  }
});

test.skipIf(!DB)("GET /instances?version=2 with no processId is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?version=2", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?excludeInstanceId= omits the named instance, keeps every other matching instance", async () => {
  const PID = pid("proc_http_list_exclude");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const a = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const b = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances?excludeInstanceId=${a.instanceId}`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  const ids = page.items.map((i) => i.instanceId);
  expect(ids).not.toContain(a.instanceId);
  expect(ids).toContain(b.instanceId);
});

test.skipIf(!DB)("GET /instances?createdAfter=&createdBefore= bounds the page by creation time", async () => {
  const PID = pid("proc_http_list_created_window");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const outside = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const inside = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await sql`UPDATE instances SET created_at = '2026-01-01 00:00:00+00' WHERE instance_id = ${outside.instanceId}`;
  await sql`UPDATE instances SET created_at = '2026-06-01 00:00:00+00' WHERE instance_id = ${inside.instanceId}`;

  const url = `http://x/instances?processId=${PID}&createdAfter=2026-05-01T00:00:00Z&createdBefore=2026-07-01T00:00:00Z`;
  const res = await fetch(authedReq(url, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toEqual([inside.instanceId]);
});

test.skipIf(!DB)("GET /instances?createdAfter=yesterday is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?createdAfter=yesterday", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?createdBefore=not-a-date is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?createdBefore=not-a-date", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?dataWhere=... reaches no filter on the read — the route carries no dataWhere at all", async () => {
  const PID = pid("proc_http_list_datawhere_ignored");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances?processId=${PID}&dataWhere=anything`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: unknown[] };
  expect(page.items).toHaveLength(1);
});

// ============================================================
// A malformed pagination cursor is a client error
// ============================================================

test.skipIf(!DB)("GET /instances?cursor=%%% is a 400 request error, not a 500", async () => {
  const res = await fetch(authedReq("http://x/instances?cursor=%25%25%25", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances with a well-formed but wrong-arity cursor is a 400", async () => {
  // listInstances' cursor is a 2-tuple (createdAt, instanceId); this decodes
  // to valid JSON — a 1-element array — so only the arity check catches it.
  const wrongArity = Buffer.from(JSON.stringify(["only-one"])).toString("base64url");
  const res = await fetch(authedReq(`http://x/instances?cursor=${wrongArity}`, "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances with a cursor decoding to non-string elements is a 400", async () => {
  const wrongShape = Buffer.from(JSON.stringify([1, 2])).toString("base64url");
  const res = await fetch(authedReq(`http://x/instances?cursor=${wrongShape}`, "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances with a stale but well-formed cursor is still a valid request, answering an empty page", async () => {
  const PID = pid("proc_http_stale_cursor");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));

  // Well-formed, but points past the end of any real result set.
  const stale = Buffer.from(JSON.stringify([new Date(0).toISOString(), "inst_00000000-0000-0000-0000-000000000000"])).toString("base64url");
  const res = await fetch(authedReq(`http://x/instances?cursor=${stale}`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: unknown[] };
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("GET /admin/outbox?cursor=%%% behaves identically to the instance listing: 400, not 500", async () => {
  const res = await fetch(authedReq("http://x/admin/outbox?cursor=%25%25%25", "GET", admin));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// scope=all / omitted-scope tightening (system:admin required)
// ============================================================

test.skipIf(!DB)("GET /instances with an omitted scope, without system:admin, maps to 403 and performs no read", async () => {
  const res = await fetch(authedReq("http://x/instances", "GET", user1));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /instances?scope=all without system:admin maps to 403", async () => {
  const res = await fetch(authedReq("http://x/instances?scope=all", "GET", user1));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /instances?scope=all&processId=<P> admits a read grant holder over that process", async () => {
  const PID = pid("proc_http_list_read_grant");
  await grantRole("finance-authors", "read", PID);
  const res = await fetch(authedReq(`http://x/instances?scope=all&processId=${PID}`, "GET", financeAuthor));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("GET /instances?scope=all&processId=<P> refuses a read grant holder over another process", async () => {
  const PID = pid("proc_http_list_read_grant_scoped");
  const otherPid = pid("proc_http_list_read_grant_other");
  await grantRole("finance-authors", "read", PID);
  const res = await fetch(authedReq(`http://x/instances?scope=all&processId=${otherPid}`, "GET", financeAuthor));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /instances?scope=all with no processId refuses a read grant holder", async () => {
  const PID = pid("proc_http_list_read_grant_unnamed");
  await grantRole("finance-authors", "read", PID);
  const res = await fetch(authedReq("http://x/instances?scope=all", "GET", financeAuthor));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /instances?scope=all with system:admin succeeds", async () => {
  const PID = pid("proc_http_list_scope_all_admin");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));

  const res = await fetch(authedReq("http://x/instances?scope=all", "GET", admin));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("GET /instances?scope=mine succeeds without system:admin", async () => {
  const res = await fetch(authedReq("http://x/instances?scope=mine", "GET", user1));
  expect(res.status).toBe(200);
});

test.skipIf(!DB)("GET /instances with no resolvable credential is still 401, regardless of scope", async () => {
  const res = await fetch(new Request("http://x/instances"));
  expect(res.status).toBe(401);
});

// ============================================================
// includeDegraded visibility follows scope (see instance-query's
// "List instance summaries with filters" and http-wrapper's "List instances
// over HTTP" MODIFIED requirements)
// ============================================================

test.skipIf(!DB)("GET /instances?scope=mine never surfaces a degraded item, even for the caller's own unresolvable instance", async () => {
  const PID = pid("proc_http_scope_mine_no_degraded");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", user1));
  // No such version was ever published — out-of-band data drift, per proposal.md.
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(99)) WHERE instance_id = ${created.instanceId}`;

  const res = await fetch(authedReq("http://x/instances?scope=mine", "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: Record<string, unknown>[] };
  expect(page.items.some((i) => i.instanceId === created.instanceId)).toBe(false);
  expect(page.items.some((i) => i.degraded === true)).toBe(false);
});

test.skipIf(!DB)("GET /instances (admin scope) surfaces a degraded item for the same unresolvable instance", async () => {
  const PID = pid("proc_http_scope_all_degraded");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(99)) WHERE instance_id = ${created.instanceId}`;

  const res = await fetch(authedReq("http://x/instances", "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: Record<string, unknown>[] };
  const degraded = page.items.find((i) => i.instanceId === created.instanceId);
  expect(degraded).toBeDefined();
  expect(degraded?.degraded).toBe(true);
  expect(degraded?.reason).toBe("missing-definition");
  expect(degraded?.processLabel).toBeUndefined();
});

// ============================================================
// GET /instances/:instanceId/record
// ============================================================

test.skipIf(!DB)("GET /instances/:instanceId/record returns the merged, ordered record", async () => {
  const PID = pid("proc_http_record");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { kind: string }[] };
  expect(page.items.length).toBeGreaterThan(0);
  expect(page.items[0]!.kind).toBe("transition");
});

test.skipIf(!DB)("GET /instances/:instanceId/record for an unknown instance returns 200 with an empty sequence", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist/record", "GET", admin));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: unknown[] };
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("GET /instances/:instanceId/record without system:admin maps to 403 and performs no read", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist/record", "GET", user1));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("GET /instances/:instanceId/record succeeds for the instance's own developer starter, without system:admin", async () => {
  const PID = pid("proc_http_record_developer");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", developer))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", developer, { pathId: "path_ab", data: { field_amount: 10 } }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", developer));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { kind: string }[] };
  expect(page.items.length).toBeGreaterThan(0);
});

test.skipIf(!DB)("GET /instances/:instanceId/record is refused for a developer who did not start the instance", async () => {
  const PID = pid("proc_http_record_developer_not_starter");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", developer));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("GET /instances/:instanceId/record with no resolvable credential is 401, whether or not the instance exists", async () => {
  const res = await fetch(new Request("http://x/instances/inst_does_not_exist/record"));
  expect(res.status).toBe(401);
});

// ============================================================
// POST /instances/:instanceId/cancel
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/cancel cancels a running instance", async () => {
  const PID = pid("proc_http_cancel");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("cancelled");

  const record = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", admin))).json()) as {
    items: { kind: string; entry?: { cause: string } }[];
  };
  expect(record.items.some((i) => i.kind === "transition" && i.entry?.cause === "cancel")).toBe(true);
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel succeeds for an arbitrary actor id carrying the cancel-any role, recorded as the cancellation's cause", async () => {
  const PID = pid("proc_http_cancel_arbitrary_actor");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const arbitraryActor: Actor = { id: "totally_unrelated_actor", roles: [CANCEL_ANY_ROLE] };
  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", arbitraryActor));
  expect(res.status).toBe(200);

  const record = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", admin))).json()) as {
    items: { kind: string; entry?: { cause: string; actorId?: string } }[];
  };
  const cancelEntry = record.items.find((i) => i.kind === "transition" && i.entry?.cause === "cancel");
  expect(cancelEntry?.entry?.actorId).toBe("totally_unrelated_actor");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel on an already-cancelled instance stays cancelled", async () => {
  const PID = pid("proc_http_cancel_twice");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", admin));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("cancelled");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel with no resolvable credential maps to 401 and leaves the instance unchanged", async () => {
  const PID = pid("proc_http_cancel_401");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}/cancel`, { method: "POST" }));
  expect(res.status).toBe(401);

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as { status: string };
  expect(view.status).toBe("running");
});

// ============================================================
// POST /processes (publish) + GET /processes + GET /processes/:processId/versions
// ============================================================

const publishReq = (actor: Actor, processId: string, body: ProcessBody) => jsonReq("http://x/processes", "POST", actor, { processId, body });

/** step_a with an onEntry action of a caller-supplied type, guardless manual path to terminal step_b. */
const actionBody = (actionType: string): ProcessBody =>
  ({
    key: "action_body",
    label: { en: "Action Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          onEntry: [{ id: "action_x", type: actionType, config: {} }],
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_x --(path_done, manual, guard: an unparseable CEL expression)--> step_done. */
const brokenCelBody = (): ProcessBody =>
  ({
    key: "broken_cel_body",
    label: { en: "Broken CEL Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_x",
      steps: [
        { id: "step_x", key: "x", label: { en: "X" }, type: "task", paths: [{ id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual", guard: cel("data.approved ==") }] },
        { id: "step_done", key: "done_step", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** initialStep references a step id that does not exist in workflow.steps — an authored-schema violation. */
const structurallyInvalidBody = (): ProcessBody =>
  ({
    key: "invalid_body",
    label: { en: "Invalid Body" },
    baseLocale: "en",
    fields: [],
    workflow: { initialStep: "step_missing", steps: [] },
  }) as unknown as ProcessBody;

/** step_a carries an assignment strategy type other than "static" — the only supported type. */
const badAssignmentBody = (): ProcessBody =>
  ({
    key: "bad_assignment_body",
    label: { en: "Bad Assignment Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", assignment: { strategy: { type: "not_static", config: {} } }, terminal: true }],
    },
  }) as unknown as ProcessBody;

/** dataSources carries an entry of an unregistered type. */
const badDataSourceBody = (): ProcessBody =>
  ({
    key: "bad_data_source_body",
    label: { en: "Bad Data Source Body" },
    baseLocale: "en",
    fields: [],
    dataSources: [{ id: "ds_a", key: "a", type: "unregistered_ds_type", config: {} }],
    workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("POST /processes publishes a valid body and it is readable from the definition store", async () => {
  const PID = "proc_http_publish_ok";
  const res = await fetch(publishReq(admin, PID, simpleBody()));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { processId: string; version: number; definitionHash: string; status: string; findings: unknown[] };
  expect(body.version).toBe(1);
  expect(body.processId).toBe(PID);
  expect(body.findings).toEqual([]);

  const store = createDefinitionStore(sql);
  const resolved = await store.resolveBody(PID as ProcessId, 1);
  expect(resolved).toBeDefined();
});

/** step_r: a dataSources entry of type "instance.query" naming `targetProcessId`, plus a required labelFieldId of the reading body's own catalog (unused by the check, just schema-valid). */
const instanceQueryReaderBody = (targetProcessId: string): ProcessBody =>
  ({
    key: "iq_reader_body",
    label: { en: "IQ Reader" },
    baseLocale: "en",
    fields: [],
    dataSources: [{ id: "ds_iq", key: "iq", type: "instance.query", config: { processId: targetProcessId, labelFieldId: "field_label" } }],
    workflow: { initialStep: "step_r", steps: [{ id: "step_r", key: "r", label: { en: "R" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

/** step_t: field_label, terminal. Published directly (bypassing HTTP) as the instance.query target. */
const instanceQueryTargetBody = (): ProcessBody =>
  ({
    key: "iq_target_body",
    label: { en: "IQ Target" },
    baseLocale: "en",
    fields: [{ id: "field_label", key: "label", label: { en: "Label" }, type: "string" }],
    workflow: { initialStep: "step_t", steps: [{ id: "step_t", key: "t", label: { en: "T" }, type: "task", terminal: true }] },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("POST /processes: an actor with no read grant on an instance.query source's target fails with an authorization error", async () => {
  const TARGET = "proc_http_publish_iq_target";
  await publishBody(TARGET as ProcessId, instanceQueryTargetBody(), reg, dataSourceReg);

  const res = await fetch(publishReq(publisherNoRead, "proc_http_publish_iq_reader", instanceQueryReaderBody(TARGET)));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error?: { type?: string } };
  expect(body.error?.type).toBe("authorization");
});

test.skipIf(!DB)("POST /processes re-publishing an identical body returns the same version and hash", async () => {
  const PID = "proc_http_publish_idempotent";
  const first = (await (await fetch(publishReq(admin, PID, simpleBody()))).json()) as { version: number; definitionHash: string };
  const second = (await (await fetch(publishReq(admin, PID, simpleBody()))).json()) as { version: number; definitionHash: string };
  expect(second.version).toBe(first.version);
  expect(second.definitionHash).toBe(first.definitionHash);
});

test.skipIf(!DB)("POST /processes publishing a changed body assigns the next version", async () => {
  const PID = "proc_http_publish_v2";
  await fetch(publishReq(admin, PID, simpleBody()));
  const res = await fetch(publishReq(admin, PID, guardedBody()));
  const body = (await res.json()) as { version: number };
  expect(body.version).toBe(2);
});

test.skipIf(!DB)("POST /processes with a malformed JSON body maps to 400", async () => {
  const res = await fetch(
    new Request("http://x/processes", { method: "POST", headers: { ...authHeaders(admin), "content-type": "application/json" }, body: "{not json" }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes with an unregistered action type maps to 422 and names the offending action position", async () => {
  const res = await fetch(publishReq(admin, "proc_http_publish_422_registry", actionBody("nope.unregistered")));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("onEntry");
});

test.skipIf(!DB)("POST /processes with an unparseable guard expression maps to 422 and names the offending expression", async () => {
  const res = await fetch(publishReq(admin, "proc_http_publish_422_cel", brokenCelBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("cel-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("guard");
});

test.skipIf(!DB)("POST /processes with an unsupported assignment strategy type maps to 422 and names the offending position", async () => {
  const res = await fetch(publishReq(admin, "proc_http_publish_422_assignment", badAssignmentBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("assignment");
});

test.skipIf(!DB)("POST /processes with an unregistered data source type maps to 422 and names the offending position", async () => {
  const res = await fetch(publishReq(admin, "proc_http_publish_422_datasource", badDataSourceBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("dataSources");
});

test.skipIf(!DB)("POST /processes with an allowedGroups entry naming no group maps to 422 and names the offending group id", async () => {
  const body: ProcessBody = { ...simpleBody(), allowedGroups: ["group_ghost"] } as ProcessBody;
  const res = await fetch(publishReq(admin, "proc_http_publish_422_group_scope", body));
  expect(res.status).toBe(422);
  const resBody = (await res.json()) as { error: { type: string; issues: { groupId: string; reason: string }[] } };
  expect(resBody.error.type).toBe("group-scope-validation");
  expect(resBody.error.issues.length).toBeGreaterThan(0);
  expect(resBody.error.issues[0]!.groupId).toBe("group_ghost");
});

test.skipIf(!DB)("POST /processes without the system:publish role maps to 403 and persists nothing", async () => {
  const PID = "proc_http_publish_forbidden";
  const res = await fetch(publishReq(user1, PID, simpleBody()));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");

  const store = createDefinitionStore(sql);
  const resolved = await store.resolveBody(PID as ProcessId, 1);
  expect(resolved).toBeUndefined();
});

test.skipIf(!DB)("POST /processes: a grant admits a caller without system:publish, scoped to that process", async () => {
  const PID = "proc_http_publish_grant";
  await grantRole("finance-authors", "publish", PID);
  const res = await fetch(publishReq(financeAuthor, PID, simpleBody()));
  expect(res.status).toBe(200);

  const store = createDefinitionStore(sql);
  expect(await store.resolveBody(PID as ProcessId, 1)).toBeDefined();
});

test.skipIf(!DB)("POST /processes: that same grant admits no other process", async () => {
  const PID = "proc_http_publish_grant_scoped";
  const otherPid = "proc_http_publish_grant_other";
  await grantRole("finance-authors", "publish", PID);
  const res = await fetch(publishReq(financeAuthor, otherPid, simpleBody()));
  expect(res.status).toBe(403);

  const store = createDefinitionStore(sql);
  expect(await store.resolveBody(otherPid as ProcessId, 1)).toBeUndefined();
});

// The publish gate reads its target processId out of the body, so it runs
// after the parse and the shape check. These two pin both halves of that
// ordering: a well-formed body from an unauthorized caller still reads 403,
// and a malformed one reads 400 about the caller's own body.
test.skipIf(!DB)("POST /processes with a malformed body, without the role, maps to 400 and persists nothing", async () => {
  const PID = "proc_http_publish_malformed";
  const res = await fetch(
    new Request("http://x/processes", {
      method: "POST",
      headers: { ...authHeaders(user1), "content-type": "application/json" },
      body: "{not json",
    }),
  );
  expect(res.status).toBe(400);

  const store = createDefinitionStore(sql);
  expect(await store.resolveBody(PID as ProcessId, 1)).toBeUndefined();
});

test.skipIf(!DB)("POST /processes with a well-shaped body but no processId, without the role, maps to 400", async () => {
  const res = await fetch(jsonReq("http://x/processes", "POST", user1, { body: simpleBody() }));
  expect(res.status).toBe(400);
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel without the system:cancel-any role, by a non-starter, maps to 403 and leaves the instance unchanged", async () => {
  const PID = pid("proc_http_cancel_forbidden");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");

  const view = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1))).json()) as { status: string };
  expect(view.status).toBe("running");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel without the system:cancel-any role maps to 403 even for a nonexistent instance", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist/cancel", "POST", bystander));
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel authorizes the instance's own starter even without the system:cancel-any role", async () => {
  const PID = pid("proc_http_cancel_by_starter");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("cancelled");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel: a grant holder cancels an instance of their own process, without system:cancel-any or being the starter", async () => {
  const PID = pid("proc_http_cancel_by_grant");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await grantRole("finance-authors", "cancel", PID);

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", financeAuthor));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("cancelled");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel: that same grant does not cancel an instance of another process", async () => {
  const grantedPid = pid("proc_http_cancel_grant_scoped");
  const otherPid = pid("proc_http_cancel_grant_other");
  await publishBody(grantedPid, simpleBody(), reg, dataSourceReg);
  await publishBody(otherPid, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${otherPid}/instances`, "POST", user1))).json()) as { instanceId: string };
  await grantRole("finance-authors", "cancel", grantedPid);

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", financeAuthor));
  expect(res.status).toBe(403);
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel with the system:cancel-any role is authorized before any instance lookup, even for a nonexistent instance", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist/cancel", "POST", admin));
  // Authorization passes (no 403/401); the subsequent load fails instead — a
  // typed `NotFoundError` from the Runtime API Layer, which `mapError` maps
  // to 500/"internal" with its message intact (see src/http/errors.ts;
  // design.md's "Keep not-found at 500" for why it stays 500 instead of 404).
  // Pinned exactly, not just "not 403/401" as before, so this test fails if
  // the response is anything else — 400, 404, or a crash — not only if it
  // becomes a disguised authorization rejection. Paired with the role-less
  // 403 test above: the two together prove a role-holding caller's failure
  // differs from a role-lacking caller's, which is the non-disclosure
  // property `cancelInstance`'s ordering exists to preserve.
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("internal");
});

test.skipIf(!DB)("POST /processes with a structurally invalid body (missing initialStep) maps to 422", async () => {
  const res = await fetch(publishReq(admin, "proc_http_publish_422_schema", structurallyInvalidBody()));
  expect(res.status).toBe(422);
});

test.skipIf(!DB)("a rejected publish consumes no version; a subsequent valid publish for the same process is version 1", async () => {
  const PID = "proc_http_publish_422_no_version";
  const rejected = await fetch(publishReq(admin, PID, actionBody("nope.unregistered")));
  expect(rejected.status).toBe(422);

  const accepted = (await (await fetch(publishReq(admin, PID, simpleBody()))).json()) as { version: number };
  expect(accepted.version).toBe(1);
});

test.skipIf(!DB)("GET /processes lists published processes with their newest version, no bodies", async () => {
  await fetch(publishReq(admin, "proc_http_list_proc_a", simpleBody()));
  await fetch(publishReq(admin, "proc_http_list_proc_b", simpleBody()));

  const res = await fetch(authedReq("http://x/processes", "GET", user1));
  expect(res.status).toBe(200);
  const list = (await res.json()) as Record<string, unknown>[];
  const ids = list.map((p) => p.processId);
  expect(ids).toContain("proc_http_list_proc_a");
  expect(ids).toContain("proc_http_list_proc_b");
  for (const p of list) expect(p.body).toBeUndefined();
});

test.skipIf(!DB)("GET /processes/:processId/versions lists a twice-published process's versions in order", async () => {
  const PID = "proc_http_versions";
  await fetch(publishReq(admin, PID, simpleBody()));
  await fetch(publishReq(admin, PID, guardedBody()));

  const res = await fetch(authedReq(`http://x/processes/${PID}/versions`, "GET", user1));
  expect(res.status).toBe(200);
  const versions = (await res.json()) as { version: number }[];
  expect(versions.map((v) => v.version)).toEqual([1, 2]);
});

test.skipIf(!DB)("GET /processes/:processId/versions for an unpublished process returns an empty list", async () => {
  const res = await fetch(authedReq("http://x/processes/proc_http_never_published/versions", "GET", user1));
  expect(res.status).toBe(200);
  const versions = (await res.json()) as unknown[];
  expect(versions).toEqual([]);
});

test.skipIf(!DB)("a publish request under a rejecting resolver maps to 401 and publishes nothing", async () => {
  const rejectingResolver: ActorResolver = async () => {
    throw new (await import("../src/auth/resolve.js")).ActorResolutionError("nope");
  };
  const rejectingFetch = createServer(dataSourceReg, reg, sql, rejectingResolver);
  const PID = "proc_http_publish_401";

  const res = await rejectingFetch(publishReq(user1, PID, simpleBody()));
  expect(res.status).toBe(401);

  const store = createDefinitionStore(sql);
  const resolved = await store.resolveLatest(PID as ProcessId);
  expect(resolved).toBeUndefined();
});

// ============================================================
// routes.ts stays the participant-facing surface (admin-operations-api:
// "The participant route file gains no admin handler")
// ============================================================

test("routes.ts exports no admin-prefixed handler — those live in admin-routes.ts", async () => {
  const routes = await import("../src/http/routes.js");
  const adminExports = Object.keys(routes).filter((k) => k.toLowerCase().includes("admin"));
  expect(adminExports).toEqual([]);
});

// ============================================================
// CORS preflight on the new routes
// ============================================================

test("OPTIONS preflight on the instance listing route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/instances", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the instance record route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/instances/inst_x/record", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

test("OPTIONS preflight on the cancel route returns 204 permitting POST", async () => {
  const res = await fetch(new Request("http://x/instances/inst_x/cancel", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
});

test("OPTIONS preflight on the processes route permits GET and POST", async () => {
  const res = await fetch(new Request("http://x/processes", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
});

test("OPTIONS preflight on the process-versions route returns 204 permitting GET", async () => {
  const res = await fetch(new Request("http://x/processes/proc_x/versions", { method: "OPTIONS" }));
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});

// ============================================================
// mapError: new error-family mappings (pure function, no HTTP needed)
// ============================================================

test("a RequestShapeError maps to 400", async () => {
  const { RequestShapeError } = await import("../src/http/errors.js");
  const result = mapError(new RequestShapeError("bad param"));
  expect(result.status).toBe(400);
});

test("a RegistryValidationError maps to 422", async () => {
  const { RegistryValidationError } = await import("../src/engine/definitions.js");
  const result = mapError(new RegistryValidationError([{ loc: "x", message: "m", type: "t" } as never]));
  expect(result.status).toBe(422);
});

test("an AssignmentRegistryValidationError maps to 422", async () => {
  const { AssignmentRegistryValidationError } = await import("../src/engine/definitions.js");
  const result = mapError(new AssignmentRegistryValidationError([{ loc: "x", message: "m", type: "t" } as never]));
  expect(result.status).toBe(422);
});

test("a DataSourceRegistryValidationError maps to 422", async () => {
  const { DataSourceRegistryValidationError } = await import("../src/engine/definitions.js");
  const result = mapError(new DataSourceRegistryValidationError([{ loc: "x", message: "m", type: "t" } as never]));
  expect(result.status).toBe(422);
});

test("a CelValidationError maps to 422", async () => {
  const { CelValidationError } = await import("../src/engine/definitions.js");
  const result = mapError(new CelValidationError([{ loc: "x", message: "m", src: "s" } as never]));
  expect(result.status).toBe(422);
});

test("a CrossProcessValidationError maps to 422", async () => {
  const { CrossProcessValidationError } = await import("../src/engine/definitions.js");
  const result = mapError(new CrossProcessValidationError("nope"));
  expect(result.status).toBe(422);
});

test("a DurationValidationError maps to 422", async () => {
  const { DurationValidationError } = await import("../src/schema/compile.js");
  const result = mapError(new DurationValidationError([{ loc: "x", message: "m", value: "v" } as never]));
  expect(result.status).toBe(422);
});

test("an AuthorizationError maps to 403", async () => {
  const { AuthorizationError } = await import("../src/auth/authorize.js");
  const result = mapError(new AuthorizationError("actor 'user_1' lacks required role 'system:publish'"));
  expect(result.status).toBe(403);
  const body = result.body as { error: { type: string } };
  expect(body.error.type).toBe("authorization");
});

test("an unmapped error still falls back to 500", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = mapError(new Error("something else entirely"));
    expect(result.status).toBe(500);
  } finally {
    errorSpy.mockRestore();
  }
});

test("a NotFoundError maps to 500 with its message intact", async () => {
  const { NotFoundError } = await import("../src/http/errors.js");
  const result = mapError(new NotFoundError("instance not found: inst_x"));
  expect(result.status).toBe(500);
  const body = result.body as { error: { type: string; message: string } };
  expect(body.error.type).toBe("internal");
  expect(body.error.message).toBe("instance not found: inst_x");
});

test("an InstanceNotRunningError maps to 409", async () => {
  const { InstanceNotRunningError } = await import("../src/http/errors.js");
  const result = mapError(new InstanceNotRunningError("inst_x", "cancelled"));
  expect(result.status).toBe(409);
  const body = result.body as { error: { type: string; message: string } };
  expect(body.error.type).toBe("instance-not-running");
  expect(body.error.message).toContain("cancelled");
});

test("the fallback's 500 body carries no message, unlike every typed mapping above", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = mapError(new Error('relation "instances" does not exist'));
    const body = result.body as { error: { type: string; message?: string } };
    expect(body.error.type).toBe("internal");
    expect(body.error.message).toBeUndefined();
  } finally {
    errorSpy.mockRestore();
  }
});

test("the fallback logs the error and, when supplied, the request's method and path", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    mapError(new Error("boom"), { method: "POST", path: "/instances/inst_x/submit" });
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("POST");
    expect(logged).toContain("/instances/inst_x/submit");
    expect(logged).toContain("boom");
  } finally {
    errorSpy.mockRestore();
  }
});

test("the fallback still logs when no context is supplied (a direct mapError call outside routes.ts)", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = mapError(new Error("boom"));
    expect(result.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  } finally {
    errorSpy.mockRestore();
  }
});

// ============================================================
// Cache-Control on the JSON envelope
// ============================================================

test.skipIf(!DB)("a success envelope forbids a shared cache", async () => {
  const PID = pid("proc_http_nostore_ok");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  expect(res.status).toBe(201);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("an error envelope forbids a shared cache", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_missing?limit=abc", "GET", user1));
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

// ============================================================
// parseLimit clamps at the HTTP boundary
// ============================================================

test("parseLimit clamps a limit above the caller's maximum, and still rejects a non-positive integer", () => {
  const at = (q: string) => new URL(`http://x/instances?${q}`);
  expect(parseLimit(at("limit=10000"), MAX_LIST_LIMIT)).toBe(MAX_LIST_LIMIT);
  expect(parseLimit(at("limit=10000"), MAX_RECORD_LIMIT)).toBe(MAX_RECORD_LIMIT);
  // Under the maximum passes through untouched, and an absent limit stays
  // undefined so the query layer applies its own default.
  expect(parseLimit(at("limit=7"), MAX_LIST_LIMIT)).toBe(7);
  expect(parseLimit(at(""), MAX_LIST_LIMIT)).toBeUndefined();
  for (const bad of ["limit=abc", "limit=0", "limit=-1", "limit=1.5"]) {
    expect(() => parseLimit(at(bad), MAX_LIST_LIMIT)).toThrow("limit must be a positive integer");
  }
});

// `admin`, not `user1`: an omitted `scope` resolves to "all" (parseScope), and
// scope=all requires ADMIN_ROLE, so a role-less actor is refused at 403 before
// parseLimit ever runs. That check predates this change.
test.skipIf(!DB)("GET /instances with a limit far above the maximum still answers 200", async () => {
  const PID = pid("proc_http_limit_clamp");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1));
  const res = await fetch(authedReq("http://x/instances?limit=100000", "GET", admin));
  // The clamp turns an out-of-range limit into the maximum rather than a 400,
  // so an oversized request still succeeds. The bound itself is asserted
  // directly in the parseLimit test above; one row cannot demonstrate it here.
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: unknown[] };
  expect(body.items.length).toBeLessThanOrEqual(MAX_LIST_LIMIT);
});
