import { describe, expect, it } from "bun:test";
import { baseFieldType } from "workflow-engine/schema";
import { previewViewEntries, previewViewFields } from "../src/areas/studio/draft/field-preview.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { DraftView, DraftViewEntry } from "../src/areas/studio/draft/view-layout.js";

/** Runtime-shaped test data, cast once at the boundary — `DraftField`'s
 * branded ids (`field_a` etc.) are plain strings in a literal, the same
 * escape hatch `studio-viewFlags.test.ts`'s `vf()` takes for the same
 * reason. */
const field = (patch: Record<string, unknown>): DraftField =>
  ({ id: "field_a", key: "a", label: { en: "A" }, type: "string", ...patch }) as unknown as DraftField;

/** Same escape hatch, for a view entry: `ref` is a branded `FieldId` in the
 * real type, a plain string here. */
const entry = (patch: Record<string, unknown>): DraftViewEntry => patch as unknown as DraftViewEntry;

describe("previewViewFields", () => {
  it("returns undefined for a field carrying no id", () => {
    expect(previewViewFields(field({ id: undefined }), "en", "en")).toBeUndefined();
  });

  it("synthesizes one entry per leaf field, one sample value per base type", () => {
    for (const type of baseFieldType.options) {
      if (type === "group") continue;
      const result = previewViewFields(field({ type }), "en", "en");
      expect(result?.fields).toHaveLength(1);
      expect(result?.fields[0]!.field.type).toBe(type);
      expect(result?.fields[0]!.group).toBeUndefined();
      expect(result?.fields[0]!.readonly).toBe(true);
      // Every synthesized field gets a `values` entry, keyed by its own id.
      // This checks the key's presence rather than its value, since a `group`
      // entry's own sample is legitimately `undefined`.
      expect(Object.keys(result?.values ?? {})).toEqual(["field_a"]);
    }
  });

  it("previews a sample inside the format's own value domain", () => {
    for (const [format, sample] of [
      ["date", "2026-01-15"],
      ["datetime", "2026-01-15T09:00"],
      ["email", "sample@example.com"],
    ] as const) {
      const result = previewViewFields(field({ type: "string", format }), "en", "en");
      expect(result?.values.field_a).toBe(sample);
      expect(result?.fields[0]!.field.format).toBe(format);
    }
    const int = previewViewFields(field({ type: "number", format: "integer" }), "en", "en");
    expect(int?.values.field_a).toBe(42);
  });

  it("previews a person list's sample inside an array", () => {
    const result = previewViewFields(field({ type: "list", format: "person" }), "en", "en");
    expect(result?.values.field_a).toEqual(["user_sample"]);
  });

  it("previews the string twin's person sample as a scalar", () => {
    const result = previewViewFields(field({ type: "string", format: "person" }), "en", "en");
    expect(result?.values.field_a).toBe("user_sample");
  });

  it("carries the declared control through to the preview", () => {
    const result = previewViewFields(field({ type: "string", control: "multiline" }), "en", "en");
    expect(result?.fields[0]!.field.control).toBe("multiline");
  });

  it("previews a choice's first option as its sample value", () => {
    const f = field({
      type: "string",
      options: [
        { value: "a", label: { en: "A" } },
        { value: "b", label: { en: "B" } },
      ],
    });
    const result = previewViewFields(f, "en", "en");
    expect(result?.values.field_a).toBe("a");
    expect(result?.fields[0]!.options).toHaveLength(2);
  });

  it("synthesizes an empty option list for a dataSource-backed choice", () => {
    const f = field({ type: "string", dataSource: "dataSource_1" });
    const result = previewViewFields(f, "en", "en");
    expect(result?.fields[0]!.options).toBeUndefined();
    // No options resolve in the draft, so the sample falls back to the type's.
    expect(result?.values.field_a).toBe("Sample text");
  });

  it("returns the group's own entry plus one per child, for a group of two", () => {
    const f = field({
      type: "group",
      fields: [
        { id: "field_b", key: "b", label: { en: "B" }, type: "string" },
        { id: "field_c", key: "c", label: { en: "C" }, type: "number" },
      ],
    });
    const result = previewViewFields(f, "en", "en");
    expect(result?.fields).toHaveLength(3);
    expect(result?.fields[0]!.group).toBeUndefined();
    expect(result?.fields[1]!.group).toBe("a");
    expect(result?.fields[2]!.group).toBe("a");
  });

  it("reaches every depth of a group holding a group holding a leaf", () => {
    const f = field({
      type: "group",
      fields: [
        {
          id: "field_b",
          key: "b",
          label: { en: "B" },
          type: "group",
          fields: [{ id: "field_c", key: "c", label: { en: "C" }, type: "string" }],
        },
      ],
    });
    const result = previewViewFields(f, "en", "en");
    expect(result?.fields).toHaveLength(3);
    const byId = new Map(result!.fields.map((r) => [r.field.id, r]));
    expect(byId.get("field_a")!.group).toBeUndefined();
    expect(byId.get("field_b")!.group).toBe("a");
    expect(byId.get("field_c")!.group).toBe("b");
  });

  it("falls back to the field's own id as the group key when key is still empty", () => {
    const f = field({
      key: "",
      label: { en: "" },
      type: "group",
      fields: [{ id: "field_b", key: "b", label: { en: "B" }, type: "string" }],
    });
    const result = previewViewFields(f, "en", "en");
    // Exactly one entry per field — never twice (once nested, once beside
    // the group), which an empty `group: ""` would produce.
    expect(result?.fields).toHaveLength(2);
    const child = result!.fields.find((r) => r.field.id === "field_b")!;
    expect(child.group).toBe("field_a");
    expect(result!.fields.filter((r) => r.field.id === "field_b")).toHaveLength(1);
  });

  it("falls back to string/empty label for a field carrying no key, no label and no explicit type", () => {
    const result = previewViewFields(field({ key: undefined, label: undefined, type: undefined }), "en", "en");
    expect(result?.fields[0]!.field.type).toBe("string");
    expect(result?.fields[0]!.field.key).toBe("field_a");
    expect(result?.fields[0]!.field.label).toEqual({ en: "" });
  });

  it("keys values by every synthesized field id, group entries included", () => {
    const f = field({
      type: "group",
      fields: [{ id: "field_b", key: "b", label: { en: "B" }, type: "string" }],
    });
    const result = previewViewFields(f, "en", "en")!;
    expect(Object.keys(result.values).sort()).toEqual(["field_a", "field_b"]);
  });

  it("resolves a label through the content locale, falling back to the base locale", () => {
    const f = field({ label: { en: "Base only" } });
    const result = previewViewFields(f, "de", "en")!;
    expect(result.fields[0]!.field.label).toEqual({ de: "Base only" });
  });
});

