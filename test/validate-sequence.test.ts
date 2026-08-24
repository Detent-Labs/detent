/**
 * validation-sequence-module: the shared publish-time validation module
 * (src/validate.ts) and its consequences for src/engine/definitions.ts.
 * Covers tasks.md group 6's engine-facing assertions. DB-backed cases skip
 * when DATABASE_URL is unset; pure-function cases (validateStructure,
 * validateReferences, checkProcessChainingTarget called directly) never
 * skip, mirroring registry-check.test.ts's style.
 */
import { readFileSync } from "node:fs";
import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import { z } from "zod";
import { sql, initSchema } from "../src/engine/store.js";
import {
  publishBody,
  CrossProcessValidationError,
  CelValidationError,
  RegistryValidationError,
} from "../src/engine/definitions.js";
import { createDefaultRegistry, createDefaultDataSourceRegistry } from "../src/engine/host.js";
import {
  createRegistry,
  createDataSourceRegistry,
  createDefaultAssignmentRegistry,
  describeTypeNames,
  PROCESS_START_ACTION_TYPE,
  type RegistryDescription,
} from "../src/engine/registry.js";
import { checkProcessChainingTarget } from "../src/cel/check.js";
import { validateStructure, validateReferences } from "../src/validate.js";
import { compileProcessBody, DurationValidationError, CompileValidationError } from "../src/schema/compile.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const cel = (src: string) => ({ lang: "cel", src });

