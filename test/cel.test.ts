import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { validateProcessBody, validateMigrationSpec, checkSubprocessChildRefs, parseExpression, parseAst, checkAgainstFields, celType, ACTOR_SCHEMA, type CelIssue } from "../src/cel/check.js";
import { evalTransforms } from "../src/cel/eval.js";
import { validateReferences } from "../src/validate.js";
import { compileProcessBody, MAX_PATTERN_LENGTH } from "../src/schema/compile.js";
import { instance as instanceSchema, baseFieldType, processBody, type ProcessBody, type MigrationSpec, type Instance, type FieldDef } from "../src/schema/definition.js";

// Minimal ProcessBody builders. validateProcessBody reads only fields /
// dataSources / workflow.steps, so these cast loosely on purpose — the full
// structural invariants are exercised by validate.test.ts, not here.
const field = (key: string, type: string, format?: string) => ({
  id: `field_${key}`,
  key,
  label: { en: key },
  type,
  ...(format ? { format } : {}),
});
const fieldDef = (key: string, type: string, format?: string): FieldDef =>
  field(key, type, format) as unknown as FieldDef;

const body = (opts: {
  fields?: ReturnType<typeof field>[];
  steps?: unknown[];
  dataSources?: { id: string; key: string; type: string; config: object }[];
}): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: opts.fields ?? [field("booking_status", "string"), field("amount", "number")],
    dataSources: opts.dataSources,
    workflow: { initialStep: "step_a", steps: opts.steps ?? [] },
  }) as unknown as ProcessBody;

const guardStep = (src: string, type: "task" | "subprocess" = "task") => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type,
  paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src } }],
});

const msgs = (issues: CelIssue[]) => issues.map((i) => i.message).join(" | ");

// 5.1 syntactically broken expression is rejected
test("rejects a parse error", () => {
  const issues = validateProcessBody(body({ steps: [guardStep("data.booking_status >")] }));
  expect(issues.length).toBe(1);
});

// 5.2 unknown field reference is rejected
test("rejects an unknown field reference", () => {
  const issues = validateProcessBody(body({ steps: [guardStep("data.nope == 1")] }));
  expect(issues.length).toBe(1);
  expect(msgs(issues).toLowerCase()).toContain("nope");
});

// A field is addressed by `key`, never by `fieldId`: a `field_<uuid>` id is not a
// valid CEL identifier, so it cannot even be written as a member reference — the
// hyphens make it parse as arithmetic. Guards the contract rule that the payload is
// stored by fieldId but re-keyed to `key` when the context is built.
test("rejects a field referenced by its fieldId instead of its key", () => {
  const issues = validateProcessBody(
    body({ steps: [guardStep("data.field_1a2b3c4d-0004-4a1c-8e2f-000000000004 == 1")] }),
  );
  expect(issues.length).toBe(1);
});

// 5.3 type mismatch is rejected
test("rejects a type mismatch (number vs string)", () => {
  const issues = validateProcessBody(body({ steps: [guardStep('data.amount > "x"')] }));
  expect(issues.length).toBe(1);
});

// 5.4 result: forbidden in a guard, allowed in Action.output
test("rejects result in a guard", () => {
  const issues = validateProcessBody(body({ steps: [guardStep("result.status == 'x'")] }));
  expect(issues.length).toBe(1);
});

test("accepts result in an Action.output mapping", () => {
  const step = {
    id: "step_a",
    key: "a",
    label: { en: "A" },
    type: "task",
    onEntry: [{ id: "action_a", type: "http", config: {}, output: { field_booking_status: { lang: "cel", src: "result.status" } } }],
    paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual" }],
  };
  expect(validateProcessBody(body({ steps: [step] }))).toEqual([]);
});

// An Action.output mapping sees `result` and NOTHING else. The writeback is
// evaluated post-commit against a handler return, an unbounded interval after the
// action was enqueued, so the engine supplies `{result}` alone. A wider namespace
// admitted here would type-check and then throw on every delivery attempt,
// re-invoking the external handler on each retry before dead-lettering.
const outputStep = (
  src: string,
  position: "onEntry" | "onCancel" = "onEntry",
  type: "task" | "subprocess" = "task",
) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type,
  [position]: [{ id: "action_a", type: "http", config: {}, output: { field_booking_status: { lang: "cel", src } } }],
  paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual" }],
});

const OUT_LOC = (position: string) => `steps[0].${position}.actions[0].output.field_booking_status`;

test("rejects data.* in an Action.output mapping", () => {
  const issues = validateProcessBody(body({ steps: [outputStep("result.net + data.amount")] }));
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe(OUT_LOC("onEntry"));
  expect(msgs(issues).toLowerCase()).toContain("data");
});

test("rejects instance.* and actor.* in an Action.output mapping", () => {
  expect(validateProcessBody(body({ steps: [outputStep("instance.id")] })).length).toBe(1);
  expect(validateProcessBody(body({ steps: [outputStep("actor.id")] })).length).toBe(1);
});

// The enclosing step's type cannot widen output scope: `child` exists only during
// the subprocess return delivery, which evaluates outputMapping over the parent
// context — a different site from Action.output.
test("rejects child.* in an Action.output mapping on a subprocess step", () => {
  const issues = validateProcessBody(body({ steps: [outputStep("child.outcome", "onEntry", "subprocess")] }));
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe(OUT_LOC("onEntry"));
});

// onCancel actions are enqueued by cancelInstance and their outputs run through
// the same evalOutput path — the one action position collect() used not to visit.
test("checks onCancel action outputs", () => {
  const broken = validateProcessBody(body({ steps: [outputStep("result.status >", "onCancel")] }));
  expect(broken.length).toBe(1);
  expect(broken[0]!.loc).toBe(OUT_LOC("onCancel"));

  const widened = validateProcessBody(body({ steps: [outputStep("data.amount", "onCancel")] }));
  expect(widened.length).toBe(1);
  expect(widened[0]!.loc).toBe(OUT_LOC("onCancel"));

  expect(validateProcessBody(body({ steps: [outputStep("result.status", "onCancel")] }))).toEqual([]);
});

// 5.5 child: forbidden outside a subprocess step, allowed inside
test("rejects child.* outside a subprocess step", () => {
  const issues = validateProcessBody(body({ steps: [guardStep("child.outcome == 'ok'", "task")] }));
  expect(issues.length).toBe(1);
});

test("accepts child.* inside a subprocess step", () => {
  expect(validateProcessBody(body({ steps: [guardStep("child.outcome == 'ok'", "subprocess")] }))).toEqual([]);
});

