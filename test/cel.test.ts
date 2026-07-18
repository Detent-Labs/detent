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
