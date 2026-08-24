/**
 * Runtime API Layer attachment surface: uploadAttachment, listAttachments,
 * getAttachment. DB-backed (skips when DATABASE_URL is unset), bodies go
 * through the real `publishBody` — mirrors comments.runtime-api.test.ts's
 * style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createProcessInstance, uploadAttachment, listAttachments, getAttachment } from "../src/runtime/api.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import { NotFoundError } from "../src/errors.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const starter: Actor = { id: "user_starter", roles: [] };
const candidate: Actor = { id: "user_1", roles: [] };
const roleActor: Actor = { id: "user_2", roles: ["approver"] };
const outsider: Actor = { id: "user_3", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_attachments_rtapi" as ProcessId;

function file(text: string): { filename: string; contentType: string; data: Uint8Array; sizeBytes: number } {
  const data = new TextEncoder().encode(text);
  return { filename: "note.txt", contentType: "text/plain", data, sizeBytes: data.length };
}

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
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_attachments, definitions`;
});

// step_a (assigned, initial) --(path_ab, manual, guardless)--> step_b (terminal).
const assignedBody = (): ProcessBody =>
  ({
    key: "attachments_rt",
    label: { en: "Attachments RT" },
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

test.skipIf(!DB)("an eligible candidate can upload, list, and download an attachment", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const uploaded = await uploadAttachment(inst.instanceId, candidate, file("receipt total: 42"), sql);
  expect(uploaded.actorId).toBe(candidate.id);
  expect(uploaded.filename).toBe("note.txt");
  expect(uploaded.contentType).toBe("text/plain");
  expect(uploaded.id).toMatch(/^attachment_/);
  expect((uploaded as { data?: unknown }).data).toBeUndefined();

  const page = await listAttachments(inst.instanceId, candidate, {}, sql);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]!.id).toBe(uploaded.id);
  expect((page.items[0] as { data?: unknown }).data).toBeUndefined();

  const downloaded = await getAttachment(inst.instanceId, uploaded.id, candidate, sql);
  expect(downloaded.filename).toBe("note.txt");
  expect(downloaded.contentType).toBe("text/plain");
  expect(new TextDecoder().decode(downloaded.data)).toBe("receipt total: 42");
});

test.skipIf(!DB)("an eligible candidate matched by role can upload and list attachments", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await uploadAttachment(inst.instanceId, roleActor, file("role-matched"), sql);
  const page = await listAttachments(inst.instanceId, roleActor, {}, sql);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("the starter, who is not an assignment candidate, can upload and list attachments", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await uploadAttachment(inst.instanceId, starter, file("starter's file"), sql);
  const page = await listAttachments(inst.instanceId, starter, {}, sql);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("an ADMIN_ROLE actor can upload, list, and download without being the starter or a candidate", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const uploaded = await uploadAttachment(inst.instanceId, operator, file("operator's file"), sql);
  const page = await listAttachments(inst.instanceId, operator, {}, sql);
  expect(page.items).toHaveLength(1);
  const downloaded = await getAttachment(inst.instanceId, uploaded.id, operator, sql);
  expect(new TextDecoder().decode(downloaded.data)).toBe("operator's file");
});

test.skipIf(!DB)("an actor with no relation to the instance is refused on upload, list, and download", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const uploaded = await uploadAttachment(inst.instanceId, candidate, file("visible to candidate"), sql);
  await rejectsWith(uploadAttachment(inst.instanceId, outsider, file("should not land"), sql), AuthorizationError);
  await rejectsWith(listAttachments(inst.instanceId, outsider, {}, sql), AuthorizationError);
  await rejectsWith(getAttachment(inst.instanceId, uploaded.id, outsider, sql), AuthorizationError);
});

test.skipIf(!DB)("attachments list oldest first", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const first = await uploadAttachment(inst.instanceId, candidate, file("first"), sql);
  const second = await uploadAttachment(inst.instanceId, candidate, file("second"), sql);
  const third = await uploadAttachment(inst.instanceId, candidate, file("third"), sql);

  const page = await listAttachments(inst.instanceId, candidate, {}, sql);
  expect(page.items.map((a) => a.id)).toEqual([first.id, second.id, third.id]);
});

test.skipIf(!DB)("a full page returns a cursor that fetches the next page", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  const first = await uploadAttachment(inst.instanceId, candidate, file("first"), sql);
  const second = await uploadAttachment(inst.instanceId, candidate, file("second"), sql);
  const third = await uploadAttachment(inst.instanceId, candidate, file("third"), sql);

  const page1 = await listAttachments(inst.instanceId, candidate, { limit: 2 }, sql);
  expect(page1.items.map((a) => a.id)).toEqual([first.id, second.id]);
  expect(page1.cursor).toBeDefined();

  const page2 = await listAttachments(inst.instanceId, candidate, { limit: 2, cursor: page1.cursor }, sql);
  expect(page2.items.map((a) => a.id)).toEqual([third.id]);
  expect(page2.cursor).toBeUndefined();
});

test.skipIf(!DB)("getAttachment throws NotFoundError for an unknown attachment id", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, starter, dataSourceReg);
  await rejectsWith(getAttachment(inst.instanceId, "attachment_does-not-exist", candidate, sql), NotFoundError);
});

test.skipIf(!DB)("getAttachment throws NotFoundError for an attachment belonging to a different instance", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const instA = await createProcessInstance(PID, starter, dataSourceReg);
  const instB = await createProcessInstance(PID, starter, dataSourceReg);
  const uploadedOnB = await uploadAttachment(instB.instanceId, candidate, file("belongs to B"), sql);
  await rejectsWith(getAttachment(instA.instanceId, uploadedOnB.id, candidate, sql), NotFoundError);
});
