import { describe, expect, it } from "bun:test";
import { nextFieldKey } from "../src/areas/studio/panels/fieldCatalogLogic.js";
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
