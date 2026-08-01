import { describe, expect, it } from "bun:test";
import { resolveAddLocaleAttempt } from "../src/areas/studio/draft/localized-text.js";

/**
 * The gate two call sites share: the content-locale switcher's "add a locale"
 * button, and the process header's baseLocale control, which moves the edited
 * content locale only for a value that parses. `packages/web` has no
 * interactive DOM test environment (static rendering fires no event), so this
 * pure function is where that branch is testable at all.
 */
describe("resolveAddLocaleAttempt", () => {
  it("accepts a well-formed locale code", () => {
    expect(resolveAddLocaleAttempt("de")).toEqual({ ok: true, locale: "de" });
  });

  it("accepts a region-qualified locale code", () => {
    expect(resolveAddLocaleAttempt("de-AT")).toEqual({ ok: true, locale: "de-AT" });
  });

  // The state the baseLocale input passes through on the way to "de". Moving
  // the content locale here would write a `label.d` entry on the next
  // keystroke in any text field, and `collectUsedLocales` would then offer
  // "d" in the switcher for good.
  it("rejects a part-typed code", () => {
    expect(resolveAddLocaleAttempt("d")).toEqual({ ok: false });
  });

  it("rejects an empty value", () => {
    expect(resolveAddLocaleAttempt("")).toEqual({ ok: false });
  });

  it("rejects a malformed region suffix", () => {
    expect(resolveAddLocaleAttempt("de-at")).toEqual({ ok: false });
  });
});
