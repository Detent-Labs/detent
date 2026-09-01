/**
 * The eleven standardized Instance keys promoted to `GENERATED ALWAYS AS
 * (...) STORED` columns on `instances`: schema-init idempotency, one
 * INSERT/UPDATE check per column, and that the columns track a body update
 * with no separate write. Change 1 promoted the six scalars; Change 2 added
 * `claimed_by`, `candidates`, `parent_instance_id`, `current_step_entered_at`
 * and `chained_from`, and retired the three expression indexes the first
 * three replace. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { executeManualTransition, claimStep, releaseClaim } from "../src/engine/transition.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import type { ProcessBody, ProcessId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const dsReg = createDataSourceRegistry();
const actor: Actor = { id: "user_1", roles: [] };

let n = 0;
const pid = () => `proc_colprom_${++n}` as ProcessId;

/** step_a (task, manual path to step_b), then step_b (terminal). No fields needed. */
const twoStepBody = (key: string): ProcessBody =>
  ({
    key,
    label: { en: key },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, migration_plans`;
  if (DB) await clearInstanceAudit();
});

async function publishAndCreate(P: ProcessId, startedBy?: string): Promise<Instance> {
  const v = (await publishBody(P, twoStepBody("colprom"), reg, dsReg)).version;
  const resolved = (await createDefinitionStore(sql).resolveBody(P, v))!;
  return createInstance(resolved, { processId: P, version: v, ...(startedBy !== undefined ? { startedBy } : {}) }, sql);
}

type Row = {
  process_id: string;
  version: number;
  status: string;
  current_step_id: string;
  started_by: string | null;
  started_at: string;
};
async function columnsOf(instanceId: string): Promise<Row> {
  const rows = (await sql`
    SELECT process_id, version, status, current_step_id, started_by, started_at
    FROM instances WHERE instance_id = ${instanceId}
  `) as Row[];
  return rows[0]!;
}

test.skipIf(!DB)("schema init adds the six generated columns and the started_at index, unchanged by a second run", async () => {
  await initSchema();
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'instances'
      AND column_name IN ('process_id', 'version', 'status', 'current_step_id', 'started_by', 'started_at')
    ORDER BY column_name
  `) as { column_name: string }[];
  expect(cols.map((c) => c.column_name)).toEqual(
    ["current_step_id", "process_id", "started_at", "started_by", "status", "version"],
  );

  const idxBefore = (await sql`SELECT indexname FROM pg_indexes WHERE indexname = 'instances_started_idx'`) as { indexname: string }[];
  expect(idxBefore).toHaveLength(1);

  await initSchema(); // second run must not throw or duplicate
  const idxAfter = (await sql`SELECT indexname FROM pg_indexes WHERE indexname = 'instances_started_idx'`) as { indexname: string }[];
  expect(idxAfter).toEqual(idxBefore);
});

test.skipIf(!DB)("process_id reads back the instance's processId", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.process_id).toBe(P);
});

test.skipIf(!DB)("version reads back the instance's version as an integer", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.version).toBe(inst.version);
});

test.skipIf(!DB)("status reads back the instance's status", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.status).toBe("running");
  expect(row.status).toBe(inst.status);
});

test.skipIf(!DB)("current_step_id reads back the instance's currentStepId", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.current_step_id).toBe("step_a");
  expect(row.current_step_id).toBe(inst.currentStepId as string);
});

test.skipIf(!DB)("started_by reads back the instance's startedBy", async () => {
  const P = pid();
  const inst = await publishAndCreate(P, "user_1");
  const row = await columnsOf(inst.instanceId);
  expect(row.started_by).toBe("user_1");
  expect(row.started_by).toBe(inst.startedBy ?? null);
});

test.skipIf(!DB)("started_by is null when the instance carries no startedBy", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.started_by).toBeNull();
  expect(inst.startedBy).toBeUndefined();
});

test.skipIf(!DB)("started_at reads back the instance's startedAt as the same ISO-8601 UTC string", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await columnsOf(inst.instanceId);
  expect(row.started_at).toBe(inst.startedAt);
});

