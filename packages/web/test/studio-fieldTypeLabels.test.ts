import { describe, expect, it } from "bun:test";
import { FIELD_KINDS, fieldKindOf } from "workflow-engine/schema";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";
import { fieldKindLabel, fieldKindWord } from "../src/areas/studio/draft/field-type-labels.js";

/** The rail row's word and the kind picker's word come from this one lookup,
 * so the two cannot disagree about a field (task 1.5). Every word reads
 * through the studio catalog, so an operator can override it (task 4.2). */
describe("fieldKindLabel", () => {
  it("answers a non-empty name and note for every entry of the engine's kind table", () => {
    for (const name of Object.keys(FIELD_KINDS) as (keyof typeof FIELD_KINDS)[]) {
      const entry = fieldKindLabel(name);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(0);
    }
  });

  it("reads each word from the studio catalog, not from a literal", () => {
    for (const name of Object.keys(FIELD_KINDS) as (keyof typeof FIELD_KINDS)[]) {
      expect(fieldKindLabel(name).name).toBe(studioCatalog.en[`fieldKind.${name}.name`]);
      expect(fieldKindLabel(name).note).toBe(studioCatalog.en[`fieldKind.${name}.note`]);
    }
  });

  it("names a word for the kind a date field reads as", () => {
    const kind = fieldKindOf({ type: "string", format: "date" });
    expect(kind).toBe("date");
    expect(fieldKindLabel(kind!).name).toBe("Date");
  });
});

/** The rail row and the kind picker print one word for one field (task 7.3).
 * The three answers below are the three the picker itself offers. */
describe("fieldKindWord", () => {
  it("names the kind for a declared triple the table carries", () => {
    expect(fieldKindWord({ type: "string", format: "date" })).toBe("Date");
    expect(fieldKindWord({ type: "list", control: "checkboxes" })).toBe(
      studioCatalog.en["fieldKind.checkboxChoice.name"],
    );
  });

  it("names the picker's own custom-type word for a plugin envelope", () => {
    expect(fieldKindWord({ type: { type: "org.rating", config: {} } })).toBe(
      studioCatalog.en["fieldCatalog.customTypeOption"],
    );
  });

  it("prints the raw triple for a combination the curated table names no kind for", () => {
    expect(fieldKindOf({ type: "number", control: "radio" })).toBeUndefined();
    expect(fieldKindWord({ type: "number", control: "radio" })).toBe("number / radio");
  });
});
