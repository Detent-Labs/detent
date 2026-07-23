/**
 * HTTP wrapper (src/http/): the three REST/JSON routes over the Runtime API
 * Layer. DB-backed (skips when DATABASE_URL is unset), following the same
 * pattern as test/runtime-api.test.ts. Calls the exported `fetch` handler
 * directly with `new Request(...)` — no real port, no network I/O.
 */
import { readFileSync } from "node:fs";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, register } from "../src/engine/registry.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { ConcurrencyConflict } from "../src/engine/transition.js";
import { createServer } from "../src/http/server.js";
import { mapError } from "../src/http/errors.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const cel = (src: string) => ({ lang: "cel", src });
const reg = createRegistry();
const fetch = createServer(reg);

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

const pid = (n: string) => n as ProcessId;
const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================
// Happy path per route
// ============================================================

test.skipIf(!DB)("POST /processes/:processId/instances creates an instance and returns 201", async () => {
  const PID = pid("proc_http_create");
  await publishBody(PID, simpleBody(), reg);

  const res = await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { instanceId: string; currentStepId: string };
  expect(body.currentStepId).toBe("step_a");
  expect(body.instanceId).toMatch(/^inst_/);
});

test.skipIf(!DB)("POST /processes/:processId/instances with a data seed reflects it in the created Instance", async () => {
  const PID = pid("proc_http_create_seed");
  await publishBody(PID, simpleBody(), reg);

  const res = await fetch(
    jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] }, data: { field_amount: 7 } }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: Record<string, unknown> };
  expect(body.data).toEqual({ field_amount: 7 });
});

test.skipIf(!DB)("POST /processes/:processId/instances with an explicit version pins to it, not the newest", async () => {
  const PID = pid("proc_http_create_version");
  const v1 = await publishBody(PID, simpleBody(), reg);
  const v2 = await publishBody(PID, guardedBody(), reg); // a distinct body -> assigns v2
  expect(v2.version).toBe(v1.version + 1);

  const res = await fetch(
    jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] }, version: v1.version }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { version: number; currentStepId: string };
  expect(body.version).toBe(v1.version);
  expect(body.currentStepId).toBe("step_a"); // simpleBody's initial step, not guardedBody's step_x
});

test.skipIf(!DB)("GET /instances/:instanceId resolves a view and returns 200", async () => {
  const PID = pid("proc_http_view");
  await publishBody(PID, simpleBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_1`));
  expect(res.status).toBe(200);
  const view = (await res.json()) as { step: { key: string }; status: string; availablePaths: unknown[] };
  expect(view.step.key).toBe("a");
  expect(view.status).toBe("running");
  expect(view.availablePaths).toEqual([{ id: "path_ab", key: "ab", label: undefined }]);
});

test.skipIf(!DB)("POST /instances/:instanceId/submit commits a transition and returns 200", async () => {
  const PID = pid("proc_http_submit");
  await publishBody(PID, simpleBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor: { id: "user_1", roles: [] },
      pathId: "path_ab",
      data: { field_amount: 10 },
    }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { currentStepId: string; status: string };
  expect(body.currentStepId).toBe("step_b");
  expect(body.status).toBe("completed");
});

test.skipIf(!DB)("GET /instances/:instanceId on a non-running (completed) instance still resolves, with no available paths", async () => {
  const PID = pid("proc_http_view_completed");
  await publishBody(PID, simpleBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };
  await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor: { id: "user_1", roles: [] },
      pathId: "path_ab",
      data: { field_amount: 10 },
    }),
  );

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_1`));
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
  await publishBody(PID, simpleBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor: { id: "user_1", roles: [] },
      pathId: "path_ab",
      data: { field_amount: "not-a-number" },
    }),
  );
  expect(res.status).toBe(422);
  const body = (await res.json()) as { error: { type: string; issues: unknown[] } };
  expect(body.error.type).toBe("validation");
  expect(body.error.issues).toEqual([{ kind: "type-mismatch", fieldId: "field_amount", expected: "number" }]);
});

