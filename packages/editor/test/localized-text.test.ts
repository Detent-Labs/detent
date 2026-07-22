import { describe, expect, it } from "bun:test";
import {
  resolveDraftLocalizedText,
  mergeLocalizedTextEntry,
  collectUsedLocales,
  seedLocalizedText,
  resolveAddLocaleAttempt,
} from "../src/draft/localized-text";
import type { Draft } from "../src/draft/types";

describe("resolveDraftLocalizedText", () => {
  it("returns the requested locale's entry when present", () => {
    expect(resolveDraftLocalizedText({ en: "Review", de: "Prüfen" }, "de", "en")).toBe("Prüfen");
  });

  it("falls back to the base locale when the requested locale has no entry", () => {
    expect(resolveDraftLocalizedText({ en: "Review" }, "de", "en")).toBe("Review");
  });

  it("returns undefined when neither the requested nor the base locale has an entry", () => {
    expect(resolveDraftLocalizedText({ fr: "Revue" }, "de", "en")).toBeUndefined();
  });

  it("returns undefined for an undefined value (a Draft field not yet touched)", () => {
    expect(resolveDraftLocalizedText(undefined, "de", "en")).toBeUndefined();
  });
});

describe("mergeLocalizedTextEntry", () => {
  it("writes only the given locale's entry, leaving other locales untouched", () => {
    expect(mergeLocalizedTextEntry({ en: "Review", de: "Prüfen" }, "de", "Geprüft")).toEqual({
      en: "Review",
      de: "Geprüft",
    });
  });

  it("adds a new locale entry to an existing value", () => {
    expect(mergeLocalizedTextEntry({ en: "Review" }, "fr", "Revue")).toEqual({ en: "Review", fr: "Revue" });
  });

  it("starts a fresh object from undefined", () => {
    expect(mergeLocalizedTextEntry(undefined, "en", "Review")).toEqual({ en: "Review" });
  });
});

describe("resolveAddLocaleAttempt", () => {
  it("accepts a well-formed locale code", () => {
    expect(resolveAddLocaleAttempt("de")).toEqual({ ok: true, locale: "de" });
    expect(resolveAddLocaleAttempt("en-US")).toEqual({ ok: true, locale: "en-US" });
  });

  it("rejects a malformed locale code", () => {
    expect(resolveAddLocaleAttempt("")).toEqual({ ok: false });
    expect(resolveAddLocaleAttempt("English")).toEqual({ ok: false });
    expect(resolveAddLocaleAttempt("EN")).toEqual({ ok: false });
    expect(resolveAddLocaleAttempt("en_US")).toEqual({ ok: false });
  });
});

describe("seedLocalizedText", () => {
  it("seeds an empty entry under the given content locale", () => {
    expect(seedLocalizedText("de")).toEqual({ de: "" });
  });
});

describe("collectUsedLocales", () => {
  it("returns the Draft's baseLocale (or en) alone for a fresh draft", () => {
    expect(collectUsedLocales({})).toEqual(["en"]);
    expect(collectUsedLocales({ baseLocale: "de" })).toEqual(["de"]);
  });

  it("collects every locale used across process, steps, fields, and options, including nested group fields", () => {
    const draft: Draft = {
      baseLocale: "en",
      label: { en: "Process", de: "Prozess" },
      fields: [
        {
          id: "field_g" as never,
          key: "grp",
          label: { en: "Group" },
          type: "group",
          fields: [{ id: "field_n" as never, key: "nested", label: { en: "Nested", fr: "Imbriqué" }, type: "string" }],
        },
        {
          id: "field_s" as never,
          key: "sel",
          label: { en: "Select" },
          type: "select",
          options: [{ value: "a", label: { en: "A", es: "A-es" } }],
        },
      ],
      workflow: {
        initialStep: "step_a" as never,
        steps: [{ id: "step_a" as never, key: "a", label: { en: "Start", it: "Inizio" }, type: "task", terminal: true }],
      },
    };

    expect(collectUsedLocales(draft)).toEqual(["de", "en", "es", "fr", "it"]);
  });
});
