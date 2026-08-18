import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import {
  processVersion,
  processBody,
  publishedProcessBody,
  instanceEvent,
  migrationSpec,
  MAX_TIMER_DURATION_MS,
  checkPathTriggerConsistency,
  type ProcessBody,
} from "../src/schema/definition.js";
import { compileProcessBody, validateDurations, DurationValidationError } from "../src/schema/compile.js";
import { definitionHash } from "../src/schema/hash.js";

const raw = JSON.parse(
  readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"),
);

const rejects = (mutate: (d: any) => void): boolean => {
  const bad = structuredClone(raw);
  mutate(bad);
  return !processVersion.safeParse(bad).success;
};

describe("expense-approval definition", () => {
  it("validates the example", () => {
    expect(processVersion.safeParse(raw).success).toBe(true);
  });

  it("rejects an unresolved path target", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].paths[0].to = "step_does_not_exist";
    })).toBe(true);
  });

  it("rejects the dead definitionStatus members 'deprecated' and 'archived'", () => {
    expect(rejects((d) => {
      d.status = "deprecated";
    })).toBe(true);
    expect(rejects((d) => {
      d.status = "archived";
    })).toBe(true);
  });

  it("rejects an outcome on a non-terminal step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].outcome = "booked";
    })).toBe(true);
  });

  it("rejects mixed manual+automatic paths on one step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[1].paths.push({
        id: "path_bbbb2222-9999-4a1c-8e2f-000000000099",
        key: "auto",
        to: "step_aaaa1111-0003-4a1c-8e2f-000000000003",
        trigger: "automatic",
        guard: { lang: "cel", src: "true" },
      });
    })).toBe(true);
  });

  it("rejects automatic paths without unique priority", () => {
    expect(rejects((d) => {
      const book = d.definition.workflow.steps[2];
      book.paths[0].priority = 5;
      book.paths[1].priority = 5;
    })).toBe(true);
  });

  it("rejects a terminal outcome not in the contract", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[3].outcome = "not_declared";
    })).toBe(true);
  });

  it("rejects options and dataSource together on a field", () => {
    expect(rejects((d) => {
      d.definition.fields[3].dataSource = "ds_something";
    })).toBe(true);
  });

  it("rejects an id with the wrong prefix", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].id = "node_wrongprefix";
    })).toBe(true);
  });

  it("keeps validity after a label rename", () => {
    const rename = structuredClone(raw);
    rename.definition.workflow.steps[1].label = { en: "Erste Pruefung" };
    expect(processVersion.safeParse(rename).success).toBe(true);
  });

  // A second action reachable by the booking transition (step_book.onEntry
  // already maps field ...0004) mapping the same field is the last-writer hazard.
  const dupOutputAction = (field: string) => ({
    id: "action_dddddddd-0000-4a1c-8e2f-000000000009",
    type: "noop",
    config: {},
    output: { [field]: { lang: "cel", src: "result.status" } },
  });

  it("rejects two actions on one transition writing the same output field", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[2].onEntry.push(
        dupOutputAction("field_1a2b3c4d-0004-4a1c-8e2f-000000000004"),
      );
    })).toBe(true);
  });

  it("accepts two actions on one transition writing disjoint fields", () => {
    const ok = structuredClone(raw);
    ok.definition.workflow.steps[2].onEntry.push(
      dupOutputAction("field_1a2b3c4d-0001-4a1c-8e2f-000000000001"),
    );
    expect(processVersion.safeParse(ok).success).toBe(true);
  });

  it("rejects two onCancel actions writing the same output field", () => {
    expect(rejects((d) => {
      const f = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
      d.definition.workflow.steps[0].onCancel = [
        { id: "action_c1000000-0000-4a1c-8e2f-000000000001", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.x" } } },
        { id: "action_c2000000-0000-4a1c-8e2f-000000000002", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.y" } } },
      ];
    })).toBe(true);
  });
});

