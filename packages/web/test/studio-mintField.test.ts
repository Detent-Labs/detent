import { describe, expect, it } from "bun:test";
import { FIELD_KINDS } from "workflow-engine/schema";
import { baseTypeForPaletteKind, mintCatalogField, PALETTE_FIELD_KINDS } from "../src/areas/studio/draft/mintField.js";
import { fieldKindLabel } from "../src/areas/studio/draft/field-type-labels.js";
import { labelChangePatch, takenFieldKeys } from "../src/areas/studio/panels/fieldCatalogLogic.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { insertViewField, isDraftViewField } from "../src/areas/studio/draft/view-layout.js";

describe("baseTypeForPaletteKind", () => {
  it("reads every palette entry off the engine's own field-kind table", () => {
    expect(baseTypeForPaletteKind("text")).toEqual({ type: "string" });
    expect(baseTypeForPaletteKind("radioChoice")).toEqual({ type: "string", control: "radio" });
    expect(baseTypeForPaletteKind("date")).toEqual({ type: "string", format: "date" });
    expect(baseTypeForPaletteKind("number")).toEqual({ type: "number" });
    expect(baseTypeForPaletteKind("file")).toEqual({ type: "file" });
    expect(baseTypeForPaletteKind("group")).toEqual({ type: "group" });
  });

  it("lists all sixteen kinds in the table's order, Text first and Group last", () => {
    expect(PALETTE_FIELD_KINDS).toHaveLength(16);
    expect(PALETTE_FIELD_KINDS).toEqual(Object.keys(FIELD_KINDS) as typeof PALETTE_FIELD_KINDS);
    expect(PALETTE_FIELD_KINDS[0]).toBe("text");
    expect(PALETTE_FIELD_KINDS[15]).toBe("group");
  });

  it("covers every declared palette kind", () => {
    for (const kind of PALETTE_FIELD_KINDS) expect(baseTypeForPaletteKind(kind).type).toBeTruthy();
  });
});