// A deadline is evaluated at step entry, before a child exists, so `child` is out
// of scope there even on a subprocess step — while the same reference in that
// step's guard (evaluated when the step is left) stays in scope.
test("rejects child.* in a deadline but not in the guard of the same subprocess step", () => {
  const step = {
    ...guardStep("child.outcome == 'ok'", "subprocess"),
    timers: [
      {
        id: "timer_a",
        key: "ta",
        deadline: { lang: "cel", src: "child.data.due_at" },
        onFire: { actions: [] },
      },
    ],
  };
  const issues = validateProcessBody(body({ steps: [step] }));
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe("steps[0].timers[0].deadline");
  expect(msgs(issues).toLowerCase()).toContain("child");
});

const ruleStep = (src: string, type: "task" | "subprocess" = "task") => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type,
  terminal: true,
  view: { fields: [{ ref: "field_amount", validation: { rule: { lang: "cel", src } } }] },
});

test("rejects a syntactically broken step-level validation.rule", () => {
  const issues = validateProcessBody(body({ steps: [ruleStep("data.amount >")] }));
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe("steps[0].view.fields[0].validation.rule");
});

test("rejects an unknown field reference in a step-level validation.rule", () => {
  const issues = validateProcessBody(body({ steps: [ruleStep("data.nope == 1")] }));
  expect(issues.length).toBe(1);
  expect(msgs(issues).toLowerCase()).toContain("nope");
});

// A step-level validation.rule runs during submission against
// buildGuardContext, which registers no `child` — on a subprocess step
// either, unlike that step's visible/required/readonly expressions.
test("rejects child.* in a step-level validation.rule on a subprocess step", () => {
  const issues = validateProcessBody(body({ steps: [ruleStep("child.outcome == 'ok'", "subprocess")] }));
  expect(issues.length).toBe(1);
  expect(msgs(issues).toLowerCase()).toContain("child");
});

test("rejects result in a step-level validation.rule", () => {
  const issues = validateProcessBody(body({ steps: [ruleStep("result.status == 'x'")] }));
  expect(issues.length).toBe(1);
});

test("accepts a well-typed step-level validation.rule", () => {
  expect(validateProcessBody(body({ steps: [ruleStep("data.amount > 10")] }))).toEqual([]);
});

// 5.5b a deadline must infer to a string instant. The engine parses the value and
// omits a timer it cannot read, and an omitted timer is indistinguishable from an
// undeclared one at runtime — so a wrong-typed deadline is a publish error.
const deadlineStep = (src: string) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type: "task",
  paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual" }],
  timers: [{ id: "timer_a", deadline: { lang: "cel", src }, onFire: { actions: [] } }],
});

const typedFields = [
  field("amount", "number"),
  field("approved", "boolean"),
  field("tags", "list"),
  field("due_at", "string", "datetime"),
  field("due_on", "string", "date"),
  field("note", "string"),
  field("receipt", "file"),
];

const deadlineIssues = (src: string) =>
  validateProcessBody(body({ fields: typedFields, steps: [deadlineStep(src)] }));

test("rejects a deadline that infers to a non-string", () => {
  for (const [src, actual] of [
    ["data.amount", "double"],
    ["data.approved", "bool"],
    ["data.tags", "list<string>"],
  ] as const) {
    const issues = deadlineIssues(src);
    expect(issues.length).toBe(1);
    expect(issues[0]!.loc).toBe("steps[0].timers[0].deadline");
    expect(issues[0]!.message).toContain("string");
    expect(issues[0]!.message).toContain(actual);
  }
});

test("accepts a string-typed deadline (datetime / date / string / ternary)", () => {
  expect(deadlineIssues("data.due_at")).toEqual([]);
  expect(deadlineIssues("data.due_on")).toEqual([]);
  expect(deadlineIssues("data.note")).toEqual([]);
  expect(deadlineIssues('data.approved ? data.due_at : "2026-01-01T00:00:00Z"')).toEqual([]);
});

// A field whose CEL type is `dyn` (file, or a plugin field type) is not knowable at
// authoring time, so the expectation cannot reject it.
test("accepts a dyn-typed deadline (type not knowable at authoring time)", () => {
  expect(deadlineIssues("data.receipt")).toEqual([]);
  const plugin = { id: "field_custom", key: "custom", label: { en: "custom" }, type: { type: "geo", config: {} } };
  const fields = [...typedFields, plugin] as unknown as ReturnType<typeof field>[];
  expect(validateProcessBody(body({ fields, steps: [deadlineStep("data.custom")] }))).toEqual([]);
});

// The engine resolves no data sources, so a CEL reference to one can only park a
// wait-state or throw in delivery. No site registers a data source; a reference is an
// `unknown variable` publish error. The deadline is one such site, a guard another.
const ds = [{ id: "ds_users", key: "users", type: "http", config: {} }];

test("rejects a deadline referencing a data source", () => {
  const issues = validateProcessBody(
    body({ fields: typedFields, dataSources: ds, steps: [deadlineStep("users.due")] }),
  );
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe("steps[0].timers[0].deadline");
  // Assert the message, not just count+loc: if a data source were registered again
  // (the regression this guards), `users.due` would infer to `dyn` and yield no issue,
  // or a different issue at the same loc — the `unknown variable: users` message is
  // what pins the withholding.
  expect(issues[0]!.message.toLowerCase()).toContain("unknown variable: users");
});

test("a data source is not visible to a guard either (withheld from every site)", () => {
  const step = {
    ...deadlineStep("data.due_at"),
    paths: [
      {
        id: "path_a",
        key: "pa", label: "Pa",
        to: "step_b",
        trigger: "automatic",
        priority: 1,
        guard: { lang: "cel", src: "users.ok == true" },
      },
    ],
  };
  const issues = validateProcessBody(body({ fields: typedFields, dataSources: ds, steps: [step] }));
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe("steps[0].paths[0].guard");
  expect(issues[0]!.message.toLowerCase()).toContain("unknown variable: users");
});

