/**
 * Claim, release and delegate on an id that resolves to no instance
 * (http-wrapper "Claim, release and delegate refuse an unknown instance id").
 * A caller without ADMIN_ROLE gets the one authorization refusal, so the answer
 * does not reveal whether the id exists. An ADMIN_ROLE holder may read any
 * instance and gets the not-found answer. DB-backed: skips without DATABASE_URL.
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql } from "../src/engine/store.js";
import { DB, initDb, authedReq } from "./helpers/http-fixture.js";
import { clearInstanceAudit } from "./audit-cleanup.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createServer } from "../src/http/server.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import { NotFoundError } from "../src/errors.js";
import { createProcessInstance, claimStep, releaseClaim, delegateClaim } from "../src/runtime/api.js";
import type { InstanceId, ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const fetch = createServer(dataSourceReg, reg, sql, devHeaderResolver);

const stranger: Actor = { id: "user_stranger", roles: [] };
const admin: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const UNKNOWN = "inst_doesnotexist" as InstanceId;

beforeAll(initDb);
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, instance_drafts, definitions, permission_grants`;
  if (DB) await clearInstanceAudit();
});

/** step_a declares no assignment, step_b is terminal. */
const unassignedBody = (): ProcessBody =>
  ({
    key: "claim_unassigned",
    label: { en: "Claim Unassigned" },
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

const ROUTES = [
  { name: "claim", path: "claim", body: undefined as unknown },
  { name: "release", path: "release", body: undefined as unknown },
  { name: "delegate", path: "delegate", body: { toActorId: "someone" } },
];

const FUNCTIONS: { name: string; call: (actor: Actor) => Promise<unknown> }[] = [
  { name: "claimStep", call: (actor) => claimStep(UNKNOWN, actor) },
  { name: "releaseClaim", call: (actor) => releaseClaim(UNKNOWN, actor) },
  { name: "delegateClaim", call: (actor) => delegateClaim(UNKNOWN, actor, "someone") },
];

type ErrorBody = { error: { type: string; message: string } };

for (const { name, path, body } of ROUTES) {
  test.skipIf(!DB)(`POST /instances/:instanceId/${name} on an unknown id is 403 authorization for a non-administrator`, async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await fetch(authedReq(`http://x/instances/${UNKNOWN}/${path}`, "POST", stranger, body));
      expect(res.status).toBe(403);
      const json = (await res.json()) as ErrorBody;
      expect(json.error.type).toBe("authorization");
      expect(json.error.message).toBe(`actor 'user_stranger' may not act on instance '${UNKNOWN}'`);
      expect(errorSpy.mock.calls.map((c) => c.join(" ")).join("\n")).not.toContain("unhandled error");
    } finally {
      errorSpy.mockRestore();
    }
  });

  test.skipIf(!DB)(`POST /instances/:instanceId/${name} on an unknown id is the not-found answer for an administrator`, async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await fetch(authedReq(`http://x/instances/${UNKNOWN}/${path}`, "POST", admin, body));
      expect(res.status).toBe(500);
      const json = (await res.json()) as ErrorBody;
      expect(json.error.type).toBe("internal");
      expect(json.error.message).toBe(`instance not found: ${UNKNOWN}`);
      expect(errorSpy.mock.calls.map((c) => c.join(" ")).join("\n")).not.toContain("unhandled error");
    } finally {
      errorSpy.mockRestore();
    }
  });
}

for (const { name, call } of FUNCTIONS) {
  test.skipIf(!DB)(`${name} on an unknown id throws AuthorizationError for a non-administrator and NotFoundError for an administrator`, async () => {
    const refused = await call(stranger).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(refused).toBeInstanceOf(AuthorizationError);
    expect((refused as Error).message).toBe(`actor 'user_stranger' may not act on instance '${UNKNOWN}'`);

    const notFound = await call(admin).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(notFound).toBeInstanceOf(NotFoundError);
    expect((notFound as Error).message).toBe(`instance not found: ${UNKNOWN}`);
  });
}

test.skipIf(!DB)("a non-administrator claiming an existing instance on a step with no assignment still gets 403 not-assigned", async () => {
  const PID = "proc_claim_unknown_unassigned" as ProcessId;
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, stranger, dataSourceReg);

  const res = await fetch(authedReq(`http://x/instances/${created.instanceId}/claim`, "POST", stranger));
  expect(res.status).toBe(403);
  expect(((await res.json()) as ErrorBody).error.type).toBe("not-assigned");
});