describe("previewViewEntries carries tab and the draft's tabs", () => {
  const catalog: DraftField[] = [field({})];

  it("carries tab onto a resolved field entry", () => {
    const view: DraftView = { fields: [entry({ ref: "field_a", tab: "t1" })] };
    const result = previewViewEntries(view, catalog, "en", "en");
    expect(result.entries[0]!.tab).toBe("t1");
  });

  it("carries tab onto a resolved note entry", () => {
    const view: DraftView = { fields: [entry({ kind: "note", text: { en: "hi" }, tab: "t1" })] };
    const result = previewViewEntries(view, [], "en", "en");
    expect(result.entries[0]!.tab).toBe("t1");
  });

  it("leaves tab undefined for an entry naming none", () => {
    const view: DraftView = { fields: [entry({ ref: "field_a" })] };
    const result = previewViewEntries(view, catalog, "en", "en");
    expect(result.entries[0]!.tab).toBeUndefined();
  });

  it("resolves the draft's tabs for the content locale, falling back to the base locale", () => {
    const view: DraftView = {
      tabs: [
        { key: "t1", label: { en: "Details" } },
        { key: "t2", label: { de: "Andere" } },
      ],
    };
    const result = previewViewEntries(view, [], "de", "en");
    expect(result.tabs).toEqual([
      { key: "t1", label: { de: "Details" } },
      { key: "t2", label: { de: "Andere" } },
    ]);
  });

  it("drops a tab with no key yet: nothing can name it", () => {
    const view: DraftView = { tabs: [{ label: { en: "Mid-mint" } }] };
    const result = previewViewEntries(view, [], "en", "en");
    expect(result.tabs).toEqual([]);
  });

  it("returns an empty tabs array for an untabbed view", () => {
    const result = previewViewEntries(undefined, [], "en", "en");
    expect(result.tabs).toEqual([]);
  });
});
