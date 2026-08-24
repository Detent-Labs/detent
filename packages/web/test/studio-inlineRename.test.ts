import { describe, expect, it } from "bun:test";
import { inlineRenamePatch } from "../src/areas/studio/canvas/inlineRename.js";
import { nextStepKey } from "../src/areas/studio/panels/stepsPanelLogic.js";
import { mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";

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

/**
 * `CanvasView.tsx::commitRename` calls `inlineRenamePatch` then, when it
 * returns a patch, `nextStepKey` — the same sequence exercised here, so a
 * canvas-node rename's key derivation stays provably in agreement with the
 * identity zone's own `nextStepKey` call (`studio-stepsPanelLogic.test.ts`).
 */
function commitCanvasRename(
  currentKey: string,
  currentLabel: Parameters<typeof inlineRenamePatch>[0],
  contentLocale: string,
  baseLocale: string,
  typed: string,
  siblingKeys: ReadonlySet<string> = new Set(),
): { label: typeof currentLabel; key: string } {
  const patch = inlineRenamePatch(currentLabel, contentLocale, typed);
  if (!patch) return { label: currentLabel, key: currentKey };
  const derivedKey = nextStepKey(currentKey, currentLabel, patch, baseLocale, siblingKeys);
  return { label: patch, key: derivedKey === undefined ? currentKey : derivedKey };
}

describe("the canvas node's inline rename derives its key the same way the identity zone does", () => {
  it("a new step's key follows the label typed via inline rename", () => {
    const result = commitCanvasRename("", undefined, "en", "en", "Manager review");

    expect(result.key).toBe("manager_review");
  });

  it("a step whose key was already hand-locked stays locked through a canvas rename", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Manager review");
    const result = commitCanvasRename("mgr", priorLabel, "en", "en", "Manager review v2");

    expect(result.key).toBe("mgr");
  });

  it("a translation typed via the canvas rename into a non-base locale leaves the key unchanged", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Manager review");
    const withKey = commitCanvasRename("", undefined, "en", "en", "Manager review");
    const result = commitCanvasRename(withKey.key, priorLabel, "de", "en", "Managerprüfung");

    expect(result.key).toBe("manager_review");
    expect(result.label).toEqual({ en: "Manager review", de: "Managerprüfung" });
  });
});