function readExample(name: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

// --- Shared fixtures ------------------------------------------------------

let actionIdCounter = 0;
const action = (type: string, config: Record<string, unknown> = {}) => ({ id: `action_x${++actionIdCounter}`, type, config });

/** A single step carrying `actions` at every position registry-check.test.ts covers. */
const bodyWithActions = (opts: { onEntry?: unknown[] }): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", ...(opts.onEntry ? { onEntry: opts.onEntry } : {}), paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Target for chaining tests: one plain field, and one group field with a
// single leaf child — the group field's own id is a valid mapping target
// too (task 6.1a).
const chainTargetBody = (): ProcessBody =>
  ({
    key: "target",
    baseLocale: "en",
    label: { en: "Target" },
    fields: [
      { id: "field_t_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      {
        id: "field_t_group",
        key: "group",
        label: { en: "Group" },
        type: "group",
        fields: [{ id: "field_t_group_child", key: "child", label: { en: "Child" }, type: "string" }],
      },
    ],
    workflow: {
      initialStep: "step_t_entry",
      steps: [
        { id: "step_t_entry", key: "t_entry", label: { en: "Entry" }, type: "task", paths: [{ id: "path_t_done", key: "t_done", label: "T Done", to: "step_t_done", trigger: "automatic", priority: 1 }] },
        { id: "step_t_done", key: "t_done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// Actor: manual path from entry to a terminal step whose onEntry carries a
// process.start action (site A at steps[1].onEntry[0]).
const chainActorBody = (targetPid: string, mapping: Record<string, unknown>): ProcessBody =>
  ({
    key: "actor",
    baseLocale: "en",
    label: { en: "Actor" },
    fields: [{ id: "field_a_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a_entry",
      steps: [
        { id: "step_a_entry", key: "a_entry", label: { en: "Entry" }, type: "task", paths: [{ id: "path_a_done", key: "a_done", label: "A Done", to: "step_a_done", trigger: "manual" }] },
        {
          id: "step_a_done",
          key: "a_done",
          label: { en: "Done" },
          type: "task",
          terminal: true,
          onEntry: [{ id: "action_chain", type: PROCESS_START_ACTION_TYPE, config: { processId: targetPid, inputMapping: mapping } }],
        },
      ],
    },
  }) as unknown as ProcessBody;

let pidCounter = 0;
const nextPid = (label: string): ProcessId => `proc_vseq_${label}_${++pidCounter}` as ProcessId;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions`;
});

// --- 6.1 / 6.1a: both callers agree ---------------------------------------

describe("both callers report the same issues for one body", () => {
  test.skipIf(!DB)("6.1: a process.start mapping violation reaches the same message through publishBody and checkProcessChainingTarget directly", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const targetPid = nextPid("target1");
    const tv = await publishBody(targetPid, chainTargetBody(), registry, dataSourceReg);

    const actorBody = chainActorBody(tv.processId, { field_nonexistent: cel("data.amount") });
    const compiledActor = compileProcessBody(actorBody);

    const directIssues = checkProcessChainingTarget(compiledActor, { "steps[1].onEntry[0]": tv.definition });
    expect(directIssues.length).toBe(1);

    let caught: unknown;
    try {
      await publishBody(nextPid("actor1"), actorBody, registry, dataSourceReg);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CrossProcessValidationError);
    expect((caught as Error).message).toContain(directIssues[0]!.message);
  });

  test.skipIf(!DB)("6.1a: a mapping into a group-container field id passes both validateProcessChaining and checkProcessChainingTarget", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const targetPid = nextPid("target2");
    const tv = await publishBody(targetPid, chainTargetBody(), registry, dataSourceReg);

    // field_t_group is a group container, not a leaf — leafFields would drop
    // it, collectFieldsDeep does not.
    const actorBody = chainActorBody(tv.processId, { field_t_group: cel("data.amount") });
    const compiledActor = compileProcessBody(actorBody);

    const directIssues = checkProcessChainingTarget(compiledActor, { "steps[1].onEntry[0]": tv.definition });
    expect(directIssues.length).toBe(0);

    const av = await publishBody(nextPid("actor2"), actorBody, registry, dataSourceReg);
    expect(av.status).toBe("published");
  });
});

// --- 6.1b: validateReferences splits not-registered vs invalid-config -----

test("6.1b: actionTypeIssues and actionConfigIssues split with no duplicated not-registered entry", () => {
  const registry = createRegistry();
  registry.set("known", { handler: async () => ({}), configSchema: z.object({ ok: z.literal(true) }) });

  const body = bodyWithActions({ onEntry: [action("unknown.type"), action("known", { ok: false })] });
  const compiled = compileProcessBody(body);

  const registryDescription: RegistryDescription = {
    actionTypes: describeTypeNames(registry),
    assignmentStrategyTypes: [],
    dataSourceTypes: [],
  };
  const refs = validateReferences(compiled, {
    registryDescription,
    loadedChildren: {},
    targetsByLoc: {},
    registries: { registry, assignmentRegistry: createDefaultAssignmentRegistry(), dataSourceRegistry: createDataSourceRegistry() },
  });

  expect(refs.actionTypeIssues.length).toBe(1);
  expect(refs.actionTypeIssues[0]!.type).toBe("unknown.type");
  expect(refs.actionConfigIssues.length).toBe(1);
  expect(refs.actionConfigIssues[0]!.type).toBe("known");
});

// --- 6.6: a missing input reports not-run, never a pass -------------------

test("6.6: validateReferences without a live registry set reports registryConfig as not-run, never a pass", () => {
  const registry = createRegistry();
  registry.set("known", { handler: async () => ({}) });
  const body = bodyWithActions({ onEntry: [action("known")] });
  const compiled = compileProcessBody(body);

  const registryDescription: RegistryDescription = { actionTypes: describeTypeNames(registry), assignmentStrategyTypes: [], dataSourceTypes: [] };
  const refs = validateReferences(compiled, { registryDescription, loadedChildren: {}, targetsByLoc: {} });

  expect(refs.dimensions.registryConfig).toBe("not-run");
  expect(refs.actionConfigIssues).toEqual([]);
  expect(refs.assignmentConfigIssues).toEqual([]);
  expect(refs.dataSourceConfigIssues).toEqual([]);
});

// --- 6.7: an identical re-publish stays a no-op ----------------------------

test.skipIf(!DB)("6.7: an identical re-publish through the new sequence stays a no-op", async () => {
  const registry = createDefaultRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const pid = nextPid("noop");
  const body = chainTargetBody();

  const v1 = await publishBody(pid, body, registry, dataSourceReg);
  expect(v1.version).toBe(1);
  const v2 = await publishBody(pid, body, registry, dataSourceReg);
  expect(v2.version).toBe(1);

  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${pid}`) as { n: number }[];
  expect(rows[0]!.n).toBe(1);
});

// --- 6.8: the engine rejects and accepts exactly what it does today -------

describe("6.8: publishBody accepts and rejects exactly what it does today", () => {
  test.skipIf(!DB)("every shipped example still publishes", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDefaultDataSourceRegistry();
    // purchase-requisition.json names a custom assignment strategy no
    // default registry ships; only its resolvability at publish matters
    // here, not its runtime resolution.
    const assignmentReg = createDefaultAssignmentRegistry();
    assignmentReg.set("org.manager-of-starter", { resolve: async () => [] });

    // subprocess-loan-parent.json's own subprocess spec hardcodes its
    // child's processId as "proc_credit_check" — the child must publish
    // under that exact id for the parent to resolve it.
    await publishBody("proc_credit_check" as ProcessId, readExample("subprocess-credit-check-child.json"), registry, dataSourceReg);
    for (const name of ["expense-approval.json", "subprocess-loan-parent.json", "purchase-requisition.json"]) {
      const body = readExample(name);
      const v = await publishBody(nextPid(name.replace(/\W/g, "_")), body, registry, dataSourceReg, sql, assignmentReg);
      expect(v.status).toBe("published");
    }
  });

  test.skipIf(!DB)("an unregistered action type still raises RegistryValidationError", async () => {
    const registry = createRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const body = bodyWithActions({ onEntry: [action("nowhere.registered")] });
    await expect(publishBody(nextPid("badreg"), body, registry, dataSourceReg)).rejects.toBeInstanceOf(RegistryValidationError);
  });

  test.skipIf(!DB)("a duration-invalid timer still raises DurationValidationError", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [
          { id: "step_a", key: "a", label: { en: "A" }, type: "task", timers: [{ id: "timer_t", duration: "not-a-duration", onFire: { actions: [] } }] },
        ],
      },
    } as unknown as ProcessBody;
    await expect(publishBody(nextPid("badduration"), body, registry, dataSourceReg)).rejects.toBeInstanceOf(DurationValidationError);
  });
});

