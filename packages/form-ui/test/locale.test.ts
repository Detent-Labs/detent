import { describe, expect, it } from "bun:test";
import { resolveText } from "../src/locale.js";

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
