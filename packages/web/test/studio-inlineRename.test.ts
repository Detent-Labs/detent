import { describe, expect, it } from "bun:test";
import { inlineRenamePatch } from "../src/areas/studio/canvas/inlineRename.js";

describe("inlineRenamePatch", () => {
  it("writes the typed text into the content locale's entry", () => {
    expect(inlineRenamePatch({ en: "Old" }, "en", "New")).toEqual({ en: "New" });
  });

  it("leaves other locale entries untouched", () => {
    expect(inlineRenamePatch({ en: "Old", de: "Alt" }, "en", "New")).toEqual({ en: "New", de: "Alt" });
  });

  it("returns undefined when the trimmed text equals the current entry (no-op commit)", () => {
    expect(inlineRenamePatch({ en: "Same" }, "en", "Same")).toBeUndefined();
    expect(inlineRenamePatch({ en: "Same" }, "en", "  Same  ")).toBeUndefined();
  });

  it("returns undefined when a blank commit matches an unset entry", () => {
    expect(inlineRenamePatch(undefined, "en", "   ")).toBeUndefined();
  });

  it("trims the committed text", () => {
    expect(inlineRenamePatch({ en: "Old" }, "en", "  New  ")).toEqual({ en: "New" });
  });

  it("seeds a fresh label when the step had none yet", () => {
    expect(inlineRenamePatch(undefined, "en", "First")).toEqual({ en: "First" });
  });
});