// Each expectation is scoped to its own sites: the deadline expects `string`, the
// condition sites expect `bool`, and an Action.output or subprocess mapping value
// carries no expectation. A number and a string there must still pass.
test("the deadline result-type expectation does not leak into other sites", () => {
  const step = {
    id: "step_a",
    key: "a",
    label: { en: "A" },
    type: "subprocess",
    // Action.output writeback: a double, not a string.
    onEntry: [{ id: "action_a", type: "http", config: {}, output: { field_amount: { lang: "cel", src: "1.5" } } }],
    // Subprocess mappings: a string, not a bool.
    subprocess: {
      inputMapping: { field_note: { lang: "cel", src: "data.note" } },
      outputMapping: { field_note: { lang: "cel", src: "child.outcome" } },
    },
    // View flags: booleans.
    view: {
      fields: [
        {
          fieldId: "field_amount",
          visible: { lang: "cel", src: "data.approved" },
          required: { lang: "cel", src: "data.amount > 0.0" },
          readonly: { lang: "cel", src: "data.tags.size() > 0" },
        },
      ],
    },
    // Path guard: a bool.
    paths: [
      { id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src: "data.amount > 0.0" } },
    ],
    // A well-typed deadline alongside them, to prove the sites are collected together.
    timers: [{ id: "timer_a", deadline: { lang: "cel", src: "data.due_at" }, onFire: { actions: [] } }],
  };
  expect(validateProcessBody(body({ fields: typedFields, steps: [step] }))).toEqual([]);

  // Control: the same body with a string guard fails at the guard alone, so the
  // sites are collected together and each keeps its own expectation.
  const control = { ...step, paths: [{ ...step.paths[0]!, guard: { lang: "cel", src: "data.note" } }] };
  const issues = validateProcessBody(body({ fields: typedFields, steps: [control] }));
  expect(issues.map((i) => i.loc)).toEqual(["steps[0].paths[0].guard"]);
});

// 5.6 no wall-clock access: now() and the pure time constructors are all blocked
test("rejects time constructors (now/timestamp/duration)", () => {
  expect(validateProcessBody(body({ steps: [guardStep("now() > 0")] })).length).toBe(1);
  expect(validateProcessBody(body({ steps: [guardStep("timestamp('2020-01-01T00:00:00Z') > timestamp('2019-01-01T00:00:00Z')")] })).length).toBe(1);
  expect(validateProcessBody(body({ steps: [guardStep("duration('1h').getHours() > 0")] })).length).toBe(1);
  // a field literally containing the word in a string is not a false match
  expect(validateProcessBody(body({ steps: [guardStep("data.booking_status == 'duration(1h)'")] }))).toEqual([]);
});

// 5.7 well-typed definition passes
test("accepts a well-typed guard", () => {
  expect(validateProcessBody(body({ steps: [guardStep("data.booking_status == 'booked'")] }))).toEqual([]);
});

// A condition site infers to bool. The engine acts on a guard, a view flag or a
// validation rule only when it evaluates to `true`; any other type parks the path
// or rejects the submission without a message, so the mistake is a publish error.
const condFields = [...typedFields, field("status", "string"), field("count", "number", "integer")];
const condIssues = (steps: unknown[]) => validateProcessBody(body({ fields: condFields, steps }));
const viewStep = (entry: Record<string, unknown>) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type: "task",
  terminal: true,
  view: { fields: [entry] },
});

test("rejects a string-typed guard, on an automatic and on a manual path", () => {
  const automatic = condIssues([guardStep("data.status")]);
  expect(automatic.map((i) => i.loc)).toEqual(["steps[0].paths[0].guard"]);
  expect(automatic[0]!.message).toBe("expected bool, got string");

  const manual = guardStep("data.status");
  const manualPath = { ...manual.paths[0]!, trigger: "manual" };
  const issues = condIssues([{ ...manual, paths: [manualPath] }]);
  expect(issues.map((i) => i.loc)).toEqual(["steps[0].paths[0].guard"]);
  expect(issues[0]!.message).toBe("expected bool, got string");
});

test("rejects a guard that reads child.outcome alone on a subprocess step", () => {
  const issues = condIssues([guardStep("child.outcome", "subprocess")]);
  expect(issues.map((i) => i.loc)).toEqual(["steps[0].paths[0].guard"]);
  expect(issues[0]!.message).toBe("expected bool, got string");
});

test("rejects an int-typed visible, required and readonly flag", () => {
  for (const flag of ["visible", "required", "readonly"]) {
    const issues = condIssues([viewStep({ ref: "field_amount", [flag]: cel("data.count") })]);
    expect(issues.map((i) => i.loc)).toEqual([`steps[0].view.fields[0].${flag}`]);
    expect(issues[0]!.message).toBe("expected bool, got int");
  }
});

test("rejects an int-typed visible flag on a note", () => {
  const note = { kind: "note", text: { en: "n" }, visible: cel("data.count") };
  const issues = condIssues([viewStep(note)]);
  expect(issues.map((i) => i.loc)).toEqual(["steps[0].view.fields[0].visible"]);
  expect(issues[0]!.message).toBe("expected bool, got int");
});

test("rejects a string-typed validation.rule, in the catalog and on a step", () => {
  const withRule = { ...field("amount", "number"), validation: { rule: cel("data.status") } };
  const catalog = validateProcessBody(body({ fields: [withRule, field("status", "string")], steps: [] }));
  expect(catalog.map((i) => i.loc)).toEqual(["fields[0].validation.rule"]);
  expect(catalog[0]!.message).toBe("expected bool, got string");

  const step = condIssues([ruleStep("data.status")]);
  expect(step.map((i) => i.loc)).toEqual(["steps[0].view.fields[0].validation.rule"]);
  expect(step[0]!.message).toBe("expected bool, got string");
});

test("accepts a bool-typed condition at every site", () => {
  expect(condIssues([guardStep('data.status == "ok"')])).toEqual([]);
  expect(condIssues([guardStep("data.approved")])).toEqual([]);
  expect(condIssues([guardStep("child.outcome == 'ok'", "subprocess")])).toEqual([]);
  for (const flag of ["visible", "required", "readonly"]) {
    expect(condIssues([viewStep({ ref: "field_amount", [flag]: cel("data.approved") })])).toEqual([]);
  }
  expect(condIssues([ruleStep('data.status == "ok"')])).toEqual([]);
  const withRule = { ...field("amount", "number"), validation: { rule: cel("data.amount > 0.0") } };
  expect(validateProcessBody(body({ fields: [withRule], steps: [] }))).toEqual([]);
});

test("accepts a dyn-typed condition at every site", () => {
  expect(condIssues([guardStep("data.receipt")])).toEqual([]);
  for (const flag of ["visible", "required", "readonly"]) {
    expect(condIssues([viewStep({ ref: "field_amount", [flag]: cel("data.receipt") })])).toEqual([]);
  }
  expect(condIssues([ruleStep("data.receipt")])).toEqual([]);
  const withRule = { ...field("amount", "number"), validation: { rule: cel("data.receipt") } };
  expect(validateProcessBody(body({ fields: [withRule, field("receipt", "file")], steps: [] }))).toEqual([]);
});

