/**
 * Definition store: publish (immutable, idempotent-on-identical, monotonic
 * version), resolve-from-pin with an immutable cache, and the store-backed
 * worker path (no longer inert). DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { SQL } from "bun";
import { z } from "zod";
import { sql, initSchema, createInstance, rehydrate } from "../src/engine/store.js";
import { publishBody, createDefinitionStore, listProcesses, listVersions, CelValidationError, RegistryValidationError } from "../src/engine/definitions.js";
import { executeManualTransition } from "../src/engine/transition.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { drainTimers } from "../src/engine/timers.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { HTTP_ACTION_TYPE, httpHandlerDef } from "../src/handlers/http.js";
import { NOTIFICATION_EMAIL_ACTION_TYPE, notificationEmailHandlerDef } from "../src/handlers/notification-email.js";
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
    label: { en: "Wait Flow" },
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        {
          id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task",
          onEntry: [{ id: "action_set", type: setterType, config: {}, output: { field_go: cel("result.v") } } as unknown as Action],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }],
        },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Same wait-state, but step_wait carries a transition timer (bypasses the guard,
// takes path_go on fire). No onEntry setter — the timer, not a writeback, drives it.
const waitTimerBody = (): ProcessBody =>
  ({
    key: "wf", label: { en: "Wait Flow" }, baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        {
          id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task",
          timers: [{ id: "timer_t1", duration: "PT1H", onFire: { targetPath: "path_go", actions: [] } }],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }],
        },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const reg = createRegistry();
reg.set("sayYes", { handler: async () => ({ v: "yes" }) });
reg.set("sayNo", { handler: async () => ({ v: "no" }) });
reg.set("strict", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions`;
});

// --- publish: persist + idempotent-on-identical -------------------------------

test.skipIf(!DB)("publishBody persists a version; an identical re-publish is a no-op", async () => {
  const body = waitBody("sayYes");
  const v1 = await publishBody(PID, body, reg, dataSourceReg);
  expect(v1.version).toBe(1);
  expect(v1.status).toBe("published");
  expect(v1.definitionHash).toBe(definitionHash(compileProcessBody(body)));

  const v2 = await publishBody(PID, body, reg, dataSourceReg); // identical -> no new version
  expect(v2.version).toBe(1);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(1);
});

// --- publish: a changed body gets the next version ----------------------------

test.skipIf(!DB)("publishing a changed body assigns version = latest + 1", async () => {
  await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const v2 = await publishBody(PID, waitBody("sayNo"), reg, dataSourceReg); // different handler type -> different hash
  expect(v2.version).toBe(2);
});

// --- immutability: the PK forbids a body overwrite ----------------------------

test.skipIf(!DB)("an overwrite of an existing (processId, version) with a different body is refused", async () => {
  const v1 = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
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

// --- publish rejects a body carrying an invalid expression --------------------

// waitBody with one expression swapped, at each of the two sites the check covers.
// steps[1] is step_wait; the compile pass appends the cancel sink AFTER the authored
// steps, so authored indices are the same in the compiled body the check sees.
const bodyWithGuard = (src: string): ProcessBody => {
  const b = waitBody("sayYes") as unknown as Record<string, any>;
  b.workflow.steps[1].paths[0].guard = cel(src);
  return b as unknown as ProcessBody;
};
const bodyWithOutput = (src: string): ProcessBody => {
  const b = waitBody("sayYes") as unknown as Record<string, any>;
  b.workflow.steps[1].onEntry[0].output.field_go = cel(src);
  return b as unknown as ProcessBody;
};

const publishFails = async (body: ProcessBody): Promise<CelValidationError> => {
  let caught: unknown;
  try {
    await publishBody(PID, body, reg, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(CelValidationError);
  return caught as CelValidationError;
};

const definitionCount = async (): Promise<number> => {
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  return rows[0].n;
};

test.skipIf(!DB)("publish rejects an unparseable expression and writes no row", async () => {
  const err = await publishFails(bodyWithGuard("data.go =="));
  expect(err.issues.length).toBe(1);
  expect(err.issues[0]!.loc).toBe("steps[1].paths[0].guard");
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("publish rejects an unknown field reference and a type mismatch", async () => {
  const unknown = await publishFails(bodyWithGuard('data.nope == "x"'));
  expect(unknown.issues[0]!.loc).toBe("steps[1].paths[0].guard");
  expect(unknown.message.toLowerCase()).toContain("nope");

  const mismatch = await publishFails(bodyWithGuard("data.go > 5"));
  expect(mismatch.issues[0]!.loc).toBe("steps[1].paths[0].guard");

  expect(await definitionCount()).toBe(0);
});

// An Action.output expression is evaluated post-commit against `{result}` alone,
// so a `data` reference here would type-check and then throw on every delivery,
// re-invoking the external handler on each retry.
test.skipIf(!DB)("publish rejects an Action.output expression that reads data", async () => {
  const err = await publishFails(bodyWithOutput("data.go"));
  expect(err.issues[0]!.loc).toBe("steps[1].onEntry.actions[0].output.field_go");
  expect(await definitionCount()).toBe(0);
});

// One publish surfaces one publish's worth of fixes, not a fix-and-retry loop.
test.skipIf(!DB)("a rejected publish reports every issue, not only the first", async () => {
  const b = waitBody("sayYes") as unknown as Record<string, any>;
  b.workflow.steps[1].paths[0].guard = cel('data.nope == "x"');
  b.workflow.steps[1].onEntry[0].output.field_go = cel("data.go");

  const err = await publishFails(b as unknown as ProcessBody);
  expect(err.issues.map((i) => i.loc).sort()).toEqual([
    "steps[1].onEntry.actions[0].output.field_go",
    "steps[1].paths[0].guard",
  ]);
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("a rejected publish consumes no version number", async () => {
  await publishFails(bodyWithGuard("data.go =="));
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  expect(v.version).toBe(1); // not 2 — the rejected publish reserved nothing
});

// The check runs AFTER the hash-hit lookup, so a version stored before the check
// existed (or before it tightened) still re-publishes as a no-op. This is the
// publish-path placement `definition-contract` argues for an unbypassable check.
// Inserted directly here because publishBody itself would now refuse to create it.
test.skipIf(!DB)("re-publishing an already-stored body is a no-op, not re-validated", async () => {
  const legacy = compileProcessBody(bodyWithGuard('data.nope == "x"'));
  const hash = definitionHash(legacy);
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${hash}, 'published', ${legacy})`;

  const v = await publishBody(PID, bodyWithGuard('data.nope == "x"'), reg, dataSourceReg);
  expect(v.version).toBe(1);
  expect(v.definitionHash).toBe(hash);
  expect(await definitionCount()).toBe(1);
});

// The load-bearing consequence of putting the check on the WRITE path: a version
// stored before the check existed still READS, and its pinned instances still
// rehydrate. `definition-contract` states the general placement rule this test
// exercises for `publishBody`'s checks.
test.skipIf(!DB)("a body stored before the check still reads and its instances rehydrate", async () => {
  const legacy = compileProcessBody(bodyWithGuard('data.nope == "x"'));
  const hash = definitionHash(legacy);
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${hash}, 'published', ${legacy})`;

  const { resolveBody } = createDefinitionStore();
  const resolved = (await resolveBody(PID, 1))!; // read path: no CEL involved
  expect(definitionHash(resolved)).toBe(hash);

  const inst = await createInstance(resolved, { processId: PID, version: 1 });
  const re = await rehydrate(inst.instanceId, resolved); // throws PinMismatch if the pin disagrees
  expect(re.instanceId).toBe(inst.instanceId);
});

// --- publish rejects a body carrying an invalid action (registry) -------------

const bodyWithActionType = (type: string, config: Record<string, unknown> = {}): ProcessBody => {
  const b = waitBody("sayYes") as unknown as Record<string, any>;
  b.workflow.steps[1].onEntry[0].type = type;
  b.workflow.steps[1].onEntry[0].config = config;
  return b as unknown as ProcessBody;
};

const publishRegistryFails = async (body: ProcessBody, registry = reg): Promise<RegistryValidationError> => {
  let caught: unknown;
  try {
    await publishBody(PID, body, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RegistryValidationError);
  return caught as RegistryValidationError;
};

test.skipIf(!DB)("publish rejects an unregistered action type and writes no row", async () => {
  const err = await publishRegistryFails(bodyWithActionType("neverRegistered"));
  expect(err.issues.length).toBe(1);
  expect(err.issues[0]!.loc).toBe("steps[1].onEntry[0]");
  expect(err.issues[0]!.type).toBe("neverRegistered");
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("publish rejects a config that violates its handler's declared schema", async () => {
  const err = await publishRegistryFails(bodyWithActionType("strict", { to: 42 }));
  expect(err.issues.length).toBe(1);
  expect(err.issues[0]!.type).toBe("strict");
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("a rejected registry publish consumes no version number", async () => {
  await publishRegistryFails(bodyWithActionType("neverRegistered"));
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  expect(v.version).toBe(1); // not 2 — the rejected publish reserved nothing
});

// Same placement guarantee as the CEL check: the registry check runs AFTER the
// hash-hit lookup, so a version published before a handler was registered (or
// before its configSchema tightened) is not retroactively rejected.
test.skipIf(!DB)("re-publishing an already-stored body is a no-op even against an empty registry", async () => {
  const legacy = compileProcessBody(bodyWithActionType("neverRegistered"));
  const hash = definitionHash(legacy);
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${hash}, 'published', ${legacy})`;

  const emptyReg = createRegistry(); // "neverRegistered" is not in here either
  const v = await publishBody(PID, bodyWithActionType("neverRegistered"), emptyReg, dataSourceReg);
  expect(v.version).toBe(1);
  expect(v.definitionHash).toBe(hash);
  expect(await definitionCount()).toBe(1);
});

test.skipIf(!DB)("re-publishing an already-stored body is a no-op even after its handler's config schema tightens", async () => {
  const legacy = compileProcessBody(bodyWithActionType("strict", { to: 42 })); // violates the schema below
  const hash = definitionHash(legacy);
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${hash}, 'published', ${legacy})`;

  const tightened = createRegistry();
  tightened.set("strict", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
  const v = await publishBody(PID, bodyWithActionType("strict", { to: 42 }), tightened, dataSourceReg);
  expect(v.version).toBe(1);
  expect(v.definitionHash).toBe(hash);
  expect(await definitionCount()).toBe(1);
});

// --- publish rejects an invalid http.request config (registry-check integration) --
// Confirms httpConfigSchema is actually wired as this handler's configSchema, not
// just unit-tested in isolation (handlers-http.test.ts covers the schema/handler
// behavior directly; this is the one integration point through publishBody).

test.skipIf(!DB)("publish rejects an http.request action with a missing url", async () => {
  const httpReg = createRegistry();
  httpReg.set(HTTP_ACTION_TYPE, httpHandlerDef);
  const err = await publishRegistryFails(bodyWithActionType(HTTP_ACTION_TYPE, { method: "POST" }), httpReg);
  expect(err.issues[0]!.type).toBe(HTTP_ACTION_TYPE);
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("publish rejects an http.request action with method GET and a body", async () => {
  const httpReg = createRegistry();
  httpReg.set(HTTP_ACTION_TYPE, httpHandlerDef);
  const err = await publishRegistryFails(
    bodyWithActionType(HTTP_ACTION_TYPE, { url: "http://example.com", method: "GET", body: { a: 1 } }),
    httpReg,
  );
  expect(err.issues[0]!.type).toBe(HTTP_ACTION_TYPE);
  expect(await definitionCount()).toBe(0);
});

// The same integration point for notification.email: handlers-notification-
// email.test.ts covers the schema and the handler directly, this is the one
// test that notificationEmailConfigSchema reaches publishBody.

test.skipIf(!DB)("publish rejects a notification.email action with a malformed recipient", async () => {
  const mailReg = createRegistry();
  mailReg.set(NOTIFICATION_EMAIL_ACTION_TYPE, notificationEmailHandlerDef);
  const err = await publishRegistryFails(
    bodyWithActionType(NOTIFICATION_EMAIL_ACTION_TYPE, { to: ["not-an-address"], subject: "s", body: "b" }),
    mailReg,
  );
  expect(err.issues[0]!.type).toBe(NOTIFICATION_EMAIL_ACTION_TYPE);
  expect(await definitionCount()).toBe(0);
});

// --- publish round-trips through validation -----------------------------------

// An authored body carrying content the contract does not declare.
// harden-publish-validation: this is now a publish-time rejection
// (src/schema/compile.ts::checkUnknownKeys), not silent stripping — see
// test/cancel.test.ts's "compile: unknown keys are rejected, not stripped"
// for the compile-pass-level coverage. This file keeps the round-trip/hash-
// stability tests below it, now against a CLEAN body: their point is
// definitionHash reproducibility and rehydration, not the unknown-key check
// itself.
const dirtyBody = (): ProcessBody => {
  const b = waitBody("sayYes") as unknown as Record<string, any>;
  b.uiMeta = { editor: "v1", palette: ["#fff"] };
  b.workflow.steps[0].editorNote = "drawn at 120,40";
  return b as unknown as ProcessBody;
};

test.skipIf(!DB)("unknown authored keys are rejected at publish, nothing is persisted", async () => {
  await expect(publishBody(PID, dirtyBody(), reg, dataSourceReg)).rejects.toThrow();
  expect(await definitionCount()).toBe(0);
});

test.skipIf(!DB)("a publish -> read round trip is hash-stable", async () => {
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const { resolveBody } = createDefinitionStore();
  const resolved = (await resolveBody(PID, v.version))!;
  // The pin is only meaningful if the body every reader gets recomputes to it.
  expect(definitionHash(resolved)).toBe(v.definitionHash);
});

test.skipIf(!DB)("an instance created from the publish return value rehydrates", async () => {
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const { resolveBody } = createDefinitionStore();
  const resolved = (await resolveBody(PID, v.version))!;

  // CLAUDE.md's documented-correct path: create from the body publish returned.
  const inst = await createInstance(v.definition, { processId: PID, version: v.version });
  const re = await rehydrate(inst.instanceId, resolved); // throws PinMismatch if the pin disagrees
  expect(re.instanceId).toBe(inst.instanceId);
});

test.skipIf(!DB)("re-publishing the read-back body is a hash-matched no-op", async () => {
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const { resolveBody } = createDefinitionStore();
  const resolved = (await resolveBody(PID, v.version))!;

  const again = await publishBody(PID, resolved, reg, dataSourceReg);
  expect(again.version).toBe(v.version);
  expect(again.definitionHash).toBe(v.definitionHash);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(1);
});

// --- resolve: pin check + absent pin ------------------------------------------

test.skipIf(!DB)("resolveBody returns a body that passes rehydrate's pin check; absent pin is undefined", async () => {
  const authored = waitBody("sayYes");
  const v = await publishBody(PID, authored, reg, dataSourceReg);
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

// --- resolveLatest: newest version for a processId, no contract filter --------
// See openspec/changes/runtime-api-layer: backs createProcessInstance's default
// version resolution.

test.skipIf(!DB)("resolveLatest returns the newest published version, and undefined for an unpublished process", async () => {
  const v1 = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const v2 = await publishBody(PID, waitBody("sayNo"), reg, dataSourceReg); // differing body -> next version
  expect(v2.version).toBe(v1.version + 1);

  const { resolveLatest } = createDefinitionStore();
  const latest = await resolveLatest(PID);
  expect(latest?.version).toBe(v2.version);
  expect(definitionHash(latest!.body)).toBe(v2.definitionHash);

  expect(await resolveLatest("proc_never_published" as ProcessId)).toBeUndefined();
});

// --- cache: a second resolve fires no second SELECT ---------------------------

test.skipIf(!DB)("a resolved body is cached and served without re-reading the store", async () => {
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
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
  const v = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
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
  const v = await publishBody(PID, waitTimerBody(), reg, dataSourceReg);
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

// --- listProcesses / listVersions ----------------------------------------------

const PID2 = "proc_defstore_2" as ProcessId;

test.skipIf(!DB)("listProcesses lists two published processes with their newest version, no bodies", async () => {
  const v1 = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const v2 = await publishBody(PID2, waitBody("sayNo"), reg, dataSourceReg);

  const processes = await listProcesses();
  const byId = new Map(processes.map((p) => [p.processId, p]));
  expect(byId.get(PID)?.version).toBe(v1.version);
  expect(byId.get(PID)?.definitionHash).toBe(v1.definitionHash);
  expect(byId.get(PID)?.key).toBe("wf");
  expect(byId.get(PID)?.label).toEqual({ en: "Wait Flow" });
  expect(byId.get(PID)?.baseLocale).toBe("en");
  expect(byId.get(PID2)?.version).toBe(v2.version);
  for (const p of processes) expect((p as unknown as { body?: unknown }).body).toBeUndefined();
});

test.skipIf(!DB)("listProcesses reports the newest version after a changed re-publish", async () => {
  await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const v2 = await publishBody(PID, waitTimerBody(), reg, dataSourceReg);

  const processes = await listProcesses();
  const entry = processes.find((p) => p.processId === PID)!;
  expect(entry.version).toBe(2);
  expect(entry.definitionHash).toBe(v2.definitionHash);
});

test.skipIf(!DB)("listProcesses on an empty store lists nothing", async () => {
  const processes = await listProcesses();
  expect(processes).toEqual([]);
});

test.skipIf(!DB)("listVersions lists a twice-published process's versions in order, no bodies", async () => {
  const v1 = await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  const v2 = await publishBody(PID, waitTimerBody(), reg, dataSourceReg);

  const versions = await listVersions(PID);
  expect(versions.map((v) => v.version)).toEqual([1, 2]);
  expect(versions[0]!.definitionHash).toBe(v1.definitionHash);
  expect(versions[1]!.definitionHash).toBe(v2.definitionHash);
  for (const v of versions) expect((v as unknown as { body?: unknown }).body).toBeUndefined();
});

test.skipIf(!DB)("listVersions after an identical re-publish still lists exactly one version", async () => {
  await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg);
  await publishBody(PID, waitBody("sayYes"), reg, dataSourceReg); // identical body -> no-op

  const versions = await listVersions(PID);
  expect(versions.length).toBe(1);
});

test.skipIf(!DB)("listVersions of an unpublished process is an empty list, not an error", async () => {
  const versions = await listVersions("proc_never_published" as ProcessId);
  expect(versions).toEqual([]);
});

// technical-field-marker: definitionHash reproducibility for the new
// FieldDef.technical key. Pure over compileProcessBody/definitionHash, no DB.
test("a body declaring no field's technical hashes as before this change", () => {
  const body = waitBody("sayYes");
  expect(definitionHash(compileProcessBody(body))).toBe(definitionHash(compileProcessBody(structuredClone(body))));
});

test("a field declaring technical: false hashes differently from the same body with the key omitted", () => {
  const withKey = waitBody("sayYes");
  (withKey.fields[0] as unknown as { technical: boolean }).technical = false;
  const withoutKey = waitBody("sayYes");

  expect(definitionHash(compileProcessBody(withKey))).not.toBe(definitionHash(compileProcessBody(withoutKey)));
});