// definition-contract capability: structural/identity invariants exercised
// against fresh minimal bodies (the expense-approval example has no
// subprocess step, group field, or data source to mutate).
describe("definition-contract: subprocess step coupling and wait-state", () => {
  const subprocessSpec = {
    processId: "proc_child",
    versionBinding: "pinned",
    pinnedVersion: 1,
    inputMapping: {},
    outputMapping: {},
  };

  const subprocessBody = (opts: { spec?: boolean; type?: string; manualPath?: boolean } = {}): unknown => ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: opts.type ?? "subprocess",
          ...(opts.spec !== false ? { subprocess: subprocessSpec } : {}),
          paths: [
            opts.manualPath
              ? { id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }
              : { id: "path_ab", key: "ab", to: "step_b", trigger: "automatic", priority: 1 },
          ],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  });

  it("accepts a well-formed subprocess step (control)", () => {
    expect(processBody.safeParse(subprocessBody()).success).toBe(true);
  });

  it("rejects a subprocess-typed step with no subprocess spec", () => {
    expect(processBody.safeParse(subprocessBody({ spec: false })).success).toBe(false);
  });

  it("rejects a non-subprocess step carrying a subprocess spec", () => {
    expect(processBody.safeParse(subprocessBody({ type: "task" })).success).toBe(false);
  });

  it("rejects a manual path on a subprocess step", () => {
    expect(processBody.safeParse(subprocessBody({ manualPath: true })).success).toBe(false);
  });

  it("rejects a non-terminal step with zero outgoing paths", () => {
    const body = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task" }],
      },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });
});

