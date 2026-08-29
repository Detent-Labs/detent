/**
 * draft-test-instances, Phase 1 (Foundation): the `instances.kind` column and
 * `draft_snapshots` table (tasks.md section 1), and `resolveBody`'s fallback
 * for a negative (test-instance) version (section 2). DB-backed; skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance, createDraftSnapshot } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { getInstanceView } from "../src/runtime/api.js";
import { instance as instanceSchema } from "../src/schema/definition.js";
import { definitionHash } from "../src/schema/hash.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const PID = "proc_drafttest" as ProcessId;
const actor: Actor = { id: "user_1", roles: [] };
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
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, draft_snapshots`;
  if (DB) await clearInstanceAudit();
});

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
