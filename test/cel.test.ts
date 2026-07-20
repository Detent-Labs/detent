import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { validateProcessBody, parseExpression, celType, type CelIssue } from "../src/cel/check.js";
import { baseFieldType, type ProcessBody } from "../src/schema/definition.js";

// Minimal ProcessBody builders. validateProcessBody reads only fields /
// dataSources / workflow.steps, so these cast loosely on purpose — the full
// structural invariants are exercised by validate.test.ts, not here.
const field = (key: string, type: string) => ({ id: `field_${key}`, key, label: key, type });

const body = (opts: {
  fields?: ReturnType<typeof field>[];
  steps?: unknown[];
  dataSources?: { id: string; key: string; type: string; config: object }[];
}): ProcessBody =>
  ({
    key: "p",
    label: "P",
    fields: opts.fields ?? [field("booking_status", "select"), field("amount", "number")],
    dataSources: opts.dataSources,
    workflow: { initialStep: "step_a", steps: opts.steps ?? [] },
  }) as unknown as ProcessBody;

const guardStep = (src: string, type: "task" | "subprocess" = "task") => ({
  id: "step_a",
  key: "a",
  label: "A",
  type,
  paths: [{ id: "path_a", key: "pa", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src } }],
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
    label: "A",
    type: "task",
    onEntry: [{ id: "action_a", type: "http", config: {}, output: { field_booking_status: { lang: "cel", src: "result.status" } } }],
    paths: [{ id: "path_a", key: "pa", to: "step_b", trigger: "manual" }],
  };
  expect(validateProcessBody(body({ steps: [step] }))).toEqual([]);
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

// 5.5b a deadline must infer to a string instant. The engine parses the value and
// omits a timer it cannot read, and an omitted timer is indistinguishable from an
// undeclared one at runtime — so a wrong-typed deadline is a publish error.
const deadlineStep = (src: string) => ({
  id: "step_a",
  key: "a",
  label: "A",
  type: "task",
  paths: [{ id: "path_a", key: "pa", to: "step_b", trigger: "manual" }],
  timers: [{ id: "timer_a", key: "ta", deadline: { lang: "cel", src }, onFire: { actions: [] } }],
});

const typedFields = [
  field("amount", "number"),
  field("approved", "boolean"),
  field("tags", "multiselect"),
  field("due_at", "datetime"),
  field("due_on", "date"),
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
  const plugin = { id: "field_custom", key: "custom", label: "custom", type: { type: "geo", config: {} } };
  const fields = [...typedFields, plugin] as unknown as ReturnType<typeof field>[];
  expect(validateProcessBody(body({ fields, steps: [deadlineStep("data.custom")] }))).toEqual([]);
});

// buildGuardContext resolves no data sources, so a deadline referencing one throws
// at every arming — for every instance of the definition, permanently. Withholding
// the namespace here turns that into a publish error.
const ds = [{ id: "ds_users", key: "users", type: "http", config: {} }];

test("rejects a deadline referencing a data source", () => {
  const issues = validateProcessBody(
    body({ fields: typedFields, dataSources: ds, steps: [deadlineStep("users.due")] }),
  );
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toBe("steps[0].timers[0].deadline");
  // The message must name `users` as unresolved, like the child.* test above. The
  // count and loc alone do not distinguish this from the deadline's result-type
  // expectation firing: with the namespace registered, `users.due` infers to `dyn`
  // and yields one issue at the same loc, so asserting only those two passes while
  // the scoping is gone.
  expect(issues[0]!.message.toLowerCase()).toContain("unknown variable: users");
});

test("a data source stays visible to a guard on the same step", () => {
  const step = {
    ...deadlineStep("data.due_at"),
    paths: [
      {
        id: "path_a",
        key: "pa",
        to: "step_b",
        trigger: "automatic",
        priority: 1,
        guard: { lang: "cel", src: "users.ok == true" },
      },
    ],
  };
  expect(validateProcessBody(body({ fields: typedFields, dataSources: ds, steps: [step] }))).toEqual([]);
});

// The expectation is scoped to the deadline site only: every other site stays
// unconstrained, so non-string results elsewhere must still pass.
test("the deadline result-type expectation does not leak into other sites", () => {
  const step = {
    id: "step_a",
    key: "a",
    label: "A",
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
      { id: "path_a", key: "pa", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src: "data.amount > 0.0" } },
    ],
    // A well-typed deadline alongside them, to prove the sites are collected together.
    timers: [{ id: "timer_a", key: "ta", deadline: { lang: "cel", src: "data.due_at" }, onFire: { actions: [] } }],
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

test("accepts the real expense-approval example", () => {
  const json = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  expect(validateProcessBody(json.definition as ProcessBody)).toEqual([]);
});

// 5.8 mapping coverage: every catalog field type maps to a CEL type
test("every base field type has a CEL-type mapping", () => {
  for (const t of baseFieldType.options) {
    expect(typeof celType(t)).toBe("string");
    expect(celType(t).length).toBeGreaterThan(0);
  }
});

// parse-only entry point
test("parseExpression flags syntax but not unknown vars", () => {
  expect(parseExpression("data.x == 1").ok).toBe(true);
  expect(parseExpression("data.x >").ok).toBe(false);
});
