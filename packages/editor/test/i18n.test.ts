import { describe, expect, it } from "bun:test";
import { resolveInitialLocale, resolveTranslation, type LocaleCode } from "../src/i18n/catalog";
import { describeError } from "../src/panels/FileToolbar";

describe("resolveTranslation", () => {
  it("resolves a key present in the active locale's catalog", () => {
    expect(resolveTranslation("en", "app.title")).toBe("Workflow Editor");
  });

  it("falls back to the base (en) entry when the active locale's catalog is missing the key", () => {
    // This change ships only "en" (design.md "Single-locale scope"), so there is no real non-base
    // catalog yet to be missing a key from. Inject a synthetic one via the `fromCatalogs` param to
    // exercise the fallback branch now rather than leave it uncovered until a second locale exists.
    const withGap = { en: {}, de: {} };
    expect(resolveTranslation("de" as never, "app.title", withGap)).toBe("Workflow Editor");
  });

  it("resolves a present key from a non-base catalog without falling back", () => {
    const withOverride = { en: {}, de: { "app.title": "Workflow-Editor" } };
    expect(resolveTranslation("de" as never, "app.title", withOverride)).toBe("Workflow-Editor");
  });
});

describe("resolveInitialLocale", () => {
  const supported: LocaleCode[] = ["en"];

  it("defaults to en when no locale is stored", () => {
    expect(resolveInitialLocale(null, supported)).toBe("en");
    expect(resolveInitialLocale(undefined, supported)).toBe("en");
  });

  it("defaults to en when the stored value is not a supported locale", () => {
    expect(resolveInitialLocale("de", supported)).toBe("en");
    expect(resolveInitialLocale("not-a-locale", supported)).toBe("en");
  });

  it("returns the stored value when it is a supported locale", () => {
    expect(resolveInitialLocale("en", supported)).toBe("en");
  });
});

describe("describeError", () => {
  it("returns null for an aborted picker (user cancelled, not an error)", () => {
    expect(describeError(new DOMException("aborted", "AbortError"), "operation failed")).toBeNull();
  });

  it("passes a real Error's own message through unchanged, ignoring the fallback", () => {
    // Platform/browser-sourced text is never translated — same treatment as engine validation
    // messages (design.md). The fallback param here is deliberately not what gets returned.
    expect(describeError(new Error("disk is full"), "operation failed")).toBe("disk is full");
  });

  it("returns the translated fallback for a non-Error throw", () => {
    expect(describeError("some string throw", "Vorgang fehlgeschlagen")).toBe("Vorgang fehlgeschlagen");
    expect(describeError(undefined, "Vorgang fehlgeschlagen")).toBe("Vorgang fehlgeschlagen");
  });
});