// --- 6.10: a chaining mapping violation raises CrossProcessValidationError, never CelValidationError ---

test.skipIf(!DB)("6.10: a process.start mapping violation raises CrossProcessValidationError, never CelValidationError", async () => {
  const registry = createDefaultRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const tv = await publishBody(nextPid("target10"), chainTargetBody(), registry, dataSourceReg);
  const actorBody = chainActorBody(tv.processId, { field_nonexistent: cel("data.amount") });

  let caught: unknown;
  try {
    await publishBody(nextPid("actor10"), actorBody, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(CrossProcessValidationError);
  expect(caught).not.toBeInstanceOf(CelValidationError);
});

// --- 6.11: duration + Zod invalid at once -> DurationValidationError, never ZodError ---

test.skipIf(!DB)("6.11: a body invalid in both duration and Zod raises DurationValidationError, never a ZodError", async () => {
  const registry = createDefaultRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const body = {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    // initialStep resolves to no step: a superRefine-only Zod violation.
    workflow: {
      initialStep: "step_missing",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", timers: [{ id: "timer_t", duration: "not-a-duration", onFire: { actions: [] } }] }],
    },
  } as unknown as ProcessBody;

  let caught: unknown;
  try {
    await publishBody(nextPid("dur_zod"), body, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DurationValidationError);
});

// --- 6.13: earlier-site mapping violation + later-site unresolvable target ---

test.skipIf(!DB)("6.13: an earlier mapping violation and a later unresolvable target still raise CrossProcessValidationError, naming the later resolution failure", async () => {
  const registry = createDefaultRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const tv = await publishBody(nextPid("target13"), chainTargetBody(), registry, dataSourceReg);

  const body = {
    key: "actor13",
    baseLocale: "en",
    label: { en: "Actor" },
    fields: [],
    workflow: {
      initialStep: "step_entry",
      steps: [
        { id: "step_entry", key: "entry", label: { en: "Entry" }, type: "task", paths: [{ id: "path_mid", key: "mid", label: "Mid", to: "step_mid", trigger: "manual" }] },
        {
          id: "step_mid",
          key: "mid",
          label: { en: "Mid" },
          type: "task",
          onEntry: [{ id: "action_a", type: PROCESS_START_ACTION_TYPE, config: { processId: tv.processId, inputMapping: { field_nonexistent: cel("1") } } }],
          paths: [{ id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual" }],
        },
        {
          id: "step_done",
          key: "done",
          label: { en: "Done" },
          type: "task",
          terminal: true,
          onEntry: [{ id: "action_b", type: PROCESS_START_ACTION_TYPE, config: { processId: "proc_vseq_never_published", inputMapping: {} } }],
        },
      ],
    },
  } as unknown as ProcessBody;

  let caught: unknown;
  try {
    await publishBody(nextPid("actor13"), body, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(CrossProcessValidationError);
  // The redesigned resolve-all-first pass reaches site B's (step_done)
  // resolution failure while resolving every site, before it ever runs
  // checkProcessChainingTarget on site A's (step_mid) earlier mapping
  // violation — so the surfaced message names the unresolvable target, not
  // the mapping violation.
  expect((caught as Error).message).toContain("proc_vseq_never_published");
  expect((caught as Error).message).toContain("not published");
});

// --- 6.15: action-registry + CEL invalid at once -> RegistryValidationError only ---

test.skipIf(!DB)("6.15: a body invalid in both action-registry and CEL raises RegistryValidationError, carrying only the registry issues", async () => {
  const registry = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const body = {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          onEntry: [{ id: "action_a", type: "nowhere.registered", config: {} }],
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "automatic", priority: 1, guard: cel("data.nope == 1") }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;

  let caught: unknown;
  try {
    await publishBody(nextPid("reg_cel"), body, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RegistryValidationError);
  expect((caught as RegistryValidationError).issues.every((i) => i.type === "nowhere.registered")).toBe(true);
});

// --- 6.16 / 6.16a: validateStructure's fall-through-to-Zod-only reporting ---

describe("validateStructure's fall-through-to-Zod-only reporting", () => {
  test("6.16: a timer missing onFire entirely reports only Zod issues, and never throws", () => {
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [],
      workflow: {
        initialStep: "step_a",
        // Reachable only via the JSON surface's raw-paste import path, never
        // through TimersPanel.tsx (which always sets onFire: {}).
        steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", timers: [{ id: "timer_t", duration: "PT1H" }] }],
      },
    };

    let result: ReturnType<typeof validateStructure> | undefined;
    expect(() => {
      result = validateStructure(body);
    }).not.toThrow();

    expect(result!.zodIssues.length).toBeGreaterThan(0);
    expect(result!.dimensions.duration).toBe("not-run");
    expect(result!.dimensions.structural).toBe("not-run");
    expect(result!.compiled).toBeUndefined();
    expect(result!.discardedError).toBeInstanceOf(TypeError);
  });

  test("6.16a: a body lacking workflow.steps entirely reports Zod issues with both dimensions not-run", () => {
    const result = validateStructure({});
    expect(result.dimensions.duration).toBe("not-run");
    expect(result.dimensions.structural).toBe("not-run");
    expect(result.dimensions.zod).toBe("ran");
    expect(result.zodIssues.length).toBeGreaterThan(0);
    expect(result.compiled).toBeUndefined();
    expect(result.discardedError).toBeUndefined();
  });
});

// --- 6.17: a module-owned dimension + cross-process/chaining invalid at once ---

test.skipIf(!DB)("6.17: an unregistered action type and an unresolvable chaining target at once raise the module-owned error, never CrossProcessValidationError", async () => {
  const registry = createRegistry();
  const dataSourceReg = createDataSourceRegistry();
  const body = {
    key: "p",
    baseLocale: "en",
    label: { en: "P" },
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          terminal: true,
          onEntry: [
            { id: "action_a", type: "nowhere.registered", config: {} },
            { id: "action_chain", type: PROCESS_START_ACTION_TYPE, config: { processId: "proc_vseq_never_published_17", inputMapping: {} } },
          ],
        },
      ],
    },
  } as unknown as ProcessBody;

  let caught: unknown;
  try {
    await publishBody(nextPid("reg_chain"), body, registry, dataSourceReg);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RegistryValidationError);
  expect(caught).not.toBeInstanceOf(CrossProcessValidationError);
});

// --- 6.18: validateStructure re-throws an untolerated error type ----------

test("6.18: validateStructure re-throws an error that is none of the four tolerated types", () => {
  const steps: unknown[] = [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }];
  (steps as { forEach: unknown }).forEach = () => {
    throw new RangeError("injected: not a tolerated error type");
  };
  const body = { key: "p", label: { en: "P" }, baseLocale: "en", fields: [], workflow: { initialStep: "step_a", steps } };

  expect(() => validateStructure(body)).toThrow(RangeError);
});

// --- 6.18a: a superRefine-only Zod violation falls through to Zod-only reporting ---

test("6.18a: a body clearing duration and structural but violating a superRefine-only rule reports only Zod issues, and never throws", () => {
  const body = {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_missing", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  };

  let result: ReturnType<typeof validateStructure> | undefined;
  expect(() => {
    result = validateStructure(body);
  }).not.toThrow();
  expect(result!.zodIssues.length).toBeGreaterThan(0);
  expect(result!.dimensions.duration).toBe("not-run");
  expect(result!.dimensions.structural).toBe("not-run");
});

// --- 6.18b: the idempotent compile branch narrows duration/structural to not-run ---

test("6.18b: validateStructure narrows duration/structural to not-run against the idempotent branch's own return", () => {
  const authored = readExample("subprocess-credit-check-child.json");
  const compiledOnce = compileProcessBody(authored);

  const result = validateStructure(compiledOnce);

  expect(result.zodIssues.length).toBeGreaterThan(0);
  expect(result.dimensions.duration).toBe("not-run");
  expect(result.dimensions.structural).toBe("not-run");
  expect(result.compiled).toBeDefined();
});

// --- 6.19: publishBody itself raises before ever computing a hash --------

describe("6.19: publishBody raises before ever computing a hash", () => {
  test.skipIf(!DB)("a duration-invalid body raises DurationValidationError with the same issues, and persists no row", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [],
      workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", timers: [{ id: "timer_t", duration: "bogus", onFire: { actions: [] } }] }] },
    } as unknown as ProcessBody;
    const pid = nextPid("dur19");

    await expect(publishBody(pid, body, registry, dataSourceReg)).rejects.toBeInstanceOf(DurationValidationError);
    const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${pid}`) as { n: number }[];
    expect(rows[0]!.n).toBe(0);
  });

  test.skipIf(!DB)("a structural-invalid body raises CompileValidationError with the same issues, and persists no row", async () => {
    const registry = createDefaultRegistry();
    const dataSourceReg = createDataSourceRegistry();
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true, onEntry: [{ id: "action_a", type: "core.notallowed", config: {} }] }],
      },
    } as unknown as ProcessBody;
    const pid = nextPid("struct19");

    await expect(publishBody(pid, body, registry, dataSourceReg)).rejects.toBeInstanceOf(CompileValidationError);
    const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${pid}`) as { n: number }[];
    expect(rows[0]!.n).toBe(0);
  });
});

// --- 6.20: a TypeError unrelated to onFire, from inside a structural check ---

test("6.20: a TypeError from inside a structural check, unrelated to onFire, is neither a clean pass nor a content-free ZodError", () => {
  // `body.fields` is untouched by validateDurations (which only walks
  // `workflow.steps`) and by Zod's own parse (which never calls an array's
  // own `.forEach` — it uses its own internal iteration, confirmed by task
  // 6.18's identical technique on `workflow.steps` above). Only a structural
  // check (`checkFieldTree`'s own `walkFieldsIndexed`, `compile.ts:223`)
  // calls `.forEach` on it, so overriding it isolates a TypeError to the
  // structural-check phase alone.
  const fields: unknown[] = [{ id: "field_a", key: "a", label: { en: "A" }, type: "string" }];
  (fields as { forEach: unknown }).forEach = () => {
    throw new TypeError("injected: unrelated to the onFire hazard");
  };
  const body = {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields,
    workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
  };

  const result = validateStructure(body);
  expect(result.dimensions.duration).toBe("not-run");
  expect(result.dimensions.structural).toBe("not-run");
  expect(result.zodIssues).toEqual([]);
  expect(result.discardedError).toBeInstanceOf(TypeError);
  expect(result.compiled).toBeUndefined();
});
