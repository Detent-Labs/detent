import { describe, it, expect } from "bun:test";
import { processBody, resolveLocalizedText, type FieldId } from "../src/schema/definition.js";
import { compileProcessBody } from "../src/schema/compile.js";

const minimalStep = (label: unknown) => ({
  id: "step_a",
  key: "a",
  label,
  type: "task",
  terminal: true,
});

const bodyWith = (overrides: Record<string, unknown> = {}) => ({
  key: "p",
  label: { en: "P" },
  baseLocale: "en",
  fields: [],
  workflow: { initialStep: "step_a", steps: [minimalStep({ en: "A" })] },
  ...overrides,
});

describe("authored-content-localization: baseLocale entry required", () => {
  it("rejects a process body missing baseLocale", () => {
    const { baseLocale, ...rest } = bodyWith();
    expect(processBody.safeParse(rest).success).toBe(false);
  });

  it("rejects a process label missing the baseLocale entry", () => {
    expect(processBody.safeParse(bodyWith({ label: { de: "P" } })).success).toBe(false);
  });

  it("rejects a step label missing the baseLocale entry", () => {
    const body = bodyWith({ workflow: { initialStep: "step_a", steps: [minimalStep({ de: "A" })] } });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects a field label missing the baseLocale entry, including one nested inside a group", () => {
    const topLevelMissing = bodyWith({
      fields: [{ id: "field_x", key: "x", label: { de: "X" }, type: "string" }],
    });
    expect(processBody.safeParse(topLevelMissing).success).toBe(false);

    const nestedMissing = bodyWith({
      fields: [
        {
          id: "field_g",
          key: "g",
          label: { en: "G" },
          type: "group",
          fields: [{ id: "field_n", key: "n", label: { de: "N" }, type: "string" }],
        },
      ],
    });
    expect(processBody.safeParse(nestedMissing).success).toBe(false);
  });

  it("rejects a field option label missing the baseLocale entry", () => {
    const body = bodyWith({
      fields: [
        {
          id: "field_s",
          key: "s",
          label: { en: "S" },
          type: "string",
          options: [{ value: "a", label: { de: "A" } }],
        },
      ],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("accepts a LocalizedText value with only the baseLocale entry", () => {
    expect(processBody.safeParse(bodyWith()).success).toBe(true);
  });

  it("accepts a LocalizedText value with the baseLocale entry plus additional locales", () => {
    const body = bodyWith({ label: { en: "P", de: "P-de" } });
    expect(processBody.safeParse(body).success).toBe(true);
  });

  it("rejects a note whose text omits the body's baseLocale", () => {
    const body = bodyWith({
      workflow: {
        initialStep: "step_a",
        steps: [{ ...minimalStep({ en: "A" }), view: { fields: [{ kind: "note", text: { de: "Nur Deutsch" } }] } }],
      },
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("accepts a note's text carrying the base locale and one other locale", () => {
    const body = bodyWith({
      workflow: {
        initialStep: "step_a",
        steps: [{ ...minimalStep({ en: "A" }), view: { fields: [{ kind: "note", text: { en: "Note", de: "Notiz" } }] } }],
      },
    });
    expect(processBody.safeParse(body).success).toBe(true);
  });
});

describe("definition-contract: view entries are a two-kind union", () => {
  it("parses an entry with no kind as a field reference", () => {
    const body = bodyWith({
      fields: [{ id: "field_x", key: "x", label: { en: "X" }, type: "string" }],
      workflow: {
        initialStep: "step_a",
        steps: [{ ...minimalStep({ en: "A" }), view: { fields: [{ ref: "field_x" }] } }],
      },
    });
    const parsed = processBody.parse(body);
    expect(parsed.workflow.steps[0]!.view!.fields).toEqual([{ ref: "field_x" as FieldId }]);
  });

  it("parses a body mixing a note with two field entries, the note at its own index", () => {
    const body = bodyWith({
      fields: [
        { id: "field_x", key: "x", label: { en: "X" }, type: "string" },
        { id: "field_y", key: "y", label: { en: "Y" }, type: "string" },
      ],
      workflow: {
        initialStep: "step_a",
        steps: [
          {
            ...minimalStep({ en: "A" }),
            view: { fields: [{ ref: "field_x" }, { kind: "note", text: { en: "Note" } }, { ref: "field_y" }] },
          },
        ],
      },
    });
    const parsed = processBody.parse(body);
    const fields = parsed.workflow.steps[0]!.view!.fields;
    expect(fields).toHaveLength(3);
    expect(fields[1]).toEqual({ kind: "note", text: { en: "Note" } });
  });
});

describe("resolveLocalizedText", () => {
  it("returns the requested locale's entry when present", () => {
    expect(resolveLocalizedText({ en: "Review", de: "Prüfen" }, "de", "en")).toBe("Prüfen");
  });

  it("falls back to the base locale when the requested locale has no entry", () => {
    expect(resolveLocalizedText({ en: "Review" }, "de", "en")).toBe("Review");
  });
});

describe("compile: cancel-sink label carries the base locale", () => {
  it("carries both en and the process's baseLocale when they differ", () => {
    const body = bodyWith({
      baseLocale: "de",
      label: { en: "P", de: "P" },
      workflow: { initialStep: "step_a", steps: [minimalStep({ en: "A", de: "A" })] },
    });
    const compiled = compileProcessBody(body as never);
    const sink = compiled.workflow.steps.find((s) => s.key === "cancel_sink")!;
    expect(sink.label).toEqual({ en: "Cancelled", de: "Cancelled" });
  });

  it("collapses to one entry when baseLocale is en", () => {
    const compiled = compileProcessBody(bodyWith() as never);
    const sink = compiled.workflow.steps.find((s) => s.key === "cancel_sink")!;
    expect(sink.label).toEqual({ en: "Cancelled" });
  });
});