// The rule runs on the publish path (check.ts behind validateReferences), not in the
// Zod schema: a body published before the rule keeps reading, and its pinned
// instances keep running.
test("processBody still parses a body whose guard reads data.status alone", () => {
  const stored = {
    key: "legacy",
    label: { en: "Legacy" },
    baseLocale: "en",
    fields: [{ id: "field_status", key: "status", label: { en: "Status" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          paths: [
            { id: "path_go", key: "go", label: "Go", to: "step_b", trigger: "automatic", priority: 1, guard: cel("data.status") },
          ],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  };
  expect(() => processBody.parse(stored)).not.toThrow();
});

// Every shipped example must survive the check, since publish now enforces it —
// an example that cannot be published is not an example. Checked against the
// COMPILED body, which is what publishBody hands to validateProcessBody.
const exampleFiles = readdirSync(new URL("../examples/", import.meta.url)).filter((f) => f.endsWith(".json"));

test("examples/ holds the shipped example files", () => {
  expect(exampleFiles.length).toBeGreaterThanOrEqual(9);
});

test.each(exampleFiles)("accepts the real %s example", (name) => {
  const json = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));
  const authored = (json.definition ?? json) as ProcessBody;
  expect(validateProcessBody(compileProcessBody(authored))).toEqual([]);
});

// 5.8 mapping coverage: every catalog field type maps to a CEL type. `celType`
// takes the field, not its type alone, since `format: "integer"` narrows a
// number to `int` (field-model-type-format-control).
test("every base field type has a CEL-type mapping", () => {
  for (const t of baseFieldType.options) {
    const f = fieldDef("probe", t);
    expect(typeof celType(f)).toBe("string");
    expect(celType(f).length).toBeGreaterThan(0);
  }
});

test("a number field reports int under format: \"integer\" and double without it", () => {
  expect(celType(fieldDef("anzahl", "number", "integer"))).toBe("int");
  expect(celType(fieldDef("anzahl", "number"))).toBe("double");
});

// D24: an author can now write a bare integer comparison and a modulo. Both
// fail against an unmarked number field, which stays a `double`.
test("an integer-formatted field type-checks the expressions a double refuses", () => {
  expect(checkAgainstFields("data.anzahl % 2 == 0", [fieldDef("anzahl", "number", "integer")]).ok).toBe(true);
  expect(checkAgainstFields("data.anzahl == 5", [fieldDef("anzahl", "number", "integer")]).ok).toBe(true);
  expect(checkAgainstFields("data.anzahl % 2 == 0", [fieldDef("anzahl", "number")]).ok).toBe(false);
  expect(checkAgainstFields("data.anzahl == 5", [fieldDef("anzahl", "number")]).ok).toBe(false);
});

// D24's second consequence, measured against the pinned CEL library: equality
// and arithmetic between an `int` field and a `double` field find no overload.
// The ordering comparators do carry a cross-numeric overload, so those two mix.
test("equality and arithmetic mixing an integer field with a decimal field find no overload", () => {
  const both = [fieldDef("anzahl", "number", "integer"), fieldDef("betrag", "number")];
  expect(checkAgainstFields("data.anzahl == data.betrag", both).ok).toBe(false);
  expect(checkAgainstFields("data.anzahl + data.betrag > 1.0", both).ok).toBe(false);
  expect(checkAgainstFields("data.anzahl > data.betrag", both).ok).toBe(true);
});

// parse-only entry point
test("parseExpression flags syntax but not unknown vars", () => {
  expect(parseExpression("data.x == 1").ok).toBe(true);
  expect(parseExpression("data.x >").ok).toBe(false);
});

// Studio Tools CEL scratchpad's entry point — parse + type-check against a
// stand-alone field catalog, data/instance/actor scope only.
test("checkAgainstFields accepts an expression that type-checks against the given catalog", () => {
  const result = checkAgainstFields("data.amount > 10.0", [fieldDef("amount", "number")]);
  expect(result.ok).toBe(true);
});

test("checkAgainstFields rejects a reference to a field outside the given catalog", () => {
  const result = checkAgainstFields("data.not_declared == 1", [fieldDef("amount", "number")]);
  expect(result.ok).toBe(false);
});

test("checkAgainstFields resolves instance and actor, not just data", () => {
  expect(checkAgainstFields("instance.status == 'running'", []).ok).toBe(true);
  expect(checkAgainstFields("actor.id == 'x'", []).ok).toBe(true);
});

test("checkAgainstFields rejects a syntax error the same way validateProcessBody does", () => {
  const result = checkAgainstFields("data.x >", []);
  expect(result.ok).toBe(false);
});

// ---- migration transforms (cel-expressions delta) ----------------------------
// A transform's identifiers resolve against the SOURCE catalog; its result type is
// checked against the TARGET field it writes. cel(...) shortens an expression, and
// the condition-site tests above call it as well.
const cel = (src: string) => ({ lang: "cel", src });
const migBody = (fields: { key: string; type: string | object }[], dataSources?: any[]): ProcessBody =>
  ({
    key: "p", label: { en: "P" }, baseLocale: "en",
    fields: fields.map((f) => ({ id: `field_${f.key}`, key: f.key, label: { en: f.key }, type: f.type })),
    dataSources,
    workflow: { initialStep: "step_a", steps: [] },
  }) as unknown as ProcessBody;
const spec = (transforms: Record<string, ReturnType<typeof cel>>): MigrationSpec =>
  ({ transforms }) as unknown as MigrationSpec;

// source: amount(number), note(string), plus a plugin field; target: total(number), note(string)
const fromB = migBody([{ key: "amount", type: "number" }, { key: "note", type: "string" }, { key: "blob", type: { type: "custom" } }]);
const toB = migBody([{ key: "total", type: "number" }, { key: "note", type: "string" }]);

test("transform reading a source field is accepted", () => {
  expect(validateMigrationSpec(spec({ field_total: cel("data.amount") }), fromB, toB)).toEqual([]);
});

test("transform reading a field only the target declares is refused", () => {
  const issues = validateMigrationSpec(spec({ field_note: cel("data.total") }), fromB, toB);
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("migration.transforms.field_note");
});

test("transform writing a field the target does not declare is refused", () => {
  const issues = validateMigrationSpec(spec({ field_missing: cel("data.amount") }), fromB, toB);
  expect(issues.length).toBe(1);
  expect(issues[0].message).toContain("not a field in the target catalog");
});

test("a matching result type is accepted", () => {
  expect(validateMigrationSpec(spec({ field_note: cel("data.note") }), fromB, toB)).toEqual([]);
});

test("a mismatched result type is refused", () => {
  const issues = validateMigrationSpec(spec({ field_total: cel("data.note") }), fromB, toB);
  expect(issues.length).toBe(1);
  expect(issues[0].message).toContain("expected double");
});

test("an unknowable (dyn) result type is accepted", () => {
  // reading a plugin field infers dyn, which satisfies any target type
  expect(validateMigrationSpec(spec({ field_total: cel("data.blob") }), fromB, toB)).toEqual([]);
});

test("a transform referencing actor is refused", () => {
  expect(validateMigrationSpec(spec({ field_note: cel("actor.id") }), fromB, toB).length).toBe(1);
});

test("a transform referencing a data source is refused", () => {
  const src = migBody([{ key: "amount", type: "number" }], [{ id: "ds_p", key: "ds_prices", type: "http", config: {} }]);
  expect(validateMigrationSpec(spec({ field_note: cel("ds_prices.value") }), src, toB).length).toBe(1);
});

test("a transform referencing child is refused", () => {
  expect(validateMigrationSpec(spec({ field_note: cel("child.outcome") }), fromB, toB).length).toBe(1);
});

test("a transform may read the instance projection", () => {
  expect(validateMigrationSpec(spec({ field_note: cel("instance.status") }), fromB, toB)).toEqual([]);
});

test("a transform calling a time function is refused", () => {
  const issues = validateMigrationSpec(spec({ field_note: cel("string(now())") }), fromB, toB);
  expect(issues.length).toBe(1);
  expect(issues[0].message).toContain("now()");
});

test("ordinary sites still resolve actor after the migration entry point exists", () => {
  const b = body({ steps: [guardStep("actor.id == 'u1'")] });
  expect(validateProcessBody(b)).toEqual([]);
});

test("an integer-valued transform survives a round-trip", () => {
  const snapshot = instanceSchema.parse({
    instanceId: "inst_11111111-1111-4a1c-8e2f-000000000001",
    processId: "proc_x", version: 1, definitionHash: "h",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-07-20T00:00:00.000Z",
  }) as Instance;
  const { patch, drops } = evalTransforms(spec({ field_total: cel("1 + 2") }), fromB, snapshot);
  expect(drops).toEqual([]);
  // cel-js models int as bigint; coerceJson must have made it a number.
  expect(typeof patch.field_total).toBe("number");
  expect(patch.field_total).toBe(3);
  // The migrated instance parses on its next read (a bigint would throw here).
  expect(() => instanceSchema.parse({ ...snapshot, data: { field_total: patch.field_total } })).not.toThrow();
});

test("evalTransforms reports a raising expression as an expression-raised drop", () => {
  const snapshot = instanceSchema.parse({
    instanceId: "inst_11111111-1111-4a1c-8e2f-000000000002",
    processId: "proc_x", version: 1, definitionHash: "h",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-07-20T00:00:00.000Z",
  }) as Instance;
  const { patch, drops } = evalTransforms(spec({ field_total: cel("data.nope") }), fromB, snapshot);
  expect(patch.field_total).toBeUndefined();
  expect(drops).toEqual([{ fieldId: "field_total", reason: "expression-raised" }] as unknown as typeof drops);
});

test("evalTransforms reports an out-of-range result as a value-out-of-range drop", () => {
  const snapshot = instanceSchema.parse({
    instanceId: "inst_11111111-1111-4a1c-8e2f-000000000003",
    processId: "proc_x", version: 1, definitionHash: "h",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-07-20T00:00:00.000Z",
  }) as Instance;
  // Beyond Number.MAX_SAFE_INTEGER: cel-js models this as a bigint coerceJson refuses.
  const { patch, drops } = evalTransforms(spec({ field_total: cel("9223372036854775807") }), fromB, snapshot);
  expect(patch.field_total).toBeUndefined();
  expect(drops).toEqual([{ fieldId: "field_total", reason: "value-out-of-range" }] as unknown as typeof drops);
});

// ---- checkSubprocessChildRefs (cross-process-validation delta) ---------------
// child.data is `dyn` (any key accepted) in the single-body validateProcessBody
// check, since there is no child body there to type it against.
// checkSubprocessChildRefs re-checks one subprocess step's outputMapping values
// and automatic-path guards against the ACTUAL resolved child's
// contract.outputFields, invoked from validateCrossProcess once the child body
// is resolved.

const subprocessStep = (outputMapping: Record<string, ReturnType<typeof cel>>, guardSrc = "child.outcome == 'ok'") =>
  ({
    id: "step_a", key: "a", label: "A", type: "subprocess",
    subprocess: { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 1, inputMapping: {}, outputMapping },
    paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "automatic", priority: 1, guard: cel(guardSrc) }],
  }) as unknown;

