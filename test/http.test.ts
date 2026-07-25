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
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, register, createDataSourceRegistry, registerDataSource } from "../src/engine/registry.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { ConcurrencyConflict } from "../src/engine/transition.js";
import { createServer } from "../src/http/server.js";
import { mapError } from "../src/http/errors.js";
import { devHeaderResolver, type ActorResolver } from "../src/auth/resolve.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const cel = (src: string) => ({ lang: "cel", src });
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
registerDataSource(dataSourceReg, "static", { resolve: async (ctx) => (ctx.config as { options: unknown[] }).options as never });
const fetch = createServer(dataSourceReg, reg);

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
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
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
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
          paths: [{ id: "path_done", key: "done", to: "step_done", trigger: "manual", guard: cel("data.approved == true") }],
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
          paths: [{ id: "path_ag", key: "ag", to: "step_g", trigger: "manual" }],
        },
        { id: "step_g", key: "g", label: { en: "G" }, type: "task", paths: [{ id: "path_gh", key: "gh", to: "step_h", trigger: "automatic" }] },
        { id: "step_h", key: "h", label: { en: "H" }, type: "task", paths: [{ id: "path_hg", key: "hg", to: "step_g", trigger: "automatic" }] },
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
          paths: [{ id: "path_admin", key: "admin", to: "step_admin", trigger: "manual", guard: cel("'admin' in actor.roles") }],
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
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const pid = (n: string) => n as ProcessId;

const authHeaders = (actor: Actor): Record<string, string> => ({
  "X-Actor-Id": actor.id,
  ...(actor.roles.length > 0 ? { "X-Actor-Roles": actor.roles.join(",") } : {}),
});

/** A POST request carrying auth headers plus a JSON body (defaulting to `{}` so route handlers that call req.json() unconditionally never see an empty body). */
const jsonReq = (url: string, method: string, actor: Actor, body: unknown = {}) =>
  new Request(url, {
    method,
    headers: { ...authHeaders(actor), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** A GET/no-body request carrying only auth headers (view, claim, release). */
const authedReq = (url: string, method: string, actor: Actor) =>
  new Request(url, { method, headers: authHeaders(actor) });

const user1: Actor = { id: "user_1", roles: [] };

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
  expect(view.availablePaths).toEqual([{ id: "path_ab", key: "ab", label: undefined }]);
});

test.skipIf(!DB)("GET /instances/:instanceId resolves a dataSource-bound field's options", async () => {
  const PID = pid("proc_http_ds_view");
  const dsFieldBody = {
    key: "ds_view_body",
    label: { en: "DS View Body" },
    baseLocale: "en",
    fields: [{ id: "field_country", key: "country", label: { en: "Country" }, type: "select", dataSource: "ds_countries" }],
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

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}`, "GET", user1));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("internal");
});

test.skipIf(!DB)("an unknown instanceId maps to 500, not 404", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string; message: string } };
  expect(body.error.type).toBe("internal");
  expect(body.error.message).toContain("inst_does_not_exist");
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
  const res = await corsFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
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
  const res = await allowlistFetch(authedReq("http://x/instances/inst_does_not_exist", "GET", user1));
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
  register(expenseReg, "accounting.postInvoice", { handler: async () => ({ status: "booked" }) });
  register(expenseReg, "notify.email", { handler: async () => ({}) });
  const expenseFetch = createServer(dataSourceReg, expenseReg);

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

  const res = await fetch(authedReq("http://x/instances", "GET", user1));
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

  const res = await fetch(authedReq(`http://x/instances?assignedTo=user_1&status=running`, "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { instanceId: string }[] };
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("GET /instances?status=running&status=cancelled widens the filter", async () => {
  const PID = pid("proc_http_list_multistatus");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const running = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  const toCancel = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${toCancel.instanceId}/cancel`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances?status=running&status=cancelled`, "GET", user1));
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
    const res = await fetch(authedReq(url.toString(), "GET", user1));
    const page = (await res.json()) as { items: { instanceId: string }[]; cursor?: string };
    for (const item of page.items) seen.add(item.instanceId);
    cursor = page.cursor;
    if (!cursor) break;
  }
  expect(seen.size).toBe(5);
  expect(cursor).toBeUndefined();
});

test.skipIf(!DB)("GET /instances?limit=abc is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?limit=abc", "GET", user1));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("GET /instances?status=sideways is a 400 request error", async () => {
  const res = await fetch(authedReq("http://x/instances?status=sideways", "GET", user1));
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

// ============================================================
// GET /instances/:instanceId/record
// ============================================================

test.skipIf(!DB)("GET /instances/:instanceId/record returns the merged, ordered record", async () => {
  const PID = pid("proc_http_record");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", user1, { pathId: "path_ab", data: { field_amount: 10 } }));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: { kind: string }[] };
  expect(page.items.length).toBeGreaterThan(0);
  expect(page.items[0]!.kind).toBe("transition");
});

test.skipIf(!DB)("GET /instances/:instanceId/record for an unknown instance returns 200 with an empty sequence", async () => {
  const res = await fetch(authedReq("http://x/instances/inst_does_not_exist/record", "GET", user1));
  expect(res.status).toBe(200);
  const page = (await res.json()) as { items: unknown[] };
  expect(page.items).toEqual([]);
});

// ============================================================
// POST /instances/:instanceId/cancel
// ============================================================

test.skipIf(!DB)("POST /instances/:instanceId/cancel cancels a running instance", async () => {
  const PID = pid("proc_http_cancel");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", user1));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("cancelled");

  const record = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", user1))).json()) as {
    items: { kind: string; entry?: { cause: string } }[];
  };
  expect(record.items.some((i) => i.kind === "transition" && i.entry?.cause === "cancel")).toBe(true);
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel succeeds for an arbitrary actor id, recorded as the cancellation's cause", async () => {
  const PID = pid("proc_http_cancel_arbitrary_actor");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };

  const arbitraryActor: Actor = { id: "totally_unrelated_actor", roles: [] };
  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", arbitraryActor));
  expect(res.status).toBe(200);

  const record = (await (await fetch(authedReq(`http://x/instances/${created.instanceId}/record`, "GET", user1))).json()) as {
    items: { kind: string; entry?: { cause: string; actorId?: string } }[];
  };
  const cancelEntry = record.items.find((i) => i.kind === "transition" && i.entry?.cause === "cancel");
  expect(cancelEntry?.entry?.actorId).toBe("totally_unrelated_actor");
});

