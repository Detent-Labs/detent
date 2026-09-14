/**
 * `configure-task-collaboration`: `ProcessBody` and `Step` each carry an
 * optional `collaboration: { comments?: boolean; attachments?: boolean }`
 * (`definition-contract`'s "A process and its steps declare whether comment
 * and attachment collaboration is available" requirement). Resolution is
 * per-key and not schema-enforced (no cross-field refinement — every
 * combination is a valid body), so `resolve` below applies the same
 * `step.collaboration?.[key] ?? process.collaboration?.[key] ?? true` chain
 * the Runtime API Layer reads at its own call sites, directly against
 * parsed values.
 */
import { describe, it, expect } from "bun:test";
import { processBody } from "../src/schema/definition.js";

const minimalStep = (collaboration?: unknown) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type: "task",
  terminal: true,
  ...(collaboration !== undefined ? { collaboration } : {}),
});

const bodyWith = (processCollaboration?: unknown, stepCollaboration?: unknown) => ({
  key: "p",
  label: { en: "P" },
  baseLocale: "en",
  fields: [],
  ...(processCollaboration !== undefined ? { collaboration: processCollaboration } : {}),
  workflow: { initialStep: "step_a", steps: [minimalStep(stepCollaboration)] },
});

const resolve = (
  process: { collaboration?: { comments?: boolean; attachments?: boolean } },
  step: { collaboration?: { comments?: boolean; attachments?: boolean } },
  key: "comments" | "attachments",
): boolean => step.collaboration?.[key] ?? process.collaboration?.[key] ?? true;

describe("definition-contract: a process and its steps declare collaboration availability", () => {
  it("a body declaring no collaboration field anywhere parses, every field undefined", () => {
    const parsed = processBody.parse(bodyWith());
    expect(parsed.collaboration).toBeUndefined();
    expect(parsed.workflow.steps[0]!.collaboration).toBeUndefined();
  });

  it("a step overrides one key and inherits the other from the process default", () => {
    const parsed = processBody.parse(bodyWith({ comments: true, attachments: true }, { attachments: false }));
    const step = parsed.workflow.steps[0]!;
    expect(step.collaboration).toEqual({ attachments: false }); // only the overridden key is stored
    expect(resolve(parsed, step, "comments")).toBe(true); // inherited
    expect(resolve(parsed, step, "attachments")).toBe(false); // overridden
  });

  it("a step turns on what the process default turns off", () => {
    const parsed = processBody.parse(bodyWith({ attachments: false }, { attachments: true }));
    const step = parsed.workflow.steps[0]!;
    expect(resolve(parsed, step, "attachments")).toBe(true); // a step's own setting always wins, either direction
  });
});