describe("checkPathTriggerConsistency (shared by definition.ts and studio's canvas)", () => {
  it("accepts an empty path list", () => {
    expect(checkPathTriggerConsistency([]).ok).toBe(true);
  });

  it("accepts all-manual paths", () => {
    const result = checkPathTriggerConsistency([{ trigger: "manual" }, { trigger: "manual" }]);
    expect(result.ok).toBe(true);
  });

  it("accepts all-automatic guarded paths with unique priorities", () => {
    const result = checkPathTriggerConsistency([
      { trigger: "automatic", guard: { lang: "cel", src: "true" }, priority: 1 },
      { trigger: "automatic", guard: { lang: "cel", src: "false" }, priority: 2 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects mixing manual and automatic triggers", () => {
    const result = checkPathTriggerConsistency([{ trigger: "manual" }, { trigger: "automatic", priority: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("a step's paths must be all-manual or all-automatic, not mixed");
  });

  it("rejects two or more automatic paths missing a priority", () => {
    const result = checkPathTriggerConsistency([{ trigger: "automatic" }, { trigger: "automatic" }]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("automatic paths need a priority when a step has two or more");
  });

  it("rejects duplicate automatic priorities", () => {
    const result = checkPathTriggerConsistency([
      { trigger: "automatic", priority: 1 },
      { trigger: "automatic", priority: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("automatic path priorities must be unique");
  });

  it("rejects more than one guardless (default) automatic path", () => {
    const result = checkPathTriggerConsistency([
      { trigger: "automatic", priority: 1 },
      { trigger: "automatic", priority: 2 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("at most one default (guardless) automatic path per step");
  });

  it("rejects a guardless default that isn't the highest priority", () => {
    const result = checkPathTriggerConsistency([
      { trigger: "automatic", guard: { lang: "cel", src: "true" }, priority: 2 },
      { trigger: "automatic", priority: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("the default (guardless) automatic path must have the highest priority");
  });

  it("accepts a guardless default holding the highest priority", () => {
    const result = checkPathTriggerConsistency([
      { trigger: "automatic", guard: { lang: "cel", src: "true" }, priority: 1 },
      { trigger: "automatic", priority: 2 },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("definition-contract: full-depth id and key uniqueness", () => {
  const terminalStep = (id: string, key: string) => ({ id, key, label: { en: key }, type: "task", terminal: true });

  it("rejects duplicate path ids across different steps", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [
          { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_x", key: "x", to: "step_b", trigger: "automatic", priority: 1 }] },
          { id: "step_b", key: "b", label: { en: "B" }, type: "task", paths: [{ id: "path_x", key: "y", to: "step_c", trigger: "automatic", priority: 1 }] },
          terminalStep("step_c", "c"),
        ],
      },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects duplicate action ids across unrelated positions", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a", key: "a", label: { en: "A" }, type: "task",
            onEntry: [{ id: "action_x", type: "noop", config: {} }],
            paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "automatic", priority: 1 }],
          },
          { ...terminalStep("step_b", "b"), onEntry: [{ id: "action_x", type: "noop", config: {} }] },
        ],
      },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects duplicate timer ids across different steps", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a", key: "a", label: { en: "A" }, type: "task",
            timers: [{ id: "timer_x", duration: "P1D", onFire: { actions: [] } }],
            paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "automatic", priority: 1 }],
          },
          {
            id: "step_b", key: "b", label: { en: "B" }, type: "task",
            timers: [{ id: "timer_x", duration: "P1D", onFire: { actions: [] } }],
            paths: [{ id: "path_bc", key: "bc", to: "step_c", trigger: "automatic", priority: 1 }],
          },
          terminalStep("step_c", "c"),
        ],
      },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects duplicate data source ids", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
      dataSources: [
        { id: "ds_x", key: "one", type: "http", config: {} },
        { id: "ds_x", key: "two", type: "http", config: {} },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects a field id nested inside a group colliding with a top-level field id", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [
        { id: "field_x", key: "toplevel", label: { en: "T" }, type: "string" },
        { id: "field_g", key: "grp", label: { en: "G" }, type: "group", fields: [
          { id: "field_x", key: "nested", label: { en: "N" }, type: "string" },
        ] },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects two fields nested inside different groups sharing an id", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [
        { id: "field_g1", key: "g1", label: { en: "G1" }, type: "group", fields: [{ id: "field_dup", key: "a", label: { en: "A" }, type: "string" }] },
        { id: "field_g2", key: "g2", label: { en: "G2" }, type: "group", fields: [{ id: "field_dup", key: "b", label: { en: "B" }, type: "string" }] },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects a duplicate field key, including one nested inside a group", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [
        { id: "field_x", key: "dupkey", label: { en: "T" }, type: "string" },
        { id: "field_g", key: "grp", label: { en: "G" }, type: "group", fields: [
          { id: "field_y", key: "dupkey", label: { en: "N" }, type: "string" },
        ] },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects duplicate data source keys", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
      dataSources: [
        { id: "ds_a", key: "same", type: "http", config: {} },
        { id: "ds_b", key: "same", type: "http", config: {} },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects a data source keyed as a reserved CEL namespace name", () => {
    for (const reserved of ["data", "instance", "actor", "child", "result"]) {
      const body = {
        key: "p", label: { en: "P" }, baseLocale: "en", fields: [],
        dataSources: [{ id: "ds_a", key: reserved, type: "http", config: {} }],
        workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
      };
      expect(processBody.safeParse(body).success).toBe(false);
    }
  });

  it("rejects a field dataSource naming an id absent from dataSources", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [{ id: "field_x", key: "x", label: { en: "X" }, type: "select", dataSource: "ds_missing" }],
      dataSources: [{ id: "ds_a", key: "a", type: "http", config: {} }],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("accepts a field dataSource resolving to a declared data source", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [{ id: "field_x", key: "x", label: { en: "X" }, type: "select", dataSource: "ds_a" }],
      dataSources: [{ id: "ds_a", key: "a", type: "http", config: {} }],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(true);
  });

  it("rejects a dataSource naming an unknown id on a field nested inside a group", () => {
    const body = {
      key: "p", label: { en: "P" }, baseLocale: "en",
      fields: [
        { id: "field_g", key: "grp", label: { en: "G" }, type: "group", fields: [
          { id: "field_n", key: "nested", label: { en: "N" }, type: "select", dataSource: "ds_missing" },
        ] },
      ],
      workflow: { initialStep: "step_a", steps: [terminalStep("step_a", "a")] },
    };
    expect(processBody.safeParse(body).success).toBe(false);
  });
});

describe("definition-contract: view-ref resolution over the full field tree", () => {
  const groupViewBody = (ref: string) => ({
    key: "p", label: { en: "P" }, baseLocale: "en",
    fields: [
      { id: "field_g", key: "grp", label: { en: "G" }, type: "group", fields: [
        { id: "field_n", key: "nested", label: { en: "N" }, type: "string" },
      ] },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [{
        id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true,
        view: { fields: [{ ref, visible: true }] },
      }],
    },
  });

  it("accepts a view referencing a field nested inside a group", () => {
    expect(processBody.safeParse(groupViewBody("field_n")).success).toBe(true);
  });

  it("still rejects a view reference to a genuinely unknown field id", () => {
    expect(processBody.safeParse(groupViewBody("field_does_not_exist")).success).toBe(false);
  });
});

// `view.columns` and `viewField.span` are `1 | 2`, optional, layout only. Both
// unions are authoring-time constraints, so each ships a rejecting input.
// Absence is the third valid state and means 1; see test/view-layout-hash.test.ts
// for the hash-stability half of the same property.
describe("definition-contract: view layout accepts only 1 or 2 columns and spans", () => {
  const layoutBody = (viewExtra: object, fieldExtra: object) => ({
    key: "p", label: { en: "P" }, baseLocale: "en",
    fields: [{ id: "field_a", key: "a", label: { en: "A" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [{
        id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true,
        view: { fields: [{ ref: "field_a", ...fieldExtra }], ...viewExtra },
      }],
    },
  });

  it("accepts a view declaring neither key", () => {
    expect(processBody.safeParse(layoutBody({}, {})).success).toBe(true);
  });

  it("accepts columns 1 and 2, and span 1 and 2", () => {
    expect(processBody.safeParse(layoutBody({ columns: 1 }, { span: 1 })).success).toBe(true);
    expect(processBody.safeParse(layoutBody({ columns: 2 }, { span: 2 })).success).toBe(true);
  });

  it("rejects view.columns of 3", () => {
    expect(processBody.safeParse(layoutBody({ columns: 3 }, {})).success).toBe(false);
  });

  it("rejects viewField.span of 0", () => {
    expect(processBody.safeParse(layoutBody({}, { span: 0 })).success).toBe(false);
  });

  it("rejects a non-integer columns and a non-numeric span", () => {
    expect(processBody.safeParse(layoutBody({ columns: 1.5 }, {})).success).toBe(false);
    expect(processBody.safeParse(layoutBody({}, { span: "2" })).success).toBe(false);
  });

  // A span wider than the grid is a rendering rule (`min(span, columns)`), not
  // a publish error: the two keys change independently, and narrowing a form to
  // one column must not reject every field that still declares span 2.
  it("accepts span 2 on a one-column view", () => {
    expect(processBody.safeParse(layoutBody({ columns: 1 }, { span: 2 })).success).toBe(true);
  });
});

// Mirrors the "duration reaches every action position" coverage below: each of
// the five action positions was independently deletable from the check with the
// suite green before this change, since none had a test. Grow the blocks rather
// than asserting over a shared one.
describe("definition-contract: Action.output targets resolve to a real field, from every action position", () => {
  const okField = "field_amount";
  const bogusField = "field_does_not_exist";
  const nestedField = "field_nested";

  const outputAction = (fid: string) => ({
    id: "action_a", type: "noop", config: {}, output: { [fid]: { lang: "cel", src: "result.x" } },
  });

  type Position = "onEntry" | "onExit" | "onCancel" | "onPath" | "onFire";

  const bodyWith = (position: Position, fid: string) => ({
    key: "p", label: { en: "P" }, baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_g", key: "grp", label: { en: "G" }, type: "group", fields: [
        { id: "field_nested", key: "nested", label: { en: "N" }, type: "string" },
      ] },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          ...(position === "onEntry" ? { onEntry: [outputAction(fid)] } : {}),
          ...(position === "onExit" ? { onExit: [outputAction(fid)] } : {}),
          ...(position === "onCancel" ? { onCancel: [outputAction(fid)] } : {}),
          ...(position === "onFire" ? { timers: [{ id: "timer_a", duration: "P1D", onFire: { actions: [outputAction(fid)] } }] } : {}),
          paths: [{
            id: "path_ab", key: "ab", to: "step_b", trigger: "automatic", priority: 1,
            ...(position === "onPath" ? { onPath: [outputAction(fid)] } : {}),
          }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  });

  for (const position of ["onEntry", "onExit", "onCancel", "onPath", "onFire"] as const) {
    it(`rejects an unknown output field target in ${position}`, () => {
      expect(processBody.safeParse(bodyWith(position, bogusField)).success).toBe(false);
    });

    it(`accepts a resolvable output field target in ${position}`, () => {
      expect(processBody.safeParse(bodyWith(position, okField)).success).toBe(true);
    });
  }

  it("accepts an output target resolving to a field nested inside a group", () => {
    expect(processBody.safeParse(bodyWith("onPath", nestedField)).success).toBe(true);
  });
});

// A duration is armed inside the transition commit, on the TARGET step, so an
// unvalidated one does not fail a single instance: it makes the step unreachable
// for every instance of the definition. It is checked on the WRITE path — see
// `validateDurations` — because `processVersion` is also the deserializer for
// stored immutable bodies. These assert both halves: the check bites at compile,
// and parse stays permissive so an already-published body still reads.
describe("timer duration", () => {
  // The review step's reminder timer, the only duration timer in the example.
  const loc = "steps[1].timers[0].duration";

  const bodyWith = (value: string): ProcessBody => {
    const bad = structuredClone(raw);
    bad.definition.workflow.steps[1].timers[0].duration = value;
    return bad.definition as ProcessBody;
  };
  const issuesFor = (value: string) => validateDurations(bodyWith(value));

  const expectRejected = (value: string, message: string) => {
    const issues = issuesFor(value);
    // Attributable: exactly one issue, on the offending duration.
    expect(issues).toEqual([{ loc, value, message }]);
    // And it stops the publish path, not merely reports.
    expect(() => compileProcessBody(bodyWith(value))).toThrow(DurationValidationError);
  };

  const UNSUPPORTED =
    "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";
  const OUT_OF_RANGE = `timer duration exceeds the ${MAX_TIMER_DURATION_MS} ms bound (a fireAt past it leaves the four-digit-year range)`;

  // Calendar units are ambiguous without a date library and stay rejected.
  for (const value of ["P1Y", "P3M", "P1Y6M"]) {
    it(`rejects the calendar unit ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  for (const value of ["1 day", "7d", "", "  ", "PT1H "]) {
    it(`rejects the non-ISO value ${JSON.stringify(value)}`, () => expectRejected(value, UNSUPPORTED));
  }

  // Grammar-matching but componentless: they denote no span.
  for (const value of ["P", "PT"]) {
    it(`rejects the empty designator ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  // Every unit inside the time part is optional, so a bare trailing `T` matches
  // unless the parser forbids it. It is not ISO 8601 and denotes no time part.
  for (const value of ["P1DT", "P1WT"]) {
    it(`rejects the trailing bare T in ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  it("rejects a duration that overflows a fireAt from an ordinary entry", () => {
    // Both fit inside the 0001-9999 span, which is why bounding by that span was
    // not enough: each still overflows when added to a 2026 entry instant.
    for (const value of ["P3000000D", "P2912243D"]) expectRejected(value, OUT_OF_RANGE);
  });

  // The bound is derived from the entry-instant ceiling, not picked: the largest
  // whole day count inside it is accepted and the next one is not.
  const maxWholeDays = Math.floor(MAX_TIMER_DURATION_MS / 86_400_000);

  it("accepts the largest duration inside the bound", () => {
    expect(issuesFor(`P${maxWholeDays}D`)).toEqual([]);
  });

  it("rejects the first duration past the bound", () => {
    expectRejected(`PT${((MAX_TIMER_DURATION_MS + 1) / 1000).toFixed(3)}S`, OUT_OF_RANGE);
  });

  for (const value of ["P1W", "P1D", "PT1H", "PT30M", "PT1.5S", "P1DT2H30M"]) {
    it(`accepts ${value}`, () => {
      expect(issuesFor(value)).toEqual([]);
    });
  }

  // THE LAYERING ASSERTION. The check lives on the WRITE path only: `processVersion`
  // is also the deserializer for stored immutable bodies (`processBody.parse` on
  // every resolveBody cache miss), so a Zod refinement would make a definition
  // published before this check existed throw on READ — and its pinned instances
  // permanently unrehydratable, versions being immutable and migration not built.
  // In timers.ts the resolveBody call sits outside the per-instance try, so one
  // such body would starve every other due instance. Both halves belong in one
  // test: proving only the rejection would let the read-path regression back in.
  it("parses an invalid duration on the read path while rejecting it on the publish path", () => {
    // "" is absent from this set on purpose: it is falsy, so the pre-existing
    // duration-XOR-deadline refinement reads the timer as having neither and
    // fails parse for an unrelated reason. Its grammar rejection is above.
    for (const value of ["P1Y", "P1DT", "PT", "P9999999D", "garbage"]) {
      const stored = structuredClone(raw);
      stored.definition.workflow.steps[1].timers[0].duration = value;

      // READ: permissive, so an already-published body still rehydrates.
      expect(processVersion.safeParse(stored).success).toBe(true);

      // WRITE: rejected, and attributably so.
      expect(() => compileProcessBody(stored.definition as ProcessBody)).toThrow(
        DurationValidationError,
      );
      expect(validateDurations(stored.definition as ProcessBody)).toEqual([
        { loc, value, message: value === "P9999999D" ? OUT_OF_RANGE : UNSUPPORTED },
      ]);
    }
  });

  // The grammar covers every duration-typed field; the magnitude bound does not.
  // It is derived from the fireAt representation, and neither a baseDelay nor an
  // action timeout computes an instant.
  const withField = (path: (d: any) => void) => {
    const bad = structuredClone(raw);
    path(bad);
    return validateDurations(bad.definition as ProcessBody);
  };
  const setBaseDelay = (v: string) => (d: any) => {
    d.definition.workflow.steps[1].timers[0].onFire.actions[0].retry.baseDelay = v;
  };
  const setTimeout_ = (v: string) => (d: any) => {
    d.definition.workflow.steps[2].onEntry[0].timeout = v;
  };

  it("rejects a malformed retry baseDelay", () => {
    expect(withField(setBaseDelay("P1Y"))).toEqual([
      { loc: "steps[1].timers[0].onFire[0].retry.baseDelay", value: "P1Y", message: UNSUPPORTED },
    ]);
  });

  it("rejects a malformed action timeout", () => {
    expect(withField(setTimeout_("PT1H "))).toEqual([
      { loc: "steps[2].onEntry[0].timeout", value: "PT1H ", message: UNSUPPORTED },
    ]);
  });

  it("does not apply the magnitude bound to a baseDelay or a timeout", () => {
    const past = `P${maxWholeDays + 1}D`;
    expect(withField(setBaseDelay(past))).toEqual([]);
    expect(withField(setTimeout_(past))).toEqual([]);
  });

  // The example carries no onExit / onCancel / onPath actions, so those three
  // traversal lines were each individually deletable with the suite green. Grow
  // the blocks rather than asserting over the existing ones.
  const action = (id: string, timeout: string) => ({ id, type: "notify", config: {}, timeout });

  it("reaches a duration in an onExit action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].onExit = [action("action_x", "P1Y")];
      }),
    ).toEqual([{ loc: "steps[1].onExit[0].timeout", value: "P1Y", message: UNSUPPORTED }]);
  });

  it("reaches a duration in an onCancel action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].onCancel = [action("action_c", "P1M")];
      }),
    ).toEqual([{ loc: "steps[1].onCancel[0].timeout", value: "P1M", message: UNSUPPORTED }]);
  });

  it("reaches a duration in an onPath action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].paths[0].onPath = [action("action_p", "1 day")];
      }),
    ).toEqual([
      { loc: "steps[1].paths[0].onPath[0].timeout", value: "1 day", message: UNSUPPORTED },
    ]);
  });

  // compileProcessBody validates BEFORE its idempotent published-valid early
  // return. Moving the check below that return leaves every other test green
  // while re-publishing an already-compiled body — one already carrying the
  // injected cancel sink, e.g. round-tripped out of the definition store —
  // skips duration validation entirely.
  it("still validates a body that is already compiled", () => {
    const compiled = compileProcessBody(structuredClone(raw).definition as ProcessBody);
    // Precondition: this really is the published-valid shape the early return takes.
    expect(publishedProcessBody.safeParse(compiled).success).toBe(true);

    const republished = structuredClone(compiled) as any;
    republished.workflow.steps[1].timers[0].duration = "P1Y";
    expect(() => compileProcessBody(republished as ProcessBody)).toThrow(DurationValidationError);
  });
});

describe("migration schema additions", () => {
  const evtEnvelope = {
    id: "evt_11111111-1111-4a1c-8e2f-000000000001",
    instanceId: "inst_22222222-2222-4a1c-8e2f-000000000002",
    transitionSeq: 3,
    version: 1,
    at: "2026-07-20T00:00:00.000Z",
  };

  it("accepts both migration.skipped reasons", () => {
    for (const reason of ["step-unmappable", "pending-actions"]) {
      const ev = { ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason } };
      expect(instanceEvent.safeParse(ev).success).toBe(true);
    }
  });

  it("rejects a malformed migration.skipped payload", () => {
    // Missing toVersion.
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, reason: "step-unmappable" },
    }).success).toBe(false);
    // Unknown reason (strict enum).
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason: "whatever" },
    }).success).toBe(false);
    // Extra key (strict payload).
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason: "pending-actions", extra: 1 },
    }).success).toBe(false);
  });

  it("rejects a non-injective fieldMap", () => {
    const a = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
    const b = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002";
    const t = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003";
    expect(migrationSpec.safeParse({ fieldMap: { [a]: t, [b]: t } }).success).toBe(false);
    expect(migrationSpec.safeParse({ fieldMap: { [a]: t, [b]: a } }).success).toBe(true);
  });

  it("carries the definitionHash publishing it would store", () => {
    // The example declares status "published", so its wrapper hash must be the one
    // publishBody persists: the hash of the COMPILED body (cancel-sink injected),
    // not of the authored body next to it. Pinning this keeps the example honest —
    // it previously carried a `jcs-sha256:`-prefixed sha256 of the empty string,
    // a format definitionHash() never produces, and nothing caught it.
    expect(raw.definitionHash).toBe(definitionHash(compileProcessBody(raw.definition)));
    expect(raw.definitionHash).toMatch(/^[0-9a-f]{64}$/); // bare hex, no prefix
  });

  it("leaves the body hash unchanged when the wrapper carries no migration", () => {
    // migration lived on the unhashed wrapper; the hash covers only definition.
    const body = structuredClone(raw).definition as ProcessBody;
    const before = definitionHash(body);
    const withWrapperNoise = structuredClone(raw);
    delete (withWrapperNoise as any).migration;
    expect(definitionHash(withWrapperNoise.definition as ProcessBody)).toBe(before);
  });

  // Step.assignment: { strategy: { type, config, description? } } — already in the
  // schema (roadmap #5d activates it, no schema change), and the example's
  // "capture"/"review" steps already declare it (steps[0]/steps[1]).
  describe("Step.assignment envelope", () => {
    it("a step with no assignment field parses unchanged", () => {
      // "book" (steps[2]) declares no assignment.
      expect(raw.definition.workflow.steps[2].assignment).toBeUndefined();
      expect(processVersion.safeParse(raw).success).toBe(true);
    });

    it("a well-formed assignment envelope parses", () => {
      expect(raw.definition.workflow.steps[0].assignment).toEqual({
        strategy: { type: "static", config: { candidates: ["employee"] } },
      });
    });

    it("an assignment envelope missing its strategy type is rejected", () => {
      expect(rejects((d) => {
        delete d.definition.workflow.steps[0].assignment.strategy.type;
      })).toBe(true);
    });

    it("an assignment envelope missing its strategy config is rejected", () => {
      expect(rejects((d) => {
        delete d.definition.workflow.steps[0].assignment.strategy.config;
      })).toBe(true);
    });
  });
});