test.skipIf(!DB)("a transition updates the generated columns with no separate write", async () => {
  const P = pid();
  const v = (await publishBody(P, twoStepBody("colprom"), reg, dsReg)).version;
  const resolved = (await createDefinitionStore(sql).resolveBody(P, v))!;
  const inst = await createInstance(resolved, { processId: P, version: v }, sql);

  const before = await columnsOf(inst.instanceId);
  expect(before.current_step_id).toBe("step_a");
  expect(before.status).toBe("running");

  await executeManualTransition(inst, "path_ab", resolved, actor);

  const after = await columnsOf(inst.instanceId);
  expect(after.current_step_id).toBe("step_b");
  expect(after.status).toBe("completed");
  // Untouched columns still match, in the same row.
  expect(after.process_id).toBe(P);
  expect(after.version).toBe(v);
});

// ---------------------------------------------------------------------------
// Change 2: the assignment pair, parent.instanceId, currentStepEnteredAt and
// chainedFrom.
// ---------------------------------------------------------------------------

const NEW_COLUMNS = [
  "candidates",
  "chained_from",
  "claimed_by",
  "current_step_entered_at",
  "parent_instance_id",
];
const NEW_INDEXES = ["instances_candidate_idx", "instances_claimed_idx", "instances_parent_instance_idx"];
const RETIRED_INDEXES = ["instances_candidates_idx", "instances_claimed_by_idx", "instances_parent_idx"];

const indexNames = async (names: string[]): Promise<string[]> => {
  const rows = (await sql`SELECT indexname FROM pg_indexes
    WHERE tablename = 'instances' AND indexname = ANY(${sql.array(names, "TEXT")})
    ORDER BY indexname`) as { indexname: string }[];
  return rows.map((r) => r.indexname);
};

type NewRow = {
  claimed_by: string | null;
  candidates: string[] | null;
  parent_instance_id: string | null;
  current_step_entered_at: string | null;
  chained_from: string | null;
};
async function newColumnsOf(instanceId: string): Promise<NewRow> {
  const rows = (await sql`
    SELECT claimed_by, candidates, parent_instance_id, current_step_entered_at, chained_from
    FROM instances WHERE instance_id = ${instanceId}
  `) as (Omit<NewRow, "candidates"> & { candidates: unknown })[];
  const row = rows[0]!;
  // Bun's driver hands a jsonb column back as a string on some paths.
  const c = typeof row.candidates === "string" ? (JSON.parse(row.candidates) as string[]) : row.candidates;
  return { ...row, candidates: (c as string[] | null) ?? null };
}

/**
 * step_b is assignment-bearing. Candidates resolve at step ENTRY, not at
 * creation, so every assignment case below transitions onto step_b first —
 * the shape test/assignment.engine.test.ts already uses.
 */
const assignedBody = (): ProcessBody =>
  ({
    key: "colprom2",
    label: { en: "colprom2" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["role_x", "user_1"] } } },
          paths: [{ id: "path_ba", key: "ba", label: "Ba", to: "step_a", trigger: "manual" }],
        },
      ],
    },
  }) as unknown as ProcessBody;

/** Creates an instance on the assigned body and transitions it onto step_b. */
async function onAssignedStep(P: ProcessId): Promise<Instance> {
  const v = (await publishBody(P, assignedBody(), reg, dsReg)).version;
  const resolved = (await createDefinitionStore(sql).resolveBody(P, v))!;
  const inst = await createInstance(resolved, { processId: P, version: v }, sql);
  return executeManualTransition(inst, "path_ab", resolved, actor);
}

test.skipIf(!DB)("schema init adds the five Change 2 columns, unchanged by a second run", async () => {
  await initSchema();
  const read = async () =>
    ((await sql`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'instances' AND column_name = ANY(${sql.array(NEW_COLUMNS, "TEXT")})
      ORDER BY column_name`) as { column_name: string }[]).map((c) => c.column_name);
  const first = await read();
  expect(first).toEqual(NEW_COLUMNS);
  await initSchema(); // second run must not throw or duplicate
  expect(await read()).toEqual(first);
});

test.skipIf(!DB)("schema init creates the three column indexes, unchanged by a second run", async () => {
  await initSchema();
  const first = await indexNames(NEW_INDEXES);
  expect(first).toEqual(NEW_INDEXES);
  await initSchema();
  expect(await indexNames(NEW_INDEXES)).toEqual(first);
});