describe("mintCatalogField", () => {
  it("mints a fresh, prefixed id on every call", () => {
    const a = mintCatalogField("text", { en: "" }, "en");
    const b = mintCatalogField("text", { en: "" }, "en");
    expect(a.id).not.toBe(b.id);
    expect(a.id?.startsWith("field_")).toBe(true);
  });

  it("seeds label and the key it derives, and carries the kind's own type and format", () => {
    const field = mintCatalogField("date", { en: "hello" }, "en");
    expect(field.label).toEqual({ en: "hello" });
    expect(field.key).toBe("hello");
    expect(field.type).toBe("string");
    expect(field.format).toBe("date");
  });

  it("seeds the base-locale label with the kind's name, for every kind", () => {
    for (const kind of PALETTE_FIELD_KINDS) {
      expect(mintCatalogField(kind, { en: "" }, "en").label?.en).toBe(fieldKindLabel(kind).name);
    }
    expect(mintCatalogField("date", { en: "" }, "en").label).toEqual({ en: "Date" });
  });

  it("keeps the content-locale seed beside the base-locale kind name", () => {
    expect(mintCatalogField("number", { de: "" }, "en").label).toEqual({ de: "", en: "Number" });
    expect(mintCatalogField("number", undefined, "en").label).toEqual({ en: "Number" });
  });

  it("derives the key from the kind's name, deduped against the catalog", () => {
    const taken = new Set<string>();
    const first = mintCatalogField("date", { en: "" }, "en", taken);
    taken.add(first.key!);
    const second = mintCatalogField("date", { en: "" }, "en", taken);

    expect(first.key).toBe("date");
    expect(second.key).toBe("date_2");
    expect(mintCatalogField("dateTime", { de: "" }, "en").key).toBe("date_and_time");
  });

  it("lets a typed name take the key over from the minted one", () => {
    const draft = {
      baseLocale: "en",
      fields: [mintCatalogField("date", { en: "" }, "en"), mintCatalogField("date", { en: "" }, "en", new Set(["date"]))],
    } as unknown as Draft;
    const keys = (draft.fields ?? []).map((field) => {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
        Object.assign(field, labelChangePatch(draft, field, { en: "Due date".slice(0, n) }, "en", new Set()));
      }
      return field.key;
    });

    expect(draft.fields![0]!.label).toEqual({ en: "Due date" });
    expect(keys).toEqual(["due_date", "due_date_2"]);
  });

  it("passes over a key only an expression reads, through the Fields tab's taken set", () => {
    const draft = {
      baseLocale: "en",
      fields: [],
      workflow: { steps: [{ id: "step_a", paths: [{ id: "path_a", guard: { lang: "cel", src: "data.date != \"\"" } }] }] },
    } as unknown as Draft;
    const field = mintCatalogField("date", { en: "" }, "en", takenFieldKeys(draft));

    expect(field.key).toBe("date_2");
    const guard = (draft.workflow as unknown as { steps: { paths: { guard: { src: string } }[] }[] }).steps[0]!.paths[0]!.guard;
    expect(guard.src).toBe('data.date != ""');
  });

  it("mints a group against the other fields' keys alone", () => {
    const draft = {
      baseLocale: "en",
      fields: [],
      workflow: { steps: [{ id: "step_a", paths: [{ id: "path_a", guard: { lang: "cel", src: "data.group" } }] }] },
    } as unknown as Draft;

    expect(mintCatalogField("group", { en: "" }, "en", takenFieldKeys(draft, undefined, true)).key).toBe("group");
    expect(mintCatalogField("text", { en: "" }, "en", takenFieldKeys(draft)).key).toBe("text");
  });

  it("mints a Number as a number field with no format or control", () => {
    const field = mintCatalogField("number", { en: "Amount" }, "en");
    expect(field.type).toBe("number");
    expect(field.format).toBeUndefined();
    expect(field.control).toBeUndefined();
    expect(field.options).toBeUndefined();
  });

  it("writes no format key for a kind that names none", () => {
    const field = mintCatalogField("text", { en: "" }, "en");
    expect(field.format).toBeUndefined();
  });

  it("a group mints with an empty sub-fields array", () => {
    const field = mintCatalogField("group", { en: "" }, "en");
    expect(field.type).toBe("group");
    expect(field.fields).toEqual([]);
  });

  it("a non-group kind carries no fields array", () => {
    const field = mintCatalogField("text", { en: "" }, "en");
    expect(field.fields).toBeUndefined();
  });

  it("seeds two choices on each of the three choice kinds, labelled in the base locale", () => {
    for (const kind of ["radioChoice", "multiChoice", "checkboxChoice"] as const) {
      const field = mintCatalogField(kind, { de: "" }, "de");
      expect(field.options).toEqual([
        { value: "choice_1", label: { de: "Choice 1" } },
        { value: "choice_2", label: { de: "Choice 2" } },
      ]);
    }
  });

  it("seeds no choices on any other kind", () => {
    for (const kind of PALETTE_FIELD_KINDS) {
      if (kind === "radioChoice" || kind === "multiChoice" || kind === "checkboxChoice") continue;
      expect(mintCatalogField(kind, { en: "" }, "en").options).toBeUndefined();
    }
  });
});

/** The palette's "mint and place" drop (task 3.2): one field, minted once,
 * placed once. `FormEditorScreen`'s own `mintAndPlace` composes exactly
 * these two calls inside one `mutate()`; this is the composition's own
 * contract, that a freshly-minted field's id is immediately usable as an
 * `insertViewField` ref. */
describe("mint-and-place composes mintCatalogField with insertViewField", () => {
  it("places the minted field at the drop slot, once", () => {
    const field = mintCatalogField("radioChoice", { en: "" }, "en");
    const rows = insertViewField([], field.id!, 0);
    expect(rows).toEqual([{ ref: field.id }]);
  });

  it("a field minted this way is a real catalog entry other palette logic can read", () => {
    const field = mintCatalogField("file", { en: "" }, "en");
    const catalogIds = [field.id!];
    // Placed already, so it must not still list as unplaced.
    const rows = insertViewField([], field.id!, 0);
    const placed = new Set(rows.filter(isDraftViewField).map((r) => r.ref));
    expect(catalogIds.filter((id) => !placed.has(id))).toEqual([]);
  });
});