test.skipIf(!DB)("POST /instances/:instanceId/cancel on an already-cancelled instance stays cancelled", async () => {
  const PID = pid("proc_http_cancel_twice");
  await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const created = (await (await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", user1))).json()) as { instanceId: string };
  await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", user1));

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/cancel`, "POST", user1));
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
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
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
        { id: "step_x", key: "x", label: { en: "X" }, type: "task", paths: [{ id: "path_done", key: "done", to: "step_done", trigger: "manual", guard: cel("data.approved ==") }] },
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
  const res = await fetch(publishReq(user1, PID, simpleBody()));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { processId: string; version: number; definitionHash: string; status: string };
  expect(body.version).toBe(1);
  expect(body.processId).toBe(PID);

  const store = createDefinitionStore(sql);
  const resolved = await store.resolveBody(PID as ProcessId, 1);
  expect(resolved).toBeDefined();
});

test.skipIf(!DB)("POST /processes re-publishing an identical body returns the same version and hash", async () => {
  const PID = "proc_http_publish_idempotent";
  const first = (await (await fetch(publishReq(user1, PID, simpleBody()))).json()) as { version: number; definitionHash: string };
  const second = (await (await fetch(publishReq(user1, PID, simpleBody()))).json()) as { version: number; definitionHash: string };
  expect(second.version).toBe(first.version);
  expect(second.definitionHash).toBe(first.definitionHash);
});

test.skipIf(!DB)("POST /processes publishing a changed body assigns the next version", async () => {
  const PID = "proc_http_publish_v2";
  await fetch(publishReq(user1, PID, simpleBody()));
  const res = await fetch(publishReq(user1, PID, guardedBody()));
  const body = (await res.json()) as { version: number };
  expect(body.version).toBe(2);
});

test.skipIf(!DB)("POST /processes with a malformed JSON body maps to 400", async () => {
  const res = await fetch(
    new Request("http://x/processes", { method: "POST", headers: { ...authHeaders(user1), "content-type": "application/json" }, body: "{not json" }),
  );
  expect(res.status).toBe(400);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("request-shape");
});

test.skipIf(!DB)("POST /processes with an unregistered action type maps to 422 and names the offending action position", async () => {
  const res = await fetch(publishReq(user1, "proc_http_publish_422_registry", actionBody("nope.unregistered")));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("onEntry");
});

test.skipIf(!DB)("POST /processes with an unparseable guard expression maps to 422 and names the offending expression", async () => {
  const res = await fetch(publishReq(user1, "proc_http_publish_422_cel", brokenCelBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("cel-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("guard");
});

test.skipIf(!DB)("POST /processes with an unsupported assignment strategy type maps to 422 and names the offending position", async () => {
  const res = await fetch(publishReq(user1, "proc_http_publish_422_assignment", badAssignmentBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("assignment");
});

test.skipIf(!DB)("POST /processes with an unregistered data source type maps to 422 and names the offending position", async () => {
  const res = await fetch(publishReq(user1, "proc_http_publish_422_datasource", badDataSourceBody()));
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: { loc: string }[] } };
  expect(body.error.type).toBe("registry-validation");
  expect(body.error.issues.length).toBeGreaterThan(0);
  expect(body.error.issues[0]!.loc).toContain("dataSources");
});

test.skipIf(!DB)("POST /processes with a structurally invalid body (missing initialStep) maps to 422", async () => {
  const res = await fetch(publishReq(user1, "proc_http_publish_422_schema", structurallyInvalidBody()));
  expect(res.status).toBe(422);
});

test.skipIf(!DB)("a rejected publish consumes no version; a subsequent valid publish for the same process is version 1", async () => {
  const PID = "proc_http_publish_422_no_version";
  const rejected = await fetch(publishReq(user1, PID, actionBody("nope.unregistered")));
  expect(rejected.status).toBe(422);

  const accepted = (await (await fetch(publishReq(user1, PID, simpleBody()))).json()) as { version: number };
  expect(accepted.version).toBe(1);
});

test.skipIf(!DB)("GET /processes lists published processes with their newest version, no bodies", async () => {
  await fetch(publishReq(user1, "proc_http_list_proc_a", simpleBody()));
  await fetch(publishReq(user1, "proc_http_list_proc_b", simpleBody()));

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
  await fetch(publishReq(user1, PID, simpleBody()));
  await fetch(publishReq(user1, PID, guardedBody()));

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

test("an unmapped error still falls back to 500", () => {
  const result = mapError(new Error("something else entirely"));
  expect(result.status).toBe(500);
});
