import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { validateProcessBody, validateMigrationSpec, checkSubprocessChildRefs, parseExpression, parseAst, checkAgainstFields, celType, ACTOR_SCHEMA, type CelIssue } from "../src/cel/check.js";
import { evalTransforms } from "../src/cel/eval.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { instance as instanceSchema, baseFieldType, type ProcessBody, type MigrationSpec, type Instance, type FieldDef } from "../src/schema/definition.js";

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

// The expectation is scoped to the deadline site only: every other site stays
// unconstrained, so non-string results elsewhere must still pass.
test("the deadline result-type expectation does not leak into other sites", () => {
  const step = {
    id: "step_a",
    key: "a",
    label: { en: "A" },
    type: "task",
    // Action.output writeback: a double, not a string.
    onEntry: [{ id: "action_a", type: "http", config: {}, output: { field_amount: { lang: "cel", src: "result.total" } } }],
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

// Every shipped example must survive the check, since publish now enforces it —
// an example that cannot be published is not an example. Checked against the
// COMPILED body, which is what publishBody hands to validateProcessBody.
test.each([
  "expense-approval.json",
  "subprocess-credit-check-child.json",
  "subprocess-loan-parent.json",
])("accepts the real %s example", (name) => {
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
// checked against the TARGET field it writes. cel(...) shortens an expression.
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