const childBodyWithOutputs = (outputFieldIds?: string[]): ProcessBody =>
  ({
    key: "child", label: { en: "Child" }, baseLocale: "en",
    contract: { outputFields: outputFieldIds },
    fields: [field("amount", "number"), field("internal_note", "string")],
    workflow: { initialStep: "step_c", steps: [] },
  }) as unknown as ProcessBody;

test("accepts a child.data reference within the child's declared outputFields", () => {
  const b = body({ steps: [subprocessStep({ field_p_amt: cel("child.data.amount") })] });
  expect(checkSubprocessChildRefs(b, 0, childBodyWithOutputs(["field_amount"]))).toEqual([]);
});

test("rejects an outputMapping reference to a child field outside contract.outputFields", () => {
  const b = body({ steps: [subprocessStep({ field_p_note: cel("child.data.internal_note") })] });
  const issues = checkSubprocessChildRefs(b, 0, childBodyWithOutputs(["field_amount"]));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("steps[0].subprocess.outputMapping.field_p_note");
});

test("rejects a guard reference to a child field outside contract.outputFields", () => {
  const b = body({ steps: [subprocessStep({}, "child.data.internal_note == 'x'")] });
  const issues = checkSubprocessChildRefs(b, 0, childBodyWithOutputs(["field_amount"]));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("steps[0].paths[0].guard");
});

test("child.outcome is unaffected by the child's declared outputFields", () => {
  const b = body({ steps: [subprocessStep({}, "child.outcome == 'approved'")] });
  expect(checkSubprocessChildRefs(b, 0, childBodyWithOutputs([]))).toEqual([]);
  expect(checkSubprocessChildRefs(b, 0, childBodyWithOutputs(undefined))).toEqual([]);
});

