/**
 * Store + transition, against a real Postgres. Skipped (not passed) when
 * DATABASE_URL is unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance, rehydrate, PinMismatch } from "../src/engine/store.js";
import {
  executeManualTransition,
  orderedTriggerActions,
  GuardRefused,
  ConcurrencyConflict,
} from "../src/engine/transition.js";
import type { ProcessBody, Instance, Step, Path, Action, HistoryEntry } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };

// bun's `expect(promise).rejects` matcher hangs against Bun.sql here; assert the
// caught error directly instead (same check, no matcher).
async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

// Trigger ordering is a pure function, so it is verified without a DB (dispatch
// is a no-op in this slice, so the executor cannot surface order at runtime yet).
const act = (marker: string): Action => ({ id: `action_${marker}`, type: marker, config: {} }) as unknown as Action;

test("orderedTriggerActions concatenates onExit(source) -> onPath -> onEntry(target)", () => {
  const source = { onExit: [act("exit1"), act("exit2")] } as unknown as Step;
  const path = { onPath: [act("path1")] } as unknown as Path;
  const target = { onEntry: [act("entry1")] } as unknown as Step;

  expect(orderedTriggerActions(source, path, target).map((a) => a.type)).toEqual([
    "exit1",
    "exit2",
    "path1",
    "entry1",
  ]);
});

test("orderedTriggerActions treats absent trigger arrays as empty", () => {
  expect(orderedTriggerActions({} as Step, {} as Path, {} as Step)).toEqual([]);
});

const bodyWith = (guardSrc?: string): ProcessBody =>
  ({
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: "A",
          type: "task",
          paths: [
            {
              id: "path_ab",
              key: "ab",
              to: "step_b",
              trigger: "manual",
              ...(guardSrc ? { guard: { lang: "cel", src: guardSrc } } : {}),
            },
          ],
        },
        { id: "step_b", key: "b", label: "B", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const histCount = async (id: string): Promise<number> => {
  const r = (await sql`SELECT count(*)::int AS n FROM history_entries WHERE instance_id = ${id}`) as { n: number }[];
  return r[0].n;
};
const seqOf = async (id: string): Promise<number> => {
  const r = (await sql`SELECT transition_seq AS s FROM instances WHERE instance_id = ${id}`) as { s: number }[];
  return r[0].s;
};
// Bun.sql returns jsonb as text; parse each entry. Ordered by seq.
const histEntries = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as {
    entry: unknown;
  }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry) : row.entry) as HistoryEntry);
};

// A three-step chain S -> M -> T (two manual hops), for multi-transition tests.
const chainBody = (): ProcessBody =>
  ({
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_am", key: "am", to: "step_m", trigger: "manual" }] },
        { id: "step_m", key: "m", label: "M", type: "task", paths: [{ id: "path_mt", key: "mt", to: "step_t", trigger: "manual" }] },
        { id: "step_t", key: "t", label: "T", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
// The shared `sql` singleton is not closed per-file: with more than one DB-backed
// test file sharing it, an early end() would break the others. bun's process exit
// reclaims the pool.

test.skipIf(!DB)("create then rehydrate round-trips against the pinned body", async () => {
  const body = bodyWith();
  const inst = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });
  expect(inst.currentStepId as string).toBe("step_a");
  expect(inst.transitionSeq).toBe(0);

  const loaded = await rehydrate(inst.instanceId, body);
  expect(loaded.instanceId).toBe(inst.instanceId);
  expect(loaded.definitionHash).toBe(inst.definitionHash);
});

test.skipIf(!DB)("rehydration against a mismatched body is rejected", async () => {
  const inst = await createInstance(bodyWith(), { processId: "proc_1" as Instance["processId"], version: 1 });
  const otherBody = bodyWith("1 > 0"); // different body -> different hash
  await rejectsWith(rehydrate(inst.instanceId, otherBody), PinMismatch);
});

test.skipIf(!DB)("a manual transition advances the step, bumps seq, appends one history entry", async () => {
  const body = bodyWith();
  const inst = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  const next = await executeManualTransition(inst, "path_ab", body, actor);
  expect(next.currentStepId as string).toBe("step_b");
  expect(next.transitionSeq).toBe(1);
  expect(next.status).toBe("completed"); // step_b is terminal
  expect(await seqOf(inst.instanceId)).toBe(1);

  const entries = await histEntries(inst.instanceId);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    cause: "user",
    fromStepId: "step_a",
    toStepId: "step_b",
    pathId: "path_ab",
    transitionSeq: 1,
    version: 1,
    actorId: "user_1",
  });
});

test.skipIf(!DB)("two sequential transitions each increment the seq and append one entry", async () => {
  const body = chainBody();
  const inst = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  const mid = await executeManualTransition(inst, "path_am", body, actor);
  expect(mid.currentStepId as string).toBe("step_m");
  expect(mid.transitionSeq).toBe(1);
  expect(mid.status).toBe("running"); // step_m is not terminal

  const end = await executeManualTransition(mid, "path_mt", body, actor);
  expect(end.currentStepId as string).toBe("step_t");
  expect(end.transitionSeq).toBe(2);
  expect(end.status).toBe("completed");

  const entries = await histEntries(inst.instanceId);
  expect(entries.map((e) => [e.transitionSeq, String(e.fromStepId), String(e.toStepId)])).toEqual([
    [1, "step_a", "step_m"],
    [2, "step_m", "step_t"],
  ]);
});

test.skipIf(!DB)("a false guard refuses the transition and leaves the instance put", async () => {
  const body = bodyWith("1 > 2");
  const inst = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  await rejectsWith(executeManualTransition(inst, "path_ab", body, actor), GuardRefused);
  expect(await seqOf(inst.instanceId)).toBe(0);
  expect(await histCount(inst.instanceId)).toBe(0);
});

test.skipIf(!DB)("two commits from the same seq: first wins, second conflicts, no partial write", async () => {
  const body = bodyWith();
  const inst = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  await executeManualTransition(inst, "path_ab", body, actor); // commits at seq 1
  // Second call reuses the stale seq-0 instance snapshot.
  await rejectsWith(executeManualTransition(inst, "path_ab", body, actor), ConcurrencyConflict);

  expect(await seqOf(inst.instanceId)).toBe(1);
  expect(await histCount(inst.instanceId)).toBe(1); // no second entry
});
