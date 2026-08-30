/**
 * The six standardized Instance scalars promoted to `GENERATED ALWAYS AS
 * (...) STORED` columns on `instances`: schema-init idempotency, one
 * INSERT/UPDATE check per column, and that the columns track a body update
 * with no separate write. DB-backed — skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { executeManualTransition } from "../src/engine/transition.js";
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