test("a child with no declared outputFields rejects every child.data reference", () => {
  const b = body({ steps: [subprocessStep({ field_p_amt: cel("child.data.amount") })] });
  expect(checkSubprocessChildRefs(b, 0, childBodyWithOutputs(undefined)).length).toBe(1);
});

test("validateProcessBody's single-body check is unchanged: it still accepts any child.data key", () => {
  const b = body({ steps: [subprocessStep({ field_p_note: cel("child.data.internal_note") })] });
  expect(validateProcessBody(b)).toEqual([]);
});

// The single-body pass types child.data as dyn, so a typed child output used alone
// as a guard slips past its bool expectation. The second pass knows the type.
test("rejects a guard that reads a typed child output alone", () => {
  const b = body({ steps: [subprocessStep({}, "child.data.amount")] });
  expect(validateProcessBody(b)).toEqual([]);
  const issues = checkSubprocessChildRefs(b, 0, childBodyWithOutputs(["field_amount"]));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("steps[0].paths[0].guard");
  expect(issues[0].message).toContain("expected bool, got double");
});

test("accepts a typed child output compared in a guard", () => {
  const b = body({ steps: [subprocessStep({}, "child.data.amount > 1000.0")] });
  expect(checkSubprocessChildRefs(b, 0, childBodyWithOutputs(["field_amount"]))).toEqual([]);
});

// Both passes see a string guard on a subprocess step once the child is loaded.
// validateReferences keeps the first issue and drops the equal one.
test("validateReferences reports a string guard on a subprocess step once, with the child loaded", () => {
  const b = body({ steps: [subprocessStep({}, "data.booking_status")] });
  const registryDescription = { actionTypes: [], assignmentStrategyTypes: [], dataSourceTypes: [] };
  const loaded = validateReferences(b, { registryDescription, loadedChildren: { step_a: childBodyWithOutputs(["field_amount"]) }, targetsByLoc: {} });
  const bare = validateReferences(b, { registryDescription, loadedChildren: {}, targetsByLoc: {} });
  for (const refs of [loaded, bare]) {
    expect(refs.celIssues.length).toBe(1);
    expect(refs.celIssues[0].loc).toBe("steps[0].paths[0].guard");
    expect(refs.celIssues[0].message).toContain("expected bool, got string");
  }
});

// --- parseAst / ACTOR_SCHEMA: the studio condition builder's two entry points ---

test("parseAst returns null for source that does not parse", () => {
  expect(parseAst("data.amount >")).toBeNull();
  expect(parseAst("(((")).toBeNull();
  expect(parseAst("")).toBeNull();
});

test("a node's range slices its own substring out of the input", () => {
  const src = 'data.tags.exists(t, t == "vip") && data.amount > 1000.0';
  const ast = parseAst(src);
  expect(ast?.op).toBe("&&");
  const [left, right] = ast!.args as [{ range: { start: number; end: number } }, { range: { start: number; end: number } }];
  expect(src.slice(left.range.start, left.range.end)).toBe('data.tags.exists(t, t == "vip")');
  expect(src.slice(right.range.start, right.range.end)).toBe("data.amount > 1000.0");
});

test("&& chains left-associatively, and || binds looser than &&", () => {
  expect(parseAst("a && b && c")?.op).toBe("&&");
  expect((parseAst("a && b && c")!.args as { op: string }[])[0].op).toBe("&&");
  expect(parseAst("a && b || c")?.op).toBe("||");
  expect((parseAst("a && b || c")!.args as { op: string }[])[0].op).toBe("&&");
});

test("ACTOR_SCHEMA declares id and roles", () => {
  expect(ACTOR_SCHEMA).toEqual({ id: "string", roles: "list<string>" });
});

// ---- structural bound (cel-expressions delta) --------------------------------
// Every checked site rejects an expression past a fixed structural bound: at most
// two nested comprehensions, a parse depth of 64 and 2,000 AST nodes.
const listFields = [field("items", "list")];
const GUARD_LOC = "steps[0].paths[0].guard";

test("rejects three nested comprehensions at a guard", () => {
  const src = "data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))";
  const issues = validateProcessBody(body({ fields: listFields, steps: [guardStep(src)] }));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain("comprehension nesting limit");
});

test("accepts two nested comprehensions at a guard", () => {
  const src = "data.items.all(a, data.items.exists(b, a == b))";
  expect(validateProcessBody(body({ fields: listFields, steps: [guardStep(src)] }))).toEqual([]);
});

// A comprehension's receiver is evaluated outside the macro and keeps the
// outer depth (see comprehensionTooDeep's doc comment). Here the outer `all`
// opens depth 1, and its argument `map(...).exists(...)` opens depth 2 at
// `exists` — still within the limit. If the receiver `map(...)` were instead
// walked at `exists`'s depth+1 (3), this would wrongly reject.
test("accepts a comprehension in a receiver, which keeps the outer depth", () => {
  const src = "data.items.all(a, data.items.map(b, b).exists(c, a == c))";
  expect(validateProcessBody(body({ fields: listFields, steps: [guardStep(src)] }))).toEqual([]);
});

// A probe against the pinned library found the boundary: 62 wrapping parens
// around this comparison still checks, 63 exceeds maxDepth (64) — the
// comparison's own nodes (member access, literal, operator) already use up
// depth before any paren is added.
test("accepts 62 levels of parentheses at a guard, one below the depth limit", () => {
  const src = `${"(".repeat(62)}data.amount > 1.0${")".repeat(62)}`;
  expect(validateProcessBody(body({ steps: [guardStep(src)] }))).toEqual([]);
});

test("rejects 65 levels of parentheses at a guard with the depth limit", () => {
  const src = `${"(".repeat(65)}data.amount > 1.0${")".repeat(65)}`;
  const issues = validateProcessBody(body({ steps: [guardStep(src)] }));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain("Exceeded maxDepth (64)");
});

test("rejects a guard over 2,000 AST nodes with the node limit", () => {
  const list = `size([${Array(900).fill("1").join(",")}])`;
  const src = `${list} + ${list} + ${list} > 0`;
  const issues = validateProcessBody(body({ steps: [guardStep(src)] }));
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain("Exceeded maxAstNodes (2000)");
});

test("rejects a migration transform with three nested comprehensions", () => {
  const from = migBody([{ key: "items", type: "list" }]);
  const to = migBody([{ key: "ok", type: "boolean" }]);
  const src = "data.items.exists(a, data.items.map(b, b).filter(c, data.items.all(d, c == d)).size() > 0)";
  const issues = validateMigrationSpec(spec({ field_ok: cel(src) }), from, to);
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("migration.transforms.field_ok");
  expect(issues[0].message).toContain("comprehension nesting limit");
});