test.skipIf(!DB)("a guard refusal maps to 409", async () => {
  const PID = pid("proc_http_409_guard");
  await publishBody(PID, guardedBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor: { id: "user_1", roles: [] },
      pathId: "path_done",
      data: {},
    }),
  );
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
  await publishBody(PID, simpleBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  await sql`UPDATE instances SET body = jsonb_set(body, '{definitionHash}', '"deadbeef"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_1`));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: { type: string } };
  expect(body.error.type).toBe("internal");
});

test.skipIf(!DB)("an unknown instanceId maps to 500, not 404", async () => {
  const res = await fetch(new Request("http://x/instances/inst_does_not_exist?actorId=user_1"));
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
  await publishBody(PID, cascadeLoopBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor: { id: "user_1", roles: [] },
      pathId: "path_ag",
      data: { field_marker: "kept-despite-fault" },
    }),
  );
  expect(res.status).toBe(200);
  const view = (await res.json()) as { status: string };
  expect(view.status).toBe("faulted");
});

// ============================================================
// Actor-passing mechanism
// ============================================================

test.skipIf(!DB)("GET roles defaults to [] when omitted", async () => {
  const PID = pid("proc_http_roles_default");
  await publishBody(PID, roleGuardedBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_1`));
  const view = (await res.json()) as { availablePaths: unknown[] };
  expect(view.availablePaths).toEqual([]); // no roles -> guard 'admin' in actor.roles is false
});

test.skipIf(!DB)("GET roles parses a comma-separated list", async () => {
  const PID = pid("proc_http_roles_multi");
  await publishBody(PID, roleGuardedBody(), reg);
  const created = await (
    await fetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "user_1", roles: [] } }))
  ).json() as { instanceId: string };

  const res = await fetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_1&roles=employee,admin`));
  const view = (await res.json()) as { availablePaths: { key: string }[] };
  expect(view.availablePaths.map((p) => p.key)).toEqual(["admin"]);
});

test.skipIf(!DB)("POST actor is accepted from the JSON body regardless of shape (not an auth check)", async () => {
  const PID = pid("proc_http_actor_body");
  await publishBody(PID, simpleBody(), reg);
  const res = await fetch(
    jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor: { id: "anyone-at-all", roles: ["made-up-role"] } }),
  );
  expect(res.status).toBe(201);
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
  const expenseFetch = createServer(expenseReg);

  const PID = pid("proc_http_expense");
  await publishBody(PID, authored, expenseReg);

  const amountField = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
  const reasonField = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002";
  const reviewNoteField = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003";
  const submitPath = "path_bbbb2222-0001-4a1c-8e2f-000000000001";
  const approvePath = "path_bbbb2222-0002-4a1c-8e2f-000000000002";
  const actor = { id: "user_demo", roles: ["employee", "finance-approver"] };

  const created = await (
    await expenseFetch(jsonReq(`http://x/processes/${PID}/instances`, "POST", { actor }))
  ).json() as { instanceId: string };

  await expenseFetch(
    jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
      actor,
      pathId: submitPath,
      data: { [amountField]: 42, [reasonField]: "Taxi" },
    }),
  );
  const afterReview = await (
    await expenseFetch(
      jsonReq(`http://x/instances/${created.instanceId}/submit`, "POST", {
        actor,
        pathId: approvePath,
        data: { [reviewNoteField]: "Looks fine" },
      }),
    )
  ).json() as { status: string };
  expect(afterReview.status).toBe("running"); // parked at "book" until the async action settles

  const definitionStore = createDefinitionStore(sql);
  let view = (await (await expenseFetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_demo`))).json()) as {
    step: { key: string };
    status: string;
  };
  for (let i = 0; i < 5 && view.status === "running" && view.step.key === "book"; i++) {
    await drainOutbox(sql, expenseReg);
    await drainResolutions(sql, definitionStore.resolveBody);
    view = (await (await expenseFetch(new Request(`http://x/instances/${created.instanceId}?actorId=user_demo`))).json()) as {
      step: { key: string };
      status: string;
    };
  }

  expect(view.status).toBe("completed");
});
