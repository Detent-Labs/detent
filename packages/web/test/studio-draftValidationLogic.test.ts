import { describe, expect, it } from "bun:test";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

// harden-publish-validation: compileProcessBody now also throws
// CompileValidationError (the six write-path structural checks — unknown
// keys, the reserved action prefix, pattern compile/length, id resolution,
// field-key format, length bounds), alongside the pre-existing
// DurationValidationError. runValidation must catch it and render it as
// "structural" EditorIssues, the same way it already handles
// DurationValidationError — not let it propagate and crash the validation
// panel (design.md's stated risk for this change).

const cleanBody = (): Draft =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          terminal: true,
        },
      ],
    },
  }) as unknown as Draft;

describe("runValidation: structural (compile-pass) issues", () => {
  it("does not throw on a body carrying an unknown key", () => {
    const body = cleanBody() as unknown as Record<string, unknown>;
    body.uiMeta = { editor: "v1" };
    expect(() => runValidation(body as Draft, undefined, {})).not.toThrow();
  });

  it("reports a non-identifier field key as a 'structural' issue, not an unhandled throw", () => {
    const body = cleanBody();
    (body.fields![0] as { key: string }).key = "my-field";

    const result = runValidation(body, undefined, {});
    expect(result.zodValid).toBe(true);
    const issue = result.issues.find((i) => i.source === "structural");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("field key must match");
  });

  it("an uncompilable validation.pattern is reported as a 'structural' issue", () => {
    const body = cleanBody();
    (body.fields![0] as { validation?: unknown }).validation = { pattern: "(" };

    const result = runValidation(body, undefined, {});
    const issue = result.issues.find((i) => i.source === "structural");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("does not compile");
  });

  it("a clean draft raises no structural issue", () => {
    const result = runValidation(cleanBody(), undefined, {});
    expect(result.issues.some((i) => i.source === "structural")).toBe(false);
  });

  // KNOWN GAP, documented on runValidation itself (src/draft/validation.ts):
  // an unknown key is stripped by the leading authoredProcessBody.safeParse
  // before compileProcessBody ever runs, so it can never surface as a live
  // "structural" issue here — only the real POST /processes publish call
  // (which runs compileProcessBody on the RAW body) catches it. This pins
  // that as an intentional, known boundary rather than a silent regression.
  it("an unknown key does not surface as a live structural issue (known gap; caught at real publish instead)", () => {
    const body = cleanBody() as unknown as Record<string, unknown>;
    body.uiMeta = { editor: "v1" };
    const result = runValidation(body as Draft, undefined, {});
    expect(result.issues.some((i) => i.source === "structural")).toBe(false);
  });
});

// studio-canvas-first-structure-editor task 4.0: `structurallyValid` and
// `structuralChecked` disambiguate "compiled" from "the structural checks
// ran at all" — a Zod-valid, duration-failing draft never reaches
// structuralIssues, so it must NOT read the same as a draft with no
// structural issue.
describe("runValidation: structurallyValid / structuralChecked", () => {
  it("a Zod-invalid draft reports both false", () => {
    const result = runValidation({} as Draft, undefined, {});
    expect(result.zodValid).toBe(false);
    expect(result.structurallyValid).toBe(false);
    expect(result.structuralChecked).toBe(false);
  });

  it("a duration-only failure leaves structuralChecked false (structural checks never ran)", () => {
    const body = cleanBody();
    (body.workflow!.steps![0] as { timers?: unknown[] }).timers = [
      { id: "timer_x", duration: "P99999Y", onFire: {} },
    ];
    const result = runValidation(body, undefined, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues.some((i) => i.source === "duration")).toBe(true);
    expect(result.structuralChecked).toBe(false);
    expect(result.structurallyValid).toBe(false);
  });

  it("a structural-only failure reports structuralChecked true, structurallyValid false", () => {
    const body = cleanBody();
    (body.fields![0] as { key: string }).key = "my-field";
    const result = runValidation(body, undefined, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues.some((i) => i.source === "structural")).toBe(true);
    expect(result.structuralChecked).toBe(true);
    expect(result.structurallyValid).toBe(false);
  });

  it("a clean, compilable draft reports both true", () => {
    const result = runValidation(cleanBody(), undefined, {});
    expect(result.structuralChecked).toBe(true);
    expect(result.structurallyValid).toBe(true);
  });
});

// add-step-assignment-warning: the studio's assignment-less-step warning
// (assignmentWarningLogic.ts) stays outside this pipeline entirely, the
// same way the "db.list" missing-key warning does. This pins that as a
// regression test rather than relying only on the absence of an import.
describe("runValidation: an assignment-less step", () => {
  it("raises no EditorIssue for a non-terminal step with no assignment", () => {
    const body: Draft = {
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            id: "step_a",
            key: "a",
            label: { en: "A" },
            type: "task",
            paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
          },
          {
            id: "step_b",
            key: "b",
            label: { en: "B" },
            type: "task",
            terminal: true,
          },
        ],
      },
    } as unknown as Draft;

    const result = runValidation(body, undefined, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