// ---- matches pattern (cel-expressions delta) ---------------------------------
// A matches call takes a string-literal pattern that compiles, in both call
// forms and anywhere in the tree. Both callers run the AST rules inside an
// empty catch, so a pattern that fails to compile must come back as a message.
// A swallowed throw would let the bad pattern through and fail these tests.
const matchFields = [field("s", "string"), field("p", "string"), field("b", "boolean"), field("items", "list")];
const matchIssues = (src: string) => validateProcessBody(body({ fields: matchFields, steps: [guardStep(src)] }));
const NO_COMPILE = "does not compile as a JavaScript RegExp";

test("rejects an uncompilable literal pattern in the receiver form", () => {
  const issues = matchIssues('data.s.matches("(")');
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain(NO_COMPILE);
});

test("rejects an uncompilable literal pattern in the call form", () => {
  const issues = matchIssues('matches(data.s, "(")');
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain(NO_COMPILE);
});

test("rejects a pattern that is a field reference or a concatenation", () => {
  for (const src of ["data.s.matches(data.p)", 'data.s.matches("a" + "b")', "matches(data.s, data.p)"]) {
    const issues = matchIssues(src);
    expect(issues.length).toBe(1);
    expect(issues[0].loc).toBe(GUARD_LOC);
    expect(issues[0].message).toContain("matches() needs a string literal as its pattern");
  }
});

test("finds a bad matches call inside a comprehension body", () => {
  const issues = matchIssues('data.items.all(i, i.matches("("))');
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain(NO_COMPILE);
});

test("finds a bad matches call inside another call's receiver", () => {
  const issues = matchIssues('string(data.s.matches("(")).size() > 0');
  expect(issues.length).toBe(1);
  expect(issues[0].message).toContain(NO_COMPILE);
});

test("accepts a valid literal pattern", () => {
  expect(matchIssues('data.s.matches("^[a-z]+$")')).toEqual([]);
});

// The helper reads the decoded string. `"^[a-z]+\\d$"` holds a backslash and a d.
// `"\\("` decodes to a backslash and a paren, which compiles; the raw source text
// `\\(` would not.
test("compiles the decoded string, not the raw source text", () => {
  expect(matchIssues('data.s.matches("^[a-z]+\\\\d$")')).toEqual([]);
  expect(matchIssues('data.s.matches("\\\\(")')).toEqual([]);
});

test("a matches call with a missing argument falls through to the type check", () => {
  const issues = matchIssues("data.s.matches()");
  expect(issues.length).toBe(1);
  expect(issues[0].message).not.toContain("string literal");
  expect(issues[0].message).not.toContain(NO_COMPILE);
});

test("reports an over-long literal pattern at a migration transform", () => {
  const from = migBody([{ key: "s", type: "string" }]);
  const to = migBody([{ key: "ok", type: "boolean" }]);
  const issues = validateMigrationSpec(spec({ field_ok: cel(`data.s.matches("${"a".repeat(MAX_PATTERN_LENGTH + 1)}")`) }), from, to);
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe("migration.transforms.field_ok");
  expect(issues[0].message).toContain(`${MAX_PATTERN_LENGTH}-character bound`);
});

test("accepts a literal pattern at exactly the length bound", () => {
  const from = migBody([{ key: "s", type: "string" }]);
  const to = migBody([{ key: "ok", type: "boolean" }]);
  const src = `data.s.matches("${"a".repeat(MAX_PATTERN_LENGTH)}")`;
  expect(validateMigrationSpec(spec({ field_ok: cel(src) }), from, to)).toEqual([]);
});

test("a migration transform meets the same literal-pattern rule", () => {
  const from = migBody([{ key: "s", type: "string" }, { key: "p", type: "string" }]);
  const to = migBody([{ key: "ok", type: "boolean" }]);
  const nonLiteral = validateMigrationSpec(spec({ field_ok: cel("data.s.matches(data.p)") }), from, to);
  expect(nonLiteral.length).toBe(1);
  expect(nonLiteral[0].loc).toBe("migration.transforms.field_ok");
  expect(nonLiteral[0].message).toContain("matches() needs a string literal as its pattern");
  const broken = validateMigrationSpec(spec({ field_ok: cel('data.s.matches("(")') }), from, to);
  expect(broken.length).toBe(1);
  expect(broken[0].message).toContain(NO_COMPILE);
});

test("checkAgainstFields applies the matches rule to a scratchpad expression", () => {
  const fields = [fieldDef("s", "string")];
  const bad = checkAgainstFields('data.s.matches("(")', fields);
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.message).toContain(NO_COMPILE);
  expect(checkAgainstFields('data.s.matches("^[a-z]+$")', fields)).toEqual({ ok: true });
});

// ---- unary operators ---------------------------------------------------------
// A unary operator (`!`, `-`) keeps its single operand as a node in `args`, not
// in an array. Every AST rule must still walk it.
test("finds a matches call under a negation", () => {
  const bad = matchIssues('!data.s.matches("(")');
  expect(bad.length).toBe(1);
  expect(bad[0].loc).toBe(GUARD_LOC);
  expect(bad[0].message).toContain(NO_COMPILE);
  const nonLiteral = matchIssues("!data.s.matches(data.p)");
  expect(nonLiteral.length).toBe(1);
  expect(nonLiteral[0].message).toContain("matches() needs a string literal as its pattern");
});

test("finds a matches call under a double negation, a negated group and a negated operand", () => {
  expect(matchIssues('!!data.s.matches("(")')[0]?.message).toContain(NO_COMPILE);
  expect(matchIssues('!(data.b || data.s.matches("("))')[0]?.message).toContain(NO_COMPILE);
  expect(matchIssues("data.b && !data.s.matches(data.p)")[0]?.message).toContain("string literal");
});

test("finds a matches call under a unary minus around a ternary", () => {
  const issues = matchIssues('-(data.s.matches("(") ? 1 : 2) == -1');
  expect(issues.length).toBe(1);
  expect(issues[0].message).toContain(NO_COMPILE);
});

test("accepts a negated valid pattern and a negated two-deep comprehension", () => {
  expect(matchIssues('!data.s.matches("^[a-z]+$")')).toEqual([]);
  expect(matchIssues("!data.items.all(a, data.items.exists(b, a == b))")).toEqual([]);
});

test("rejects a negated three-deep comprehension with the nesting limit", () => {
  const issues = matchIssues("!data.items.all(a, data.items.all(b, data.items.all(c, true)))");
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain("comprehension nesting limit");
});

