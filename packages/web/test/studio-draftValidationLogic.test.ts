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
