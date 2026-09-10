/**
 * `form-view-tabs`: `view.tabs`, `tab` on a field/note entry, and the five
 * rules that hold the tab/field/group hierarchy together
 * (`definition-contract`'s "A view's tabs and its entries form one
 * hierarchy" requirement). All five live in one `superRefine` on `view` in
 * `src/schema/definition.ts`. The tab label's base-locale check is a
 * separate requirement in the same delta spec, reusing
 * `authored-content-localization`'s existing rule.
 */
import { describe, it, expect } from "bun:test";
import { processBody } from "../src/schema/definition.js";

const minimalStep = (view?: unknown) => ({
  id: "step_a",
  key: "a",
  label: { en: "A" },
  type: "task",
  terminal: true,
  ...(view !== undefined ? { view } : {}),
});

// Two catalog fields: field_x is a plain root field, field_g is a group
// field whose own root entry can carry a tab, distinct from the group's
// member entries (which name field_g's key via `group`, never `tab`).
const bodyWithView = (view: unknown) => ({
  key: "p",
  label: { en: "P" },
  baseLocale: "en",
  fields: [
    { id: "field_x", key: "x", label: { en: "X" }, type: "string" },
    {
      id: "field_g", key: "g", label: { en: "G" }, type: "group",
      fields: [{ id: "field_n", key: "n", label: { en: "N" }, type: "string" }],
    },
  ],
  workflow: { initialStep: "step_a", steps: [minimalStep(view)] },
});

describe("definition-contract: a step view may declare tabs", () => {
  it("a view declares two tabs and assigns every root entry", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }, { key: "notes", label: { en: "Notes" } }],
      fields: [
        { ref: "field_x", tab: "details" },
        { ref: "field_g", tab: "notes" },
        { kind: "note", text: { en: "Note" }, group: "g" },
      ],
    });
    const parsed = processBody.parse(body);
    const tabs = parsed.workflow.steps[0]!.view!.tabs!;
    expect(tabs.map((t) => t.key)).toEqual(["details", "notes"]);
  });

  it("an untabbed view still parses, carrying no tabs key", () => {
    const body = bodyWithView({ fields: [{ ref: "field_x" }, { ref: "field_g" }] });
    const parsed = processBody.parse(body);
    expect(parsed.workflow.steps[0]!.view).not.toHaveProperty("tabs");
  });

  it("a tab holding no entry still publishes", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }, { key: "empty", label: { en: "Empty" } }],
      fields: [{ ref: "field_x", tab: "details" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(true);
  });
});

describe("definition-contract: a view's tabs and its entries form one hierarchy", () => {
  it("rule 1: rejects two tabs in one view sharing a key", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }, { key: "details", label: { en: "Details 2" } }],
      fields: [{ ref: "field_x", tab: "details" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rule 2: rejects an entry's tab naming no declared tab", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }],
      fields: [{ ref: "field_x", tab: "summary" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rule 3: rejects a root entry left out of every tab", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }],
      fields: [{ ref: "field_x" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rule 4: rejects an entry inside a group that also declares a tab", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }],
      fields: [
        { ref: "field_g", tab: "details" },
        { kind: "note", text: { en: "Note" }, group: "g", tab: "details" },
      ],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rule 5: rejects a tab on a view declaring no tabs", () => {
    const body = bodyWithView({ fields: [{ ref: "field_x", tab: "details" }] });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("treats an empty-string tab the same as an absent one, tripping rule 3", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details" } }],
      fields: [{ ref: "field_x", tab: "" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("rejects a tab key that is empty after trimming", () => {
    const body = bodyWithView({
      tabs: [{ key: "   ", label: { en: "Details" } }],
      fields: [{ ref: "field_x", tab: "details" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });
});

describe("definition-contract: a tab label's base-locale check takes the schema placement", () => {
  it("rejects a tab label omitting the body's baseLocale", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { de: "Details" } }],
      fields: [{ ref: "field_x", tab: "details" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(false);
  });

  it("accepts a tab label carrying the base locale plus another", () => {
    const body = bodyWithView({
      tabs: [{ key: "details", label: { en: "Details", de: "Details-de" } }],
      fields: [{ ref: "field_x", tab: "details" }, { ref: "field_g", tab: "details" }],
    });
    expect(processBody.safeParse(body).success).toBe(true);
  });
});