test("rejects a negated time function with the time-function message", () => {
  const issues = matchIssues('!(timestamp("2020-01-01T00:00:00Z") > timestamp("2019-01-01T00:00:00Z"))');
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(GUARD_LOC);
  expect(issues[0].message).toContain("time function not allowed");
});

// ---- process.start mapping values (process-chaining delta) -------------------
// A process.start action's config.inputMapping values are CEL, evaluated at
// delivery over `data`, `instance` and `actor`. Only that known key is a checked
// site; the studio runs this check with an unvalidated `config`, so a malformed
// one must not throw.
const startFields = [...typedFields, field("items", "list")];
const startAction = (config: unknown, type = "process.start") => ({ id: "action_chain", type, config });
const startStep = (action: unknown) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type: "task",
  onEntry: [action],
  paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual" }],
});
const startMapping = (mapping: unknown) => startStep(startAction({ processId: "proc_target", inputMapping: mapping }));
const startIssues = (mapping: unknown) => validateProcessBody(body({ fields: startFields, steps: [startMapping(mapping)] }));
const MAP_LOC = "steps[0].onEntry[0].config.inputMapping.field_t_amount";

test("rejects an unknown field reference in a process.start mapping value", () => {
  const issues = startIssues({ field_t_amount: cel("data.missing") });
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(MAP_LOC);
  expect(msgs(issues).toLowerCase()).toContain("missing");
});

test("rejects a time function in a process.start mapping value", () => {
  const issues = startIssues({ field_t_amount: cel('timestamp("2020-01-01T00:00:00Z")') });
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(MAP_LOC);
  expect(issues[0].message).toContain("time function not allowed");
});

test("rejects three nested comprehensions in a process.start mapping value", () => {
  const issues = startIssues({ field_t_amount: cel("data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))") });
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(MAP_LOC);
  expect(issues[0].message).toContain("comprehension nesting limit");
});

test("rejects a bad matches pattern in a process.start mapping value", () => {
  const issues = startIssues({ field_t_amount: cel('data.note.matches("(")') });
  expect(issues.length).toBe(1);
  expect(issues[0].loc).toBe(MAP_LOC);
  expect(issues[0].message).toContain("does not compile as a JavaScript RegExp");
});

test("rejects result and child.outcome in a process.start mapping value", () => {
  for (const [src, word] of [["result", "result"], ["child.outcome", "child"]] as const) {
    const issues = startIssues({ field_t_amount: cel(src) });
    expect(issues.length).toBe(1);
    expect(issues[0].loc).toBe(MAP_LOC);
    expect(issues[0].message.toLowerCase()).toContain(word);
  }
});

test("accepts a well-typed process.start mapping value whatever type it infers to", () => {
  expect(startIssues({ field_t_amount: cel("data.amount * 2.0") })).toEqual([]);
  expect(startIssues({ field_t_note: cel("data.note") })).toEqual([]);
  expect(startIssues({ field_t_who: cel("actor.id + instance.id") })).toEqual([]);
});

test("checks every entry of a process.start mapping, each at its own key", () => {
  const issues = startIssues({ field_ok: cel("data.amount"), field_bad: cel("data.missing"), field_worse: cel("result") });
  expect(issues.map((i) => i.loc).sort()).toEqual([
    "steps[0].onEntry[0].config.inputMapping.field_bad",
    "steps[0].onEntry[0].config.inputMapping.field_worse",
  ]);
});

test("a process.start action at a path and at a timer is a checked site too", () => {
  const action = startAction({ processId: "proc_target", inputMapping: { field_t_amount: cel("data.missing") } });
  const onPath = {
    id: "step_a", key: "a", label: { en: "A" }, type: "task",
    paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual", onPath: [action] }],
  };
  const onFire = {
    id: "step_a", key: "a", label: { en: "A" }, type: "task",
    paths: [{ id: "path_a", key: "pa", label: "Pa", to: "step_b", trigger: "manual" }],
    timers: [{ id: "timer_a", duration: "PT1H", onFire: { actions: [action] } }],
  };
  expect(validateProcessBody(body({ fields: startFields, steps: [onPath] })).map((i) => i.loc)).toEqual([
    "steps[0].paths[0].onPath[0].config.inputMapping.field_t_amount",
  ]);
  expect(validateProcessBody(body({ fields: startFields, steps: [onFire] })).map((i) => i.loc)).toEqual([
    "steps[0].timers[0].onFire.actions[0].config.inputMapping.field_t_amount",
  ]);
});

test("reads no other plugin config for CEL", () => {
  const bad = cel("data.missing");
  // Another action type, even with the same key shape.
  const http = startStep(startAction({ processId: "proc_target", inputMapping: { field_t_amount: bad }, nested: { value: bad } }, "http.request"));
  expect(validateProcessBody(body({ fields: startFields, steps: [http] }))).toEqual([]);
  // Another key of a process.start config.
  const other = startStep(startAction({ processId: "proc_target", inputMapping: {}, extra: bad, nested: { value: bad } }));
  expect(validateProcessBody(body({ fields: startFields, steps: [other] }))).toEqual([]);
});

test("a malformed process.start config is skipped without a throw", () => {
  const configs: unknown[] = [
    undefined,
    null,
    "text",
    42,
    [],
    {},
    { processId: "proc_target" },
    { processId: "proc_target", inputMapping: "text" },
    { processId: "proc_target", inputMapping: 42 },
    { processId: "proc_target", inputMapping: null },
    { processId: "proc_target", inputMapping: [cel("data.missing")] },
  ];
  for (const config of configs) {
    const step = startStep(startAction(config));
    expect(() => validateProcessBody(body({ fields: startFields, steps: [step] }))).not.toThrow();
    expect(validateProcessBody(body({ fields: startFields, steps: [step] }))).toEqual([]);
  }
});

test("a process.start mapping entry that is not a CEL expression is skipped", () => {
  const entries: unknown[] = [
    null,
    "data.missing",
    42,
    true,
    [],
    {},
    { lang: "json", src: "data.missing" },
    { lang: "cel" },
    { lang: "cel", src: 7 },
  ];
  for (const entry of entries) {
    expect(() => startIssues({ field_t_amount: entry })).not.toThrow();
    expect(startIssues({ field_t_amount: entry })).toEqual([]);
  }
  // A skipped entry does not hide its sibling.
  const issues = startIssues({ field_skip: null, field_t_amount: cel("data.missing") });
  expect(issues.map((i) => i.loc)).toEqual([MAP_LOC]);
});
