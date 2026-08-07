import { describe, expect, it } from "bun:test";
import { baseTypeForPaletteKind, mintCatalogField, PALETTE_FIELD_KINDS } from "../src/areas/studio/draft/mintField.js";
import { insertViewField } from "../src/areas/studio/draft/view-layout.js";

describe("baseTypeForPaletteKind", () => {
  it("maps every palette entry to the catalog type it mints", () => {
    expect(baseTypeForPaletteKind("text")).toBe("string");
    expect(baseTypeForPaletteKind("choice")).toBe("select");
    expect(baseTypeForPaletteKind("date")).toBe("date");
    expect(baseTypeForPaletteKind("file")).toBe("file");
    expect(baseTypeForPaletteKind("section")).toBe("group");
  });

  it("covers every declared palette kind", () => {
    for (const kind of PALETTE_FIELD_KINDS) expect(baseTypeForPaletteKind(kind)).toBeTruthy();
  });
});

describe("mintCatalogField", () => {
  it("mints a fresh, prefixed id on every call", () => {
    const a = mintCatalogField("text", { en: "" });
    const b = mintCatalogField("text", { en: "" });
    expect(a.id).not.toBe(b.id);
    expect(a.id?.startsWith("field_")).toBe(true);
  });

  it("seeds label and an empty key, and carries the kind's own type", () => {
    const field = mintCatalogField("date", { en: "hello" });
    expect(field.label).toEqual({ en: "hello" });
    expect(field.key).toBe("");
    expect(field.type).toBe("date");
  });

  it("a section (group) mints with an empty sub-fields array", () => {
    const field = mintCatalogField("section", { en: "" });
    expect(field.type).toBe("group");
    expect(field.fields).toEqual([]);
  });

  it("a non-group kind carries no fields array", () => {
    const field = mintCatalogField("text", { en: "" });
    expect(field.fields).toBeUndefined();
  });
});

/** The palette's "mint and place" drop (task 3.2): one field, minted once,
 * placed once. `FormEditorScreen`'s own `mintAndPlace` composes exactly
 * these two calls inside one `mutate()`; this is the composition's own
 * contract, that a freshly-minted field's id is immediately usable as an
 * `insertViewField` ref. */
describe("mint-and-place composes mintCatalogField with insertViewField", () => {
  it("places the minted field at the drop slot, once", () => {
    const field = mintCatalogField("choice", { en: "" });
    const rows = insertViewField([], field.id!, 0);
    expect(rows).toEqual([{ ref: field.id }]);
  });

  it("a field minted this way is a real catalog entry other palette logic can read", () => {
    const field = mintCatalogField("file", { en: "" });
    const catalogIds = [field.id!];
    // Placed already, so it must not still list as unplaced.
    const rows = insertViewField([], field.id!, 0);
    const placed = new Set(rows.map((r) => r.ref));
    expect(catalogIds.filter((id) => !placed.has(id))).toEqual([]);
  });
});