test.skipIf(!DB)("schema init retires the three expression indexes the columns replace", async () => {
  // Recreate them as a database predating this change would carry them, then
  // confirm initSchema drops all three.
  await sql`CREATE INDEX IF NOT EXISTS instances_claimed_by_idx ON instances ((body->'assignment'->>'claimedBy'))`;
  await sql`CREATE INDEX IF NOT EXISTS instances_candidates_idx ON instances USING GIN ((body->'assignment'->'candidates'))`;
  await sql`CREATE INDEX IF NOT EXISTS instances_parent_idx ON instances ((body->'parent'->>'instanceId'))`;
  expect(await indexNames(RETIRED_INDEXES)).toEqual(RETIRED_INDEXES);

  await initSchema();
  expect(await indexNames(RETIRED_INDEXES)).toEqual([]);
});

test.skipIf(!DB)("candidates reads back the instance's assignment candidates as a jsonb array", async () => {
  const inst = await onAssignedStep(pid());

  const row = await newColumnsOf(inst.instanceId);
  expect(row.candidates).toEqual(["role_x", "user_1"]);
  expect(row.candidates).toEqual(inst.assignment!.candidates as string[]);
  expect(row.claimed_by).toBeNull();
});

test.skipIf(!DB)("claimed_by follows a claim and a release with no separate write", async () => {
  const inst = await onAssignedStep(pid());
  expect((await newColumnsOf(inst.instanceId)).claimed_by).toBeNull();

  const claimed = await claimStep(inst.instanceId, actor);
  expect(claimed.assignment?.claimedBy).toBe(actor.id);
  expect((await newColumnsOf(inst.instanceId)).claimed_by).toBe(actor.id);

  const released = await releaseClaim(inst.instanceId, actor);
  expect(released.assignment?.claimedBy).toBeUndefined();
  expect((await newColumnsOf(inst.instanceId)).claimed_by).toBeNull();
});

test.skipIf(!DB)("current_step_entered_at reads back the body key, and follows a transition", async () => {
  const P = pid();
  const v = (await publishBody(P, twoStepBody("colprom"), reg, dsReg)).version;
  const resolved = (await createDefinitionStore(sql).resolveBody(P, v))!;
  const inst = await createInstance(resolved, { processId: P, version: v }, sql);

  const before = await newColumnsOf(inst.instanceId);
  expect(before.current_step_entered_at).toBe(inst.currentStepEnteredAt!);
  expect(before.current_step_entered_at).toBe(inst.startedAt); // set to startedAt at creation

  const after = await executeManualTransition(inst, "path_ab", resolved, actor);
  const row = await newColumnsOf(inst.instanceId);
  expect(row.current_step_entered_at).toBe(after.currentStepEnteredAt!);
  expect(row.current_step_entered_at).not.toBe(before.current_step_entered_at);
});

test.skipIf(!DB)("parent_instance_id and chained_from read back their body keys", async () => {
  const P = pid();
  const v = (await publishBody(P, twoStepBody("colprom"), reg, dsReg)).version;
  const resolved = (await createDefinitionStore(sql).resolveBody(P, v))!;
  const parent = await createInstance(resolved, { processId: P, version: v }, sql);
  const child = await createInstance(
    resolved,
    { processId: P, version: v, parent: { instanceId: parent.instanceId, stepId: "step_a" } } as never,
    sql,
  );
  const chained = await createInstance(
    resolved,
    { processId: P, version: v, chainedFrom: parent.instanceId } as never,
    sql,
  );

  expect((await newColumnsOf(child.instanceId)).parent_instance_id).toBe(parent.instanceId);
  expect((await newColumnsOf(chained.instanceId)).chained_from).toBe(parent.instanceId);
});

test.skipIf(!DB)("an absent parent, chainedFrom or claimedBy reads as SQL NULL", async () => {
  const P = pid();
  const inst = await publishAndCreate(P);
  const row = await newColumnsOf(inst.instanceId);
  expect(row.parent_instance_id).toBeNull();
  expect(row.chained_from).toBeNull();
  expect(row.claimed_by).toBeNull();
  // twoStepBody's step_a declares no assignment, so candidates is absent too.
  expect(row.candidates).toBeNull();
  expect(inst.parent).toBeUndefined();
  expect(inst.chainedFrom).toBeUndefined();
});
