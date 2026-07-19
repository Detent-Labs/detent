/**
 * Definition store: publish (immutable, idempotent-on-identical, monotonic
 * version), resolve-from-pin with an immutable cache, and the store-backed
 * worker path (no longer inert). DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { sql, initSchema, createInstance, rehydrate } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { executeManualTransition } from "../src/engine/transition.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { drainTimers } from "../src/engine/timers.js";
import { createRegistry, register } from "../src/engine/registry.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { definitionHash } from "../src/schema/hash.js";
import type { ProcessBody, ProcessId, Instance, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const PID = "proc_defstore" as ProcessId;
const actor: Actor = { id: "user_1", roles: [] };
const cel = (src: string) => ({ lang: "cel", src });

// Authored wait-state body (no cancel-sink); publishBody compiles it. A `setterType`
// handler writes field_go; the automatic path fires when go == "yes".
const waitBody = (setterType: string): ProcessBody =>
  ({
    key: "wf",
    label: "Wait Flow",
    fields: [{ id: "field_go", key: "go", label: "Go", type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        {
          id: "step_wait", key: "wait", label: "Wait", type: "task",
          onEntry: [{ id: "action_set", type: setterType, config: {}, output: { field_go: cel("result.v") } } as unknown as Action],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }],
        },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Same wait-state, but step_wait carries a transition timer (bypasses the guard,
// takes path_go on fire). No onEntry setter — the timer, not a writeback, drives it.
const waitTimerBody = (): ProcessBody =>
  ({
    key: "wf", label: "Wait Flow",
    fields: [{ id: "field_go", key: "go", label: "Go", type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        {
          id: "step_wait", key: "wait", label: "Wait", type: "task",
          timers: [{ id: "timer_t1", duration: "PT1H", onFire: { targetPath: "path_go", actions: [] } }],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }],
        },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const reg = createRegistry();
register(reg, "sayYes", { handler: async () => ({ v: "yes" }) });

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions`;
});

// --- publish: persist + idempotent-on-identical -------------------------------

test.skipIf(!DB)("publishBody persists a version; an identical re-publish is a no-op", async () => {
  const body = waitBody("sayYes");
  const v1 = await publishBody(PID, body);
  expect(v1.version).toBe(1);
  expect(v1.status).toBe("published");
  expect(v1.definitionHash).toBe(definitionHash(compileProcessBody(body)));

  const v2 = await publishBody(PID, body); // identical -> no new version
  expect(v2.version).toBe(1);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(1);
});

// --- publish: a changed body gets the next version ----------------------------

test.skipIf(!DB)("publishing a changed body assigns version = latest + 1", async () => {
  await publishBody(PID, waitBody("sayYes"));
  const v2 = await publishBody(PID, waitBody("sayNo")); // different handler type -> different hash
  expect(v2.version).toBe(2);
});

// --- immutability: the PK forbids a body overwrite ----------------------------

test.skipIf(!DB)("an overwrite of an existing (processId, version) with a different body is refused", async () => {
  const v1 = await publishBody(PID, waitBody("sayYes"));
  const other = compileProcessBody(waitBody("sayNo"));
  // The failing INSERT wedges its connection post-error, so run it on a dedicated
  // client and close it — the shared pool stays clean for the next test.
  const c = new SQL(process.env.DATABASE_URL!);
  let threw = false;
  try {
    await c`INSERT INTO definitions (process_id, version, definition_hash, status, body)
      VALUES (${PID}, ${v1.version}, ${definitionHash(other)}, 'published', ${other})`;
  } catch {
    threw = true; // PK conflict on (process_id, version)
  } finally {
    await c.end();
  }
  expect(threw).toBe(true);
  const still = (await sql`SELECT definition_hash FROM definitions WHERE process_id = ${PID} AND version = ${v1.version}`) as { definition_hash: string }[];
  expect(still[0].definition_hash).toBe(v1.definitionHash); // unchanged
});

// --- resolve: pin check + absent pin ------------------------------------------

test.skipIf(!DB)("resolveBody returns a body that passes rehydrate's pin check; absent pin is undefined", async () => {
  const authored = waitBody("sayYes");
  const v = await publishBody(PID, authored);
  const { resolveBody } = createDefinitionStore();

  const body = await resolveBody(PID, v.version);
  expect(body).toBeDefined();
  // Create the instance from the resolved (compiled) body — its hash matches the pin.
  const inst = await createInstance(body!, { processId: PID, version: v.version });
  const re = await rehydrate(inst.instanceId, body!); // throws PinMismatch on a wrong body
  expect(re.instanceId).toBe(inst.instanceId);
  // An instance built from the authored body would hash-mismatch the store's body.
  expect(definitionHash(authored)).not.toBe(v.definitionHash);

  expect(await resolveBody(PID, 999)).toBeUndefined();
});

// --- cache: a second resolve fires no second SELECT ---------------------------

test.skipIf(!DB)("a resolved body is cached and served without re-reading the store", async () => {
  const v = await publishBody(PID, waitBody("sayYes"));
  // Count query calls on a proxy over the shared client: a cache hit issues none.
  let queries = 0;
  const counting = new Proxy(sql, {
    apply(target, thisArg, args) {
      queries++;
      return Reflect.apply(target as (...a: unknown[]) => unknown, thisArg, args);
    },
  }) as typeof sql;
  const { resolveBody } = createDefinitionStore(counting);
  const first = await resolveBody(PID, v.version); // 1 SELECT
  const second = await resolveBody(PID, v.version); // cache hit, no SELECT
  expect(second).toEqual(first);
  expect(queries).toBe(1);
});

// --- end-to-end: the store-backed worker path is live -------------------------

test.skipIf(!DB)("a parked wait-state re-resolves against the store-resolved body", async () => {
  const v = await publishBody(PID, waitBody("sayYes"));
  const { resolveBody } = createDefinitionStore();
  const body = (await resolveBody(PID, v.version))!;

  const inst = await createInstance(body, { processId: PID, version: v.version });
  await executeManualTransition(inst, "path_ab", body, actor); // park on step_wait
  expect(await drainOutbox(sql, reg)).toBe(1); // writes go="yes", flags 'pending'

  expect(await drainResolutions(sql, resolveBody)).toBe(1); // store-backed resolver
  const after = (await sql`SELECT body FROM instances WHERE instance_id = ${inst.instanceId}`) as { body: Instance }[];
  const state = typeof after[0].body === "string" ? JSON.parse(after[0].body as unknown as string) : after[0].body;
  expect(state.currentStepId).toBe("step_done");
  expect(state.status).toBe("completed");
});

// --- end-to-end: a due timer fires against the store-resolved body ------------

test.skipIf(!DB)("a due timer fires against the store-resolved body", async () => {
  const v = await publishBody(PID, waitTimerBody());
  const { resolveBody } = createDefinitionStore();
  const body = (await resolveBody(PID, v.version))!;

  const inst = await createInstance(body, { processId: PID, version: v.version });
  await executeManualTransition(inst, "path_ab", body, actor); // parks on step_wait, arms timer_t1 ~1h out
  // Backdate the timer so it is overdue (as timer.test.ts does for the scheduler).
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${inst.instanceId}`;

  expect(await drainTimers(sql, resolveBody)).toBe(1); // store-backed resolver fires it
  const after = (await sql`SELECT body FROM instances WHERE instance_id = ${inst.instanceId}`) as { body: Instance }[];
  const state = typeof after[0].body === "string" ? JSON.parse(after[0].body as unknown as string) : after[0].body;
  expect(state.currentStepId).toBe("step_done"); // timer bypassed the guard, took path_go
});
