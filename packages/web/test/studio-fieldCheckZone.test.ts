import { describe, expect, it } from "bun:test";
import { fieldCheckZone } from "../src/areas/studio/panels/fieldCheckZone.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

describe("fieldCheckZone", () => {
  it("stands a key check in the zone that asks", () => {
    expect(fieldCheckZone("fields[0].key")).toBe("asks");
  });

  it("stands an option check where values come from", () => {
    expect(fieldCheckZone("fields[0].options[2]")).toBe("values");
  });

  it("stands a validation-rule check in the validation zone", () => {
    expect(fieldCheckZone("fields[0].validation")).toBe("validation");
    expect(fieldCheckZone("fields[0].validation.pattern")).toBe("validation");
  });

  it("answers undefined for a suffix no zone owns", () => {
    expect(fieldCheckZone("fields[0].redactable")).toBeUndefined();
  });

  it("reads the segment nearest the field, not the far end", () => {
    // A check on an option's own label is a check on the option.
    expect(fieldCheckZone("fields[0].options[2].label")).toBe("values");
  });

  it("resolves against the child when the check sits inside a group", () => {
    expect(fieldCheckZone("fields[0].fields[1].key")).toBe("asks");
  });

  it("reads the id form a technical-field check carries", () => {
    expect(fieldCheckZone("fields.field_9c7e.technical")).toBe("kind");
  });

  it("answers undefined for a loc carrying no field anchor", () => {
    expect(fieldCheckZone("workflow.steps[0].onEntry[0].config.x")).toBeUndefined();
  });

  it("answers undefined for a view entry, which describes a step and not the field", () => {
    expect(fieldCheckZone("workflow.steps[0].view.fields[1].required")).toBeUndefined();
  });
});

/** Task 3.2's own check: a produced `EditorIssue` carries the location its
 * validator reported, so a surface can place it inside the entity rather than
 * only against it. */
describe("EditorIssue carries the check's own location", () => {
  const body = (): Draft =>
    ({
      key: "p",
      label: { en: "P" },
      baseLocale: "en",
      fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
      workflow: {
        initialStep: "step_a",
        steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }],
      },
    }) as unknown as Draft;

  it("reads a loc off a structural issue, and places it at its zone", () => {
    const draft = body();
    (draft.fields![0] as { key: string }).key = "my-field";

    const issue = runValidation(draft, undefined, {}, {}).issues.find((i) => i.source === "structural");

    expect(issue).toBeDefined();
    expect(issue!.loc).toBe("fields[0].key");
    expect(fieldCheckZone(issue!.loc)).toBe("asks");
  });

  it("joins a Zod issue's path array into the same dotted-and-bracketed form", () => {
    const draft = body();
    (draft.fields![0] as { type: unknown }).type = 42;

    const issue = runValidation(draft, undefined, {}, {}).issues.find((i) => i.source === "zod");

    expect(issue).toBeDefined();
    expect(issue!.loc.startsWith("fields[0].type")).toBe(true);
    expect(fieldCheckZone(issue!.loc)).toBe("kind");
  });

  it("carries a loc on the studio's own technical-field finding", () => {
    const draft = body();
    (draft.fields![0] as { technical: boolean }).technical = true;

    const issue = runValidation(draft, undefined, {}, {}).issues.find((i) => i.source === "view");

    expect(issue).toBeDefined();
    expect(issue!.loc).toBe("fields.field_amount.technical");
    expect(fieldCheckZone(issue!.loc)).toBe("kind");
  });
});
