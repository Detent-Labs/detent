/**
 * draft-test-instances, Phase 1 (Foundation): the `instances.kind` column and
 * `draft_snapshots` table (tasks.md section 1), and `resolveBody`'s fallback
 * for a negative (test-instance) version (section 2). DB-backed; skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { ZodError } from "zod";
import { sql, initSchema, createInstance, createDraftSnapshot } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import {
  getInstanceView,
  createProcessInstance,
  listInstances,
  postComment,
  listComments,
  uploadAttachment,
  listAttachments,
  getAttachment,
  NotFoundError,
} from "../src/runtime/api.js";
import { saveDraft } from "../src/engine/drafts.js";
import { instance as instanceSchema } from "../src/schema/definition.js";
import { definitionHash } from "../src/schema/hash.js";
import { ADMIN_ROLE, AuthorizationError } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const PID = "proc_drafttest" as ProcessId;
const actor: Actor = { id: "user_1", roles: [] };
const starter: Actor = { id: "user_starter", roles: [] };
const claimant: Actor = { id: "user_claimant", roles: [] };
const adminActor: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

// A single terminal step: no transition needed for these storage-level tests.
const simpleBody = (): ProcessBody =>
  ({
    key: "wf",
    label: { en: "WF" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, draft_snapshots, drafts, instance_comments, instance_attachments`;
  if (DB) await clearInstanceAudit();
});

const bodyWithLabel = (label: string): ProcessBody =>
  ({
    key: "wf",
    label: { en: "WF" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: label }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

// --- 1.1: instances.kind ------------------------------------------------------

test.skipIf(!DB)("instances.kind defaults every instance to 'published', and re-running initSchema is a no-op", async () => {
  const inst = await createInstance(simpleBody(), { processId: PID, version: 1 });
  const rows = (await sql`SELECT kind FROM instances WHERE instance_id = ${inst.instanceId}`) as { kind: string }[];
  expect(rows[0]!.kind).toBe("published");

  // Idempotent: re-running the migration does not error and does not disturb
  // the already-backfilled row.
  await initSchema();
  const rows2 = (await sql`SELECT kind FROM instances WHERE instance_id = ${inst.instanceId}`) as { kind: string }[];
  expect(rows2[0]!.kind).toBe("published");
});

test.skipIf(!DB)("createInstance persists kind: 'test' and reads it back", async () => {
  const inst = await createInstance(simpleBody(), { processId: PID, version: 1, kind: "test" });
  expect(inst.kind).toBe("test");
  const rows = (await sql`SELECT kind FROM instances WHERE instance_id = ${inst.instanceId}`) as { kind: string }[];
  expect(rows[0]!.kind).toBe("test");
});

// --- 1.2: draft_snapshots ------------------------------------------------------

test.skipIf(!DB)("draft_snapshots exists and is idempotent to create", async () => {
  await initSchema(); // second run over an already-migrated schema
  const body = simpleBody();
  const hash = definitionHash(body);
  await sql`INSERT INTO draft_snapshots (process_id, version, definition_hash, body) VALUES (${PID}, -1, ${hash}, ${body})`;
  const rows = (await sql`SELECT definition_hash FROM draft_snapshots WHERE process_id = ${PID} AND version = -1`) as { definition_hash: string }[];
  expect(rows[0]!.definition_hash).toBe(hash);
});

// --- 1.3: Instance.kind schema default -----------------------------------------

test("a parsed Instance literal omitting kind reads back as 'published'", () => {
  const parsed = instanceSchema.parse({
    instanceId: "inst_x",
    processId: PID,
    version: 1,
    definitionHash: "h",
    currentStepId: "step_a",
    transitionSeq: 0,
    data: {},
    status: "running",
    startedAt: new Date().toISOString(),
  });
  expect(parsed.kind).toBe("published");
});

// --- 1.4 / 1.5: sentinel version helper ----------------------------------------

test.skipIf(!DB)("createDraftSnapshot assigns two distinct, non-colliding negative sentinels for the same process", async () => {
  const body = simpleBody();
  const hash = definitionHash(body);
  const v1 = await createDraftSnapshot(PID, hash, body, sql);
  const v2 = await createDraftSnapshot(PID, hash, body, sql);
  expect(v1).toBeLessThan(0);
  expect(v2).toBeLessThan(0);
  expect(v1).not.toBe(v2);
  const rows = (await sql`SELECT version FROM draft_snapshots WHERE process_id = ${PID} ORDER BY version`) as { version: number }[];
  expect(rows.map((r) => r.version).sort((a, b) => a - b)).toEqual([v1, v2].sort((a, b) => a - b));
});

test.skipIf(!DB)("two simultaneous sentinel creations for the same process do not collide", async () => {
  const body = simpleBody();
  const hash = definitionHash(body);
  const [v1, v2] = await Promise.all([createDraftSnapshot(PID, hash, body, sql), createDraftSnapshot(PID, hash, body, sql)]);
  expect(v1).not.toBe(v2);
  const rows = (await sql`SELECT count(*)::int AS n FROM draft_snapshots WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0]!.n).toBe(2);
});

// --- 1.6: InstanceView.kind -----------------------------------------------------

test.skipIf(!DB)("getInstanceView reports kind for a published and a test instance", async () => {
  const v = await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const published = await createInstance(v.definition, { processId: PID, version: v.version, startedBy: actor.id });
  const testInst = await createInstance(v.definition, { processId: PID, version: v.version, kind: "test", startedBy: actor.id });

  const publishedView = await getInstanceView(published.instanceId, actor, dataSourceReg);
  expect(publishedView.kind).toBe("published");

  const testView = await getInstanceView(testInst.instanceId, actor, dataSourceReg);
  expect(testView.kind).toBe("test");
});

// --- 2.1 / 2.2 / 2.3: resolveBody fallback --------------------------------------

test.skipIf(!DB)("resolveBody resolves a negative version from a persisted draft_snapshots row", async () => {
  const body = simpleBody();
  const hash = definitionHash(body);
  const version = await createDraftSnapshot(PID, hash, body, sql);
  const { resolveBody } = createDefinitionStore();
  const resolved = await resolveBody(PID, version);
  expect(resolved).toEqual(body);
});

test.skipIf(!DB)("resolveBody for a real, positive version behaves identically to before this change", async () => {
  const v = await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const { resolveBody } = createDefinitionStore();
  const resolved = await resolveBody(PID, v.version);
  expect(definitionHash(resolved!)).toBe(v.definitionHash);
  expect(await resolveBody(PID, 999)).toBeUndefined();
});

test.skipIf(!DB)("a published version and a test-instance sentinel never resolve to each other's body", async () => {
  const published = await publishBody(PID, simpleBody(), reg, dataSourceReg);
  const draftBody = { ...simpleBody(), label: { en: "Different Draft" } } as ProcessBody;
  const draftHash = definitionHash(draftBody);
  const sentinel = await createDraftSnapshot(PID, draftHash, draftBody, sql);

  const { resolveBody } = createDefinitionStore();
  const resolvedPublished = await resolveBody(PID, published.version);
  const resolvedDraft = await resolveBody(PID, sentinel);

  expect(definitionHash(resolvedPublished!)).toBe(published.definitionHash);
  expect(resolvedDraft).toEqual(draftBody);
  expect(definitionHash(resolvedDraft!)).not.toBe(published.definitionHash);
});

// --- 3.1-3.4: draft-instance creation path --------------------------------------

test.skipIf(!DB)("createProcessInstance creates a kind:'test' instance from a process's current draft, with no published version", async () => {
  await saveDraft(PID, { body: bodyWithLabel("A"), layout: {}, revision: 0, updatedBy: actor.id });
  const created = await createProcessInstance(PID, actor, dataSourceReg, { fromDraft: true });
  expect(created.kind).toBe("test");
  expect(created.processId).toBe(PID);
  expect(created.version).toBeLessThan(0);
});

test.skipIf(!DB)("a test instance's definitionHash matches the real JCS hash of its frozen draft body", async () => {
  await saveDraft(PID, { body: bodyWithLabel("A"), layout: {}, revision: 0, updatedBy: actor.id });
  const created = await createProcessInstance(PID, actor, dataSourceReg, { fromDraft: true });
  const { resolveBody } = createDefinitionStore();
  const frozen = await resolveBody(PID, created.version);
  expect(created.definitionHash).toBe(definitionHash(frozen!));
});

test.skipIf(!DB)("editing the draft after a test instance is created does not change the already-created instance's resolved body", async () => {
  await saveDraft(PID, { body: bodyWithLabel("A"), layout: {}, revision: 0, updatedBy: actor.id });
  const created = await createProcessInstance(PID, actor, dataSourceReg, { fromDraft: true });

  // Same expected revision (0) as the first save: saveDraft's own conditional
  // UPDATE treats a second `revision: 0` call as "still at 0", not a second create.
  await saveDraft(PID, { body: bodyWithLabel("Edited"), layout: {}, revision: 0, updatedBy: actor.id });

  const { resolveBody } = createDefinitionStore();
  const frozen = await resolveBody(PID, created.version);
  expect((frozen!.workflow.steps[0] as unknown as { label: { en: string } }).label.en).toBe("A");

  // A second test instance created after the edit reflects the new content —
  // each snapshot resolves independently.
  const created2 = await createProcessInstance(PID, actor, dataSourceReg, { fromDraft: true });
  const frozen2 = await resolveBody(PID, created2.version);
  expect((frozen2!.workflow.steps[0] as unknown as { label: { en: string } }).label.en).toBe("Edited");
});

test.skipIf(!DB)("an unresolvable draft (initialStep naming an absent step) fails creation with a diagnostic, typed error", async () => {
  const badBody = { ...bodyWithLabel("A"), workflow: { initialStep: "step_missing", steps: bodyWithLabel("A").workflow.steps } } as ProcessBody;
  await saveDraft(PID, { body: badBody, layout: {}, revision: 0, updatedBy: actor.id });

  let caught: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg, { fromDraft: true });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ZodError);

  // No instance and no snapshot left behind by the failed attempt.
  const rows = (await sql`SELECT count(*)::int AS n FROM instances WHERE body->>'processId' = ${PID}`) as { n: number }[];
  expect(rows[0]!.n).toBe(0);
  const snapRows = (await sql`SELECT count(*)::int AS n FROM draft_snapshots WHERE process_id = ${PID}`) as { n: number }[];
  expect(snapRows[0]!.n).toBe(0);
});

test.skipIf(!DB)("creating a test instance for a process with no draft at all fails with NotFoundError", async () => {
  let caught: unknown;
  try {
    await createProcessInstance("proc_no_draft_at_all" as ProcessId, actor, dataSourceReg, { fromDraft: true });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(NotFoundError);
});

// --- 5.1 / 5.2: listInstances excludes/includes a test instance -----------------

test.skipIf(!DB)("a participant-facing filter excludes a test instance the calling actor is claimant/candidate/startedBy on", async () => {
  const v = await publishBody(PID, bodyWithLabel("A"), reg, dataSourceReg);
  const testInst = await createInstance(v.definition, {
    processId: PID,
    version: v.version,
    kind: "test",
    startedBy: actor.id,
    assignment: { candidates: [actor.id], claimedBy: actor.id },
  });
  // Mirrors handleListInstances' scope=mine resolution (assignedTo + roles),
  // with no includeTestInstances opt-in.
  const page = await listInstances({ assignedTo: actor.id, assignedToRoles: actor.roles });
  expect(page.items.map((i) => i.instanceId)).not.toContain(testInst.instanceId);
});

test.skipIf(!DB)("administrative scope (includeTestInstances) includes a test instance like any other", async () => {
  const v = await publishBody(PID, bodyWithLabel("A"), reg, dataSourceReg);
  const testInst = await createInstance(v.definition, { processId: PID, version: v.version, kind: "test" });
  const page = await listInstances({ processId: PID, includeTestInstances: true });
  expect(page.items.map((i) => i.instanceId)).toContain(testInst.instanceId);
});

// --- 5.3 / 5.4: loadInstanceForActor (getInstanceView) --------------------------

const claimedTestInstance = async (): Promise<Instance> => {
  const v = await publishBody(PID, bodyWithLabel("A"), reg, dataSourceReg);
  return createInstance(v.definition, {
    processId: PID,
    version: v.version,
    kind: "test",
    startedBy: starter.id,
    assignment: { candidates: [claimant.id], claimedBy: claimant.id },
  });
};

test.skipIf(!DB)("a claimant who is not the test instance's startedBy is refused direct access via getInstanceView", async () => {
  const testInst = await claimedTestInstance();
  let caught: unknown;
  try {
    await getInstanceView(testInst.instanceId, claimant, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("the test instance's own startedBy retains access, and an administrative actor's direct access is unaffected", async () => {
  const testInst = await claimedTestInstance();
  const starterView = await getInstanceView(testInst.instanceId, starter, dataSourceReg);
  expect(starterView.instanceId).toBe(testInst.instanceId);
  const adminView = await getInstanceView(testInst.instanceId, adminActor, dataSourceReg);
  expect(adminView.instanceId).toBe(testInst.instanceId);
});

// --- 5.5: postComment / listComments --------------------------------------------

test.skipIf(!DB)("postComment and listComments apply the same startedBy-only narrowing for a non-administrative claimant on a test instance", async () => {
  const testInst = await claimedTestInstance();
  await postComment(testInst.instanceId, starter, "hello", sql);

  let postCaught: unknown;
  try {
    await postComment(testInst.instanceId, claimant, "should fail", sql);
  } catch (e) {
    postCaught = e;
  }
  expect(postCaught).toBeInstanceOf(AuthorizationError);

  const starterList = await listComments(testInst.instanceId, starter, {}, sql);
  expect(starterList.items).toHaveLength(1);

  let listCaught: unknown;
  try {
    await listComments(testInst.instanceId, claimant, {}, sql);
  } catch (e) {
    listCaught = e;
  }
  expect(listCaught).toBeInstanceOf(AuthorizationError);
});

// --- 5.6: uploadAttachment / listAttachments / getAttachment --------------------

test.skipIf(!DB)("uploadAttachment, listAttachments, and getAttachment apply the same startedBy-only narrowing on a test instance", async () => {
  const testInst = await claimedTestInstance();
  const data = new TextEncoder().encode("hello");

  const uploaded = await uploadAttachment(
    testInst.instanceId,
    starter,
    { filename: "f.txt", contentType: "text/plain", data, sizeBytes: data.length },
    sql,
  );

  let uploadCaught: unknown;
  try {
    await uploadAttachment(testInst.instanceId, claimant, { filename: "g.txt", contentType: "text/plain", data, sizeBytes: data.length }, sql);
  } catch (e) {
    uploadCaught = e;
  }
  expect(uploadCaught).toBeInstanceOf(AuthorizationError);

  const starterList = await listAttachments(testInst.instanceId, starter, {}, sql);
  expect(starterList.items).toHaveLength(1);

  let listCaught: unknown;
  try {
    await listAttachments(testInst.instanceId, claimant, {}, sql);
  } catch (e) {
    listCaught = e;
  }
  expect(listCaught).toBeInstanceOf(AuthorizationError);

  const got = await getAttachment(testInst.instanceId, uploaded.id, starter, sql);
  expect(got.filename).toBe("f.txt");

  let getCaught: unknown;
  try {
    await getAttachment(testInst.instanceId, uploaded.id, claimant, sql);
  } catch (e) {
    getCaught = e;
  }
  expect(getCaught).toBeInstanceOf(AuthorizationError);
});
