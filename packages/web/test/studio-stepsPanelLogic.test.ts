import { describe, expect, it } from "bun:test";
import { nextStepKey, configuredFieldCount } from "../src/areas/studio/panels/stepsPanelLogic.js";
import { mergeLocalizedTextEntry } from "../src/areas/studio/draft/localized-text.js";
import type { DraftViewEntry } from "../src/areas/studio/draft/view-layout.js";

describe("nextStepKey", () => {
  it("derives a new step's key (key '') from its label", () => {
    const label = mergeLocalizedTextEntry(undefined, "en", "Manager review");

    expect(nextStepKey("", undefined, label, "en", new Set())).toBe("manager_review");
  });

  it("dedupes against sibling keys: two steps with the same label get X and X_2", () => {
    const label = mergeLocalizedTextEntry(undefined, "en", "Manager review");

    const first = nextStepKey("", undefined, label, "en", new Set());
    const second = nextStepKey("", undefined, label, "en", new Set([first!]));

    expect(first).toBe("manager_review");
    expect(second).toBe("manager_review_2");
  });

  it("leaves a hand-edited key untouched on a later label edit", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Manager review");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "en", "Manager review v2");

    expect(nextStepKey("mgr", priorLabel, newLabel, "en", new Set())).toBeUndefined();
  });

  it("stays empty while the content locale being typed into differs from the base locale", () => {
    // The base-locale entry never changes here: seedLocalizedText seeds under
    // the current (non-base) content locale, so both prior and new label
    // resolve to an empty base-locale string.
    const priorLabel = mergeLocalizedTextEntry(undefined, "de", "");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "de", "Managerprüfung");

    expect(nextStepKey("", priorLabel, newLabel, "en", new Set())).toBe("");
  });

  it("editing a non-base-locale translation leaves an already-derived key unchanged", () => {
    const priorLabel = mergeLocalizedTextEntry(undefined, "en", "Manager review");
    const newLabel = mergeLocalizedTextEntry(priorLabel, "de", "Managerprüfung");

    // The key already reads as the base-locale derivation; the base-locale
    // text itself did not change, so the lock check sees no change to derive.
    expect(nextStepKey("manager_review", priorLabel, newLabel, "en", new Set())).toBe("manager_review");
  });
});

describe("configuredFieldCount", () => {
  it("counts field entries alone: one field entry beside three notes reports 1", () => {
    const fields: DraftViewEntry[] = [
      { ref: "field_a" } as unknown as DraftViewEntry,
      { kind: "note", text: { en: "One" } },
      { kind: "note", text: { en: "Two" } },
      { kind: "note", text: { en: "Three" } },
    ];
    expect(configuredFieldCount(fields)).toBe(1);
  });

  it("reports 0 for a view holding notes alone", () => {
    const fields: DraftViewEntry[] = [{ kind: "note", text: { en: "One" } }];
    expect(configuredFieldCount(fields)).toBe(0);
  });

  it("reports 0 for an undefined view", () => {
    expect(configuredFieldCount(undefined)).toBe(0);
  });
});
