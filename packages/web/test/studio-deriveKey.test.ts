import { describe, expect, it } from "bun:test";
import { deriveKey, dedupeKey, shouldAutoDeriveKey, transliterate } from "../src/areas/studio/draft/deriveKey.js";
import { resolveDraftLocalizedText } from "../src/areas/studio/draft/localized-text.js";

describe("deriveKey", () => {
  it("returns empty for an empty label", () => {
    expect(deriveKey("")).toBe("");
  });

  it("returns empty for a punctuation-only label", () => {
    expect(deriveKey("!!!")).toBe("");
  });

  it("prefixes a leading digit with an underscore", () => {
    expect(deriveKey("2nd review")).toBe("_2nd_review");
  });

  it("leaves an already-collapsed identifier unchanged", () => {
    expect(deriveKey("already_collapsed")).toBe("already_collapsed");
  });

  it("lower-cases and collapses runs of non-alphanumeric characters", () => {
    expect(deriveKey("Requested Amount")).toBe("requested_amount");
    expect(deriveKey("Manager  Review!!")).toBe("manager_review");
  });

  it("spells out umlauts, ß and ligatures instead of splitting the word", () => {
    expect(deriveKey("Prüfung")).toBe("pruefung");
    expect(deriveKey("Prüfung der Änderung")).toBe("pruefung_der_aenderung");
    expect(deriveKey("Größe")).toBe("groesse");
    expect(deriveKey("Ærø")).toBe("aero");
  });

  it("drops the combining mark of any other accented letter", () => {
    expect(deriveKey("Café Straße")).toBe("cafe_strasse");
  });

  it("reads a letter typed with a combining mark as the letter it composes", () => {
    expect(deriveKey("a\u0308")).toBe("ae");
    expect(deriveKey("Pru\u0308fung")).toBe("pruefung");
  });
});

describe("transliterate", () => {
  it("maps the German letters and the Nordic ligatures before decomposing", () => {
    expect(transliterate("ÄÖÜß æœøł")).toBe("aeoeuess aeoeol");
  });

  it("drops combining marks from every other letter", () => {
    expect(transliterate("Éñ")).toBe("en");
  });
});

describe("dedupeKey", () => {
  it("returns the base unchanged when it is not taken", () => {
    expect(dedupeKey("expense", new Set())).toBe("expense");
  });

  it("appends _2 when the base is taken", () => {
    expect(dedupeKey("expense", new Set(["expense"]))).toBe("expense_2");
  });

  it("walks the suffix chain until a free key is found", () => {
    expect(dedupeKey("expense", new Set(["expense", "expense_2"]))).toBe("expense_3");
  });
});

describe("shouldAutoDeriveKey", () => {
  it("is true for an empty current key", () => {
    expect(shouldAutoDeriveKey("", "manager_review")).toBe(true);
  });

  it("is true when the current key still equals the prior derivation", () => {
    expect(shouldAutoDeriveKey("manager_review", "manager_review")).toBe(true);
  });

  it("is false once the current key has diverged from the prior derivation", () => {
    expect(shouldAutoDeriveKey("mgr_review", "manager_review")).toBe(false);
  });
});

describe("base-locale-only resolution for derivation (resolveDraftLocalizedText(label, baseLocale, baseLocale))", () => {
  it("derives the same key regardless of which locale is 'current'", () => {
    const label = { en: "Manager Review", de: "Managerprüfung" };
    const baseLocale = "en";

    // Passing baseLocale for BOTH parameters collapses the fallback to a
    // single read: the base-locale entry, never whichever locale a caller's
    // own "current content locale" happens to be.
    const resolvedAsIfDe = resolveDraftLocalizedText(label, baseLocale, baseLocale);
    const resolvedAsIfEn = resolveDraftLocalizedText(label, baseLocale, baseLocale);

    expect(resolvedAsIfDe).toBe("Manager Review");
    expect(resolvedAsIfDe).toBe(resolvedAsIfEn);
    expect(deriveKey(resolvedAsIfDe!)).toBe("manager_review");
  });
});
