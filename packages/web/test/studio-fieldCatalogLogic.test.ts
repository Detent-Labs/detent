import { describe, expect, it } from "bun:test";
import { allowedForType, droppedByTypeChange, nextFieldKey } from "../src/areas/studio/panels/fieldCatalogLogic.js";
import { mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";
import { mintCatalogField } from "../src/areas/studio/draft/mintField.js";
import { draftFields } from "../src/areas/studio/draft/fields.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

describe("nextFieldKey", () => {
  it("derives a newly-minted top-level field's key (key '') from its label", () => {
    const field = mintCatalogField("text", undefined);
    expect(field.key).toBe("");

    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey(field.key ?? "", field.label, label, "en", new Set())).toBe("requested_amount");
  });

  it("derives a nested group-child field's key the same way a top-level field's does", () => {
    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey("", undefined, label, "en", new Set())).toBe("requested_amount");
  });

  it("dedupes across the whole catalog, top-level against a group-nested collision", () => {
    const draft: Draft = {
      baseLocale: "en",
      fields: [
        {
          id: "field_group",
          key: "group",
          type: "group",
          label: { en: "Group" },
          fields: [{ id: "field_nested", key: "requested_amount", type: "string", label: { en: "Requested amount" } }],
        },
      ],
    } as unknown as Draft;
    const taken = new Set(draftFields(draft).map((f) => f.key ?? ""));
    const label = mergeLocalizedTextEntry(undefined, "en", "Requested amount");

    expect(nextFieldKey("", undefined, label, "en", taken)).toBe("requested_amount_2");
  });

  it("leaves a hand-edited field key (top-level or nested) unchanged on a later label edit", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Requested amount");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "en", "Requested amount (USD)");

    expect(nextFieldKey("amount", priorLabel, newLabel, "en", new Set())).toBeUndefined();
  });

  it("stays empty while minting a field with the content locale differing from the base locale", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "de", "");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "de", "Angeforderter Betrag");

    expect(nextFieldKey("", priorLabel, newLabel, "en", new Set())).toBe("");
  });
});

describe("allowedForType", () => {
  it("offers each type only the members the compile pass would accept", () => {
    expect(allowedForType("string")).toEqual({ formats: ["date", "datetime", "email"], controls: ["multiline", "radio"] });
    expect(allowedForType("number")).toEqual({ formats: ["integer"], controls: [] });
    expect(allowedForType("boolean")).toEqual({ formats: [], controls: ["radio"] });
    expect(allowedForType("list")).toEqual({ formats: [], controls: ["checkboxes"] });
  });

  it("offers neither picker for a type whose row carries no member", () => {
    expect(allowedForType("file")).toEqual({ formats: [], controls: [] });
    expect(allowedForType("group")).toEqual({ formats: [], controls: [] });
  });

  it("offers neither picker for a plugin envelope, which has no row at all", () => {
    expect(allowedForType({ type: "custom.rating", config: {} })).toEqual({ formats: [], controls: [] });
  });
});

describe("droppedByTypeChange", () => {
  it("drops a format the new type refuses", () => {
    expect(droppedByTypeChange({ format: "date" }, "number")).toEqual(["format"]);
  });

  it("drops a control the new type refuses", () => {
    expect(droppedByTypeChange({ control: "multiline" }, "boolean")).toEqual(["control"]);
  });

  it("drops both when the new type refuses both", () => {
    expect(droppedByTypeChange({ format: "date", control: "multiline" }, "file")).toEqual(["format", "control"]);
  });

  it("keeps a member the new type still allows", () => {
    expect(droppedByTypeChange({ control: "radio" }, "boolean")).toEqual([]);
  });

  it("drops nothing from a field carrying neither key", () => {
    expect(droppedByTypeChange({}, "file")).toEqual([]);
  });

  it("drops both on a switch to a plugin envelope", () => {
    expect(droppedByTypeChange({ format: "email", control: "radio" }, { type: "custom.rating", config: {} })).toEqual([
      "format",
      "control",
    ]);
  });
});
