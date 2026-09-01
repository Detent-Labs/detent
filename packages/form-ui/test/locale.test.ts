import { describe, expect, it } from "bun:test";
import { resolveText, resolveFieldsLocale } from "../src/locale.js";
import { isResolvedViewField, type ResolvedViewField } from "../src/types.js";

describe("resolveText", () => {
  it("resolves the active locale's own entry", () => {
    expect(resolveText({ en: "English", de: "Deutsch" }, "de", "en")).toBe("Deutsch");
  });

  it("falls back to baseLocale when the active locale has no entry", () => {
    expect(resolveText({ en: "English" }, "de", "en")).toBe("English");
  });

  it("returns an empty string for an undefined value", () => {
    expect(resolveText(undefined, "en", "en")).toBe("");
  });
});

const field = (overrides: Partial<ResolvedViewField> = {}): ResolvedViewField => ({
  field: { id: "field_x", key: "x", label: { en: "X" }, type: "string" },
  value: undefined,
  required: false,
  readonly: false,
  ...overrides,
});

describe("resolveFieldsLocale", () => {
  it("falls back to baseLocale when a field's label has no entry for the active locale", () => {
    const [resolved] = resolveFieldsLocale([field({ field: { id: "field_x", key: "x", label: { en: "English" }, type: "string" } })], "fr", "en");
    expect(isResolvedViewField(resolved!)).toBe(true);
    expect((resolved as ResolvedViewField).field.label).toEqual({ fr: "English" });
  });

  it("falls back the same way for an option label", () => {
    const [resolved] = resolveFieldsLocale(
      [field({ options: [{ value: "a", label: { en: "Option A" } }] })],
      "fr",
      "en",
    );
    expect((resolved as ResolvedViewField).options![0]!.label).toEqual({ fr: "Option A" });
  });

  it("keeps a label already resolved in the active locale", () => {
    const [resolved] = resolveFieldsLocale([field({ field: { id: "field_x", key: "x", label: { en: "English", fr: "Français" }, type: "string" } })], "fr", "en");
    expect((resolved as ResolvedViewField).field.label).toEqual({ fr: "Français" });
  });

  it("does not mutate its input", () => {
    const original = field();
    const originalLabel = original.field.label;
    resolveFieldsLocale([original], "fr", "en");
    expect(original.field.label).toBe(originalLabel);
  });

  it("resolves a note's text to the active locale, falling back to the base locale", () => {
    const [resolved] = resolveFieldsLocale([{ kind: "note", text: { en: "English note" } }], "fr", "en");
    expect(isResolvedViewField(resolved!)).toBe(false);
    expect(resolved).toEqual({ kind: "note", text: { fr: "English note" } });
  });
});
