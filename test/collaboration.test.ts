/**
 * `configure-task-collaboration`: `ProcessBody` and `Step` each carry an
 * optional `collaboration: { comments?: boolean; attachments?: boolean }`
 * (`definition-contract`'s "A process and its steps declare whether comment
 * and attachment collaboration is available" requirement). Resolution is
 * per-key and not schema-enforced (no cross-field refinement — every
 * combination is a valid body), so these cases drive the Runtime API
 * Layer's own `resolveCollaboration` directly, rather than a local copy of
 * its fallback chain, so an inverted precedence bug there fails here too.
 */
import { describe, it, expect } from "bun:test";
import { processBody } from "../src/schema/definition.js";
import { resolveCollaboration } from "../src/runtime/api.js";

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
    expect(resolveCollaboration(parsed, step, "comments")).toBe(true); // inherited
    expect(resolveCollaboration(parsed, step, "attachments")).toBe(false); // overridden
  });

  it("a step turns on what the process default turns off", () => {
    const parsed = processBody.parse(bodyWith({ attachments: false }, { attachments: true }));
    const step = parsed.workflow.steps[0]!;
    expect(resolveCollaboration(parsed, step, "attachments")).toBe(true); // a step's own setting always wins, either direction
  });
});
