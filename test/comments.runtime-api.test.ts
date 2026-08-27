/**
 * Runtime API Layer comment surface: postComment, listComments. DB-backed
 * (skips when DATABASE_URL is unset), bodies go through the real
 * `publishBody` — mirrors assignment.runtime-api.test.ts's style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createProcessInstance, postComment, listComments } from "../src/runtime/api.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const starter: Actor = { id: "user_starter", roles: [] };
const candidate: Actor = { id: "user_1", roles: [] };
const roleActor: Actor = { id: "user_2", roles: ["approver"] };
const outsider: Actor = { id: "user_3", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_comments_rtapi" as ProcessId;

async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_comments, definitions`;
  if (DB) await clearInstanceAudit();
});

// step_a (assigned, initial) --(path_ab, manual, guardless)--> step_b (terminal).
const assignedBody = (): ProcessBody =>
  ({
    key: "comments_rt",
    label: { en: "Comments RT" },
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

test.skipIf(!DB)("an eligible candidate can post and list comments", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const posted = await postComment(inst.instanceId, candidate, "checked the amount", sql);
  expect(posted.actorId).toBe(candidate.id);
  expect(posted.text).toBe("checked the amount");
  expect(posted.id).toMatch(/^comment_/);

  const page = await listComments(inst.instanceId, candidate, {}, sql);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]!.id).toBe(posted.id);
});

test.skipIf(!DB)("an eligible candidate matched by role can post and list comments", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await postComment(inst.instanceId, roleActor, "role-matched note", sql);
  const page = await listComments(inst.instanceId, roleActor, {}, sql);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("the starter, who is not an assignment candidate, can post and list comments", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await postComment(inst.instanceId, starter, "starter's note", sql);
  const page = await listComments(inst.instanceId, starter, {}, sql);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("an ADMIN_ROLE actor can post and list comments without being the starter or a candidate", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await postComment(inst.instanceId, operator, "operator's note", sql);
  const page = await listComments(inst.instanceId, operator, {}, sql);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("an actor with no relation to the instance is refused on both post and list", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await rejectsWith(postComment(inst.instanceId, outsider, "should not land", sql), AuthorizationError);
  await rejectsWith(listComments(inst.instanceId, outsider, {}, sql), AuthorizationError);
});

test.skipIf(!DB)("comments list oldest first", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const first = await postComment(inst.instanceId, candidate, "first", sql);
  const second = await postComment(inst.instanceId, candidate, "second", sql);
  const third = await postComment(inst.instanceId, candidate, "third", sql);

  const page = await listComments(inst.instanceId, candidate, {}, sql);
  expect(page.items.map((c) => c.id)).toEqual([first.id, second.id, third.id]);
});

test.skipIf(!DB)("a full page returns a cursor that fetches the next page", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const first = await postComment(inst.instanceId, candidate, "first", sql);
  const second = await postComment(inst.instanceId, candidate, "second", sql);
  const third = await postComment(inst.instanceId, candidate, "third", sql);

  const page1 = await listComments(inst.instanceId, candidate, { limit: 2 }, sql);
  expect(page1.items.map((c) => c.id)).toEqual([first.id, second.id]);
  expect(page1.cursor).toBeDefined();

  const page2 = await listComments(inst.instanceId, candidate, { limit: 2, cursor: page1.cursor }, sql);
  expect(page2.items.map((c) => c.id)).toEqual([third.id]);
  expect(page2.cursor).toBeUndefined();
});
