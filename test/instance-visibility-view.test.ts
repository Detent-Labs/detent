/**
 * instance-visibility-view: the direct read (`loadInstanceForActor`, behind
 * `getInstanceView`, comments and attachments) consults the principal set
 * from instance-visibility-set, under the same revocation and live-assignment
 * rules the `scope=visible` list applies. DB-backed — skips when DATABASE_URL
 * is unset. Bodies go through the real `publishBody`, so the principal rows
 * come from the engine's own write points, except where a test appends a
 * group principal directly to stand in for a group-resolving strategy.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance, withTransaction, appendInstancePrincipals } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import {
  createProcessInstance,
  getInstanceView,
  claimStep,
  submitAndTransition,
  revokeVisibility,
  grantVisibility,
  postComment,
  listComments,
  uploadAttachment,
  listAttachments,
  getAttachment,
} from "../src/runtime/api.js";
import { createGroup, setGroupMembers } from "../src/auth/groups.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId, PathId, InstanceId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const starter: Actor = { id: "user_starter", roles: [] };
const past: Actor = { id: "user_past", roles: [] };
const approver: Actor = { id: "user_approver", roles: ["approver"] };
const member: Actor = { id: "user_member", roles: [] };
const outsider: Actor = { id: "user_outsider", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_visibility_view" as ProcessId;

async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

function file(text: string): { filename: string; contentType: string; data: Uint8Array; sizeBytes: number } {
  const data = new TextEncoder().encode(text);
  return { filename: "note.txt", contentType: "text/plain", data, sizeBytes: data.length };
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (!DB) return;
  await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, instance_attachments, definitions, groups`;
  await sql`TRUNCATE instance_principals, instance_principals_denied`;
  await clearInstanceAudit();
});

// step_a (assigned to the approver role and user_past, initial)
//   --(path_ab, manual)--> step_b (no assignment, terminal).
// Once the instance stands on step_b nobody holds a live assignment, so
// every read there goes through the participation ground alone.
const body = (): ProcessBody =>
  ({
    key: "visibility_view",
    label: { en: "Visibility view" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["approver", past.id] } } },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** An instance on step_a, started by `starter`. */
async function fresh(): Promise<InstanceId> {
  await publishBody(PID, body(), reg, dataSourceReg);
  return (await createProcessInstance(PID, starter, dataSourceReg)).instanceId;
}

/** Moves the instance to step_b through the approver, so no assignment is live afterwards. */
async function moveOn(instanceId: InstanceId): Promise<void> {
  await claimStep(instanceId, approver);
  await submitAndTransition(instanceId, "path_ab" as PathId, {} as Instance["data"], approver, dataSourceReg);
}

async function opens(instanceId: InstanceId, actor: Actor): Promise<void> {
  const view = await getInstanceView(instanceId, actor, dataSourceReg);
  expect(view.instanceId).toBe(instanceId);
}

const refuses = (instanceId: InstanceId, actor: Actor) => rejectsWith(getInstanceView(instanceId, actor, dataSourceReg), AuthorizationError);

async function deniedRows(instanceId: InstanceId, actorId: string): Promise<number> {
  const rows = (await sql`SELECT count(*) AS n FROM instance_principals_denied
    WHERE instance_id = ${instanceId} AND actor_id = ${actorId}`) as { n: string }[];
  return Number(rows[0]!.n);
}

test.skipIf(!DB)("a past candidate keeps the read after the instance moves on; an outsider never had it", async () => {
  const id = await fresh();
  await moveOn(id);
  await opens(id, past);
  await refuses(id, outsider);
});

test.skipIf(!DB)("a group member with no live assignment opens an instance the group is a principal of", async () => {
  const id = await fresh();
  const group = await createGroup("HR", { type: "global" });
  await setGroupMembers(group.groupId, [member.id]);
  await withTransaction(sql, (tx) => appendInstancePrincipals(tx, id, [group.groupId]));
  await moveOn(id);
  await opens(id, member);
  // A non-member matching nothing else stays out.
  await refuses(id, outsider);
});

test.skipIf(!DB)("a revoked participant is refused, and restored access is not needed to keep others in", async () => {
  const id = await fresh();
  await moveOn(id);
  await revokeVisibility(id, past.id, operator);
  await refuses(id, past);
  // The approver, who held the claim on step_a, is untouched.
  await opens(id, approver);
});

test.skipIf(!DB)("a revoked starter is refused", async () => {
  const id = await fresh();
  await revokeVisibility(id, starter.id, operator);
  await refuses(id, starter);
});

test.skipIf(!DB)("a live assignment outranks a revocation on the direct read, and the revocation applies again after it ends", async () => {
  const id = await fresh();
  await revokeVisibility(id, past.id, operator);
  // Revoked, and an eligible candidate on step_a: admitted, denial untouched.
  await opens(id, past);
  expect(await deniedRows(id, past.id)).toBe(1);
  // Revoked, and the claimant: still admitted.
  await claimStep(id, past);
  await opens(id, past);
  // The instance moves to step_b, which assigns nobody: the override ends.
  await submitAndTransition(id, "path_ab" as PathId, {} as Instance["data"], past, dataSourceReg);
  await refuses(id, past);
  expect(await deniedRows(id, past.id)).toBe(1);
});

test.skipIf(!DB)("a granted actor opens an instance they never took part in", async () => {
  const id = await fresh();
  await refuses(id, outsider);
  await grantVisibility(id, outsider.id, operator);
  await opens(id, outsider);
});

test.skipIf(!DB)("comments and attachments follow the same rule", async () => {
  const id = await fresh();
  await moveOn(id);
  // A past participant, with no live assignment, on all five calls.
  const posted = await postComment(id, past, "still here", sql);
  expect((await listComments(id, past, {}, sql)).items.map((c) => c.id)).toEqual([posted.id]);
  const uploaded = await uploadAttachment(id, past, file("still here"), sql);
  expect((await listAttachments(id, past, {}, sql)).items.map((a) => a.id)).toEqual([uploaded.id]);
  expect((await getAttachment(id, uploaded.id, past, sql)).filename).toBe("note.txt");

  // Revoked: every one of them refuses.
  await revokeVisibility(id, past.id, operator);
  await rejectsWith(postComment(id, past, "should not land", sql), AuthorizationError);
  await rejectsWith(listComments(id, past, {}, sql), AuthorizationError);
  await rejectsWith(uploadAttachment(id, past, file("should not land"), sql), AuthorizationError);
  await rejectsWith(listAttachments(id, past, {}, sql), AuthorizationError);
  await rejectsWith(getAttachment(id, uploaded.id, past, sql), AuthorizationError);
});

test.skipIf(!DB)("a test instance keeps its own rule: a group principal admits no member", async () => {
  const v = await publishBody(PID, body(), reg, dataSourceReg);
  const group = await createGroup("HR", { type: "global" });
  await setGroupMembers(group.groupId, [member.id]);
  const testInst = await createInstance(v.definition, { processId: PID, version: v.version, kind: "test", startedBy: starter.id });
  await withTransaction(sql, (tx) => appendInstancePrincipals(tx, testInst.instanceId, [group.groupId]));
  await refuses(testInst.instanceId, member);
  await opens(testInst.instanceId, starter);
});

test.skipIf(!DB)("an unrelated actor gets the same refusal for a real instance and for a nonexistent id", async () => {
  const id = await fresh();
  await refuses(id, outsider);
  await refuses("inst_does_not_exist" as InstanceId, outsider);
});
