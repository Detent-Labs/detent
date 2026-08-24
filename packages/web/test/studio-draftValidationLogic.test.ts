import { describe, expect, it } from "bun:test";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
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
    expect(() => runValidation(body as Draft, undefined, {}, {})).not.toThrow();
  });

  it("reports a non-identifier field key as a 'structural' issue, not an unhandled throw", () => {
    const body = cleanBody();
    (body.fields![0] as { key: string }).key = "my-field";

    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    const issue = result.issues.find((i) => i.source === "structural");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("field key must match");
  });

  it("an uncompilable validation.pattern is reported as a 'structural' issue", () => {
    const body = cleanBody();
    (body.fields![0] as { validation?: unknown }).validation = { pattern: "(" };

    const result = runValidation(body, undefined, {}, {});
    const issue = result.issues.find((i) => i.source === "structural");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("does not compile");
  });

  it("a clean draft raises no structural issue", () => {
    const result = runValidation(cleanBody(), undefined, {}, {});
    expect(result.issues.some((i) => i.source === "structural")).toBe(false);
  });

  // validation-sequence-module: validateStructure (src/validate.ts) now runs
  // compileProcessBody on the SAME raw `authored` value it received, shared
  // identically between publishBody and runValidation, so checkUnknownKeys
  // CAN now fire against a raw studio Draft when the offending key happens
  // to survive to that call. The rail no longer promises it never will:
  // CheckGroup.unknownKeysHeldBack (checksRail.ts) is unconditionally `true`
  // on the structural group regardless, so the rail never claims a clean
  // pass on this dimension either way — this test pins that promise, not
  // the old "never fires" boundary. See design.md's "The unknown-key check
  // stays held back in the studio" decision.
  it("unknownKeysHeldBack stays true on the structural group regardless of whether an unknown key happens to surface", () => {
    const body = cleanBody() as unknown as Record<string, unknown>;
    body.uiMeta = { editor: "v1" };
    const result = runValidation(body as Draft, undefined, {}, {});
    const groups = groupChecksBySource(result);
    expect(groups.find((g) => g.source === "structural")!.unknownKeysHeldBack).toBe(true);
  });
});

// validation-sequence-module task 4.6: ValidationResult's per-dimension
// record replaces structurallyValid/structuralChecked. "ran with no issue"
// (old structurallyValid) is dimensions.structural === "ran" with no
// structural-source issue; "ran at all" (old structuralChecked) is
// dimensions.structural === "ran" on its own, regardless of issues — a
// Zod-valid, duration-failing draft never reaches structuralIssues, so it
// must NOT read the same as a draft with no structural issue.
describe("runValidation: dimensions.duration / dimensions.structural", () => {
  it("a Zod-invalid draft reports both not-run", () => {
    const result = runValidation({} as Draft, undefined, {}, {});
    expect(result.zodValid).toBe(false);
    expect(result.dimensions.duration).toBe("not-run");
    expect(result.dimensions.structural).toBe("not-run");
  });

  it("a duration-only failure leaves structural not-run (structural checks never ran)", () => {
    const body = cleanBody();
    (body.workflow!.steps![0] as { timers?: unknown[] }).timers = [
      { id: "timer_x", duration: "P99999Y", onFire: {} },
    ];
    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues.some((i) => i.source === "duration")).toBe(true);
    expect(result.dimensions.duration).toBe("ran");
    expect(result.dimensions.structural).toBe("not-run");
  });

  it("a structural-only failure reports structural ran, with an open structural issue", () => {
    const body = cleanBody();
    (body.fields![0] as { key: string }).key = "my-field";
    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues.some((i) => i.source === "structural")).toBe(true);
    expect(result.dimensions.structural).toBe("ran");
  });

  it("a clean, compilable draft reports both ran with no issue", () => {
    const result = runValidation(cleanBody(), undefined, {}, {});
    expect(result.dimensions.duration).toBe("ran");
    expect(result.dimensions.structural).toBe("ran");
    expect(result.issues.some((i) => i.source === "structural" || i.source === "duration")).toBe(false);
  });
});

// add-step-assignment-warning: the studio's assignment-less-step warning
// (inlined in StepsPanel.tsx) stays outside this pipeline entirely, the
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
            paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
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

    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

// technical-field-marker: compile.ts::checkTechnicalFields' two rules anchor
// through resolveLoc's dotted-loc conventions — the view rule on its step,
// the group rule on its field — never on the process root.
describe("runValidation: technical-field structural issues anchor on the right entity", () => {
  it("a technical field's view entry violation anchors on its step", () => {
    const body = cleanBody();
    (body.fields![0] as { technical?: boolean }).technical = true;
    (body.workflow!.steps![0] as unknown as { view?: unknown }).view = {
      fields: [{ ref: "field_amount", required: true }],
    };

    const result = runValidation(body, undefined, {}, {});
    const issue = result.issues.find((i) => i.source === "structural" && i.message.includes("required"));
    expect(issue).toBeDefined();
    expect(issue!.entityType).toBe("step");
    expect(issue!.entityId).toBe("step_a");
  });

  it("a technical group field anchors on the field", () => {
    const body = cleanBody();
    (body.fields as unknown[]).push({ id: "field_g", key: "g", label: { en: "G" }, type: "group", technical: true, fields: [] });

    const result = runValidation(body, undefined, {}, {});
    const issue = result.issues.find((i) => i.source === "structural" && i.message.includes("group"));
    expect(issue).toBeDefined();
    expect(issue!.entityType).toBe("field");
    expect(issue!.entityId).toBe("field_g");
  });
});

// technical-field-marker: checkUnwrittenTechnicalFields is a sibling of
// checkViewFlags, wired into runValidation under the "view" source. This pins
// that wiring end to end, not just the sibling function in isolation.
describe("runValidation: an unwritten technical field surfaces under the view source", () => {
  it("reports a field-anchored 'view' issue for a technical field no structural source writes", () => {
    const body = cleanBody();
    (body.fields![0] as { technical?: boolean }).technical = true;

    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    const issue = result.issues.find((i) => i.source === "view" && i.entityId === "field_amount");
    expect(issue).toBeDefined();
    expect(issue!.entityType).toBe("field");
  });

  it("raises no 'view' issue for a technical field an action output writes", () => {
    const body = cleanBody();
    (body.fields![0] as { technical?: boolean }).technical = true;
    (body.workflow!.steps![0] as unknown as { onEntry?: unknown[] }).onEntry = [
      { id: "action_x", type: "core.noop", output: { field_amount: { lang: "cel", src: "result" } } },
    ];

    const result = runValidation(body, undefined, {}, {});
    expect(result.issues.some((i) => i.source === "view" && i.entityId === "field_amount")).toBe(false);
  });
});
