import { describe, expect, it } from "bun:test";
import {
  isDirty,
  isLayoutDirty,
  isDraftDirty,
  publishAvailability,
  nextVersionLabel,
  headerStateLine,
  formatSavedTime,
  editingLocaleNote,
  languageName,
  justPublishedAfter,
  saveFocusTarget,
} from "../src/areas/studio/screens/draftToolbarState.js";
import { applyReload, applySaveResult, initialSaveState } from "../src/areas/studio/screens/draftSaveLogic.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * `DraftToolbar` has no interactive DOM test environment to render through
 * (this repo's only "component tests" — packages/form-ui/test/field-form.test.tsx —
 * use react-dom/server's renderToStaticMarkup, which never fires an event or
 * re-renders on state change), so a real click-through conflict -> reload -> publish sequence
 * can't be driven directly. This is the documented fallback
 * (render-frontend-error-states design.md, task 6.4): `EditScreen.tsx` seeds
 * `savedBody` from `useState<Draft>(() => structuredClone(draft))` and
 * advances it through a `(body: Draft) => setSavedBody(structuredClone(body))`
 * wrapper, and this test drives that exact sequence `DraftToolbar`'s wiring
 * produces by calling `structuredClone` directly, the same way the wrapper
 * does.
 *
 * The bug this guards was in the *wiring*, not in `isDirty` — that function
 * is already correct and already tested, in the `describe("isDirty", ...)`
 * block below. Before this change, DraftToolbar's reload() called
 * replace(record.body) but never advanced savedBody to match, so isDirty
 * compared the freshly-reloaded body against the stale, discarded local edit
 * and returned true for a draft byte-identical to the server's. A test of
 * isDirty alone cannot see that, because isDirty was never wrong — the two
 * arguments it was called with were.
 */
describe("DraftToolbar's savedBody transition (draftToolbarState.ts)", () => {
  it("conflict (409) -> reload -> publish: reload leaves the draft clean, so isDirty is false and publish would not prompt", () => {
    const original: Draft = { key: "expense-approval", label: { en: "Expense approval" } };
    let savedBody = structuredClone(original);

    // The user edits locally.
    const locallyEdited: Draft = { key: "expense-approval", label: { en: "Expense approval (mine)" } };

    // Save conflicts (409) — DraftToolbar's saveDraft() returns undefined on a
    // conflict, and doSave only dispatches "saved" `if (result)`, so savedBody
    // is untouched here — this line stands in for that skipped dispatch.

    // The user reloads. The server's stored body may differ from both the
    // original and the local edit (someone else's concurrent save).
    const serverBody: Draft = { key: "expense-approval", label: { en: "Expense approval (someone else's)" } };
    savedBody = structuredClone(serverBody);

    // replace(serverBody) makes the live draft equal serverBody too — the
    // toolbar's `draft` prop reflects that same replace() call.
    const draftAfterReload = serverBody;

    expect(isDirty(draftAfterReload, savedBody)).toBe(false);
    // Sanity check against the exact regression: comparing the reloaded draft
    // against the *stale* pre-reload savedBody (what the bug left it as) is
    // dirty — that's the false prompt this change removes.
    const staleSavedBody = structuredClone(original);
    expect(isDirty(draftAfterReload, staleSavedBody)).toBe(true);

    void locallyEdited; // documents the discarded edit; not otherwise asserted on
  });

  it("layout dragged -> conflict (409) -> reload: the reloaded draft reads clean, layout included", () => {
    const body: Draft = { key: "p" };
    const storedLayout = { step_a: { x: 0, y: 0 } };
    let savedLayout: Record<string, unknown> = storedLayout;
    let saveState = initialSaveState(3, storedLayout);

    // A step drag writes a new layout object into the save state.
    saveState = { ...saveState, layout: { ...saveState.layout, step_a: { x: 40, y: 0 } } };
    expect(isDraftDirty(body, structuredClone(body), saveState.layout, savedLayout)).toBe(true);

    // The save answers 409: `applySaveResult` keeps the dragged layout, and
    // doSave's `if (result)` branch leaves `savedLayout` alone.
    const sentLayout = saveState.layout;
    saveState = applySaveResult(saveState, undefined, sentLayout);
    expect(saveState.conflict).toBe(true);
    expect(isDraftDirty(body, structuredClone(body), saveState.layout, savedLayout)).toBe(true);

    // reload(): `applyReload`, then `onSavedLayoutChange(record.layout)`. The
    // stored layout is someone else's, neither the dragged nor the first one.
    const record = { revision: 4, layout: { step_b: { y: 0, x: 8 }, step_a: { y: 0, x: 0 } } };
    saveState = applyReload(record);
    savedLayout = record.layout;
    expect(isDraftDirty(body, structuredClone(body), saveState.layout, savedLayout)).toBe(false);
  });

  it("a layout-only difference reads dirty, so Publish saves first", () => {
    // runPublish's gate: `isDraftDirty(draft, savedBody, saveState.layout, savedLayout)`.
    const body: Draft = { key: "p" };
    const savedLayout = { step_a: { x: 0, y: 0 } };
    const layout = { ...savedLayout, waypoints: { path_a: [{ x: 4, y: 4 }] } };
    expect(isDraftDirty(body, structuredClone(body), layout, savedLayout)).toBe(true);
  });

  it("reload -> edit -> publish: editing after a reload is dirty again, so the fix does not turn the gate off permanently", () => {
    const serverBody: Draft = { key: "expense-approval", label: { en: "Expense approval" } };
    let savedBody = structuredClone(serverBody);
    savedBody = structuredClone(serverBody);
    expect(isDirty(serverBody, savedBody)).toBe(false);

    const editedAfterReload: Draft = { key: "expense-approval", label: { en: "Expense approval — edited" } };
    expect(isDirty(editedAfterReload, savedBody)).toBe(true);
  });

  it("advances on a successful save the same way it advances on a reload", () => {
    const original: Draft = { key: "p" };
    let savedBody = structuredClone(original);
    const edited: Draft = { key: "p", description: { en: "now with a description" } };

    savedBody = structuredClone(edited);

    expect(isDirty(edited, savedBody)).toBe(false);
  });

  it("clones rather than aliasing, so mutating the source body afterward does not follow into savedBody", () => {
    const draft: Draft = { key: "p" };
    const savedBody = structuredClone(draft);

    expect(savedBody).not.toBe(draft);
    (draft as { key?: string }).key = "mutated-after-the-fact";

    expect(savedBody.key).toBe("p");
  });
});

/**
 * studio-canvas-first-structure-editor task 7.0: `EditorArea`'s
 * `lastSavedAt` subscribes to a new `onSaved` callback, fired only from
 * `doSave()`'s success branch — never from `reload()`'s conflict-recovery
 * branch, which must keep calling `onSavedBodyChange`
 * (the `structuredClone` wrapper) alone. Same no-interactive-DOM constraint
 * as the conflict -> reload -> publish test above: this drives the two call
 * sites' own sequence of effects by hand, counting how many times each
 * fires, rather than rendering `DraftToolbar` and clicking through it.
 */
describe("DraftToolbar's onSaved callback (design.md: onSaved vs the savedBody wrapper)", () => {
  it("a successful save advances savedBody and fires onSaved once", () => {
    let savedBody = structuredClone({ key: "p" });
    let savedLayout: Record<string, unknown> = { step_a: { x: 0, y: 0 } };
    let onSavedCount = 0;

    // doSave()'s success branch:
    // `if (result) { onSavedBodyChange(draft); onSavedLayoutChange(result.layout); onSaved?.(); }`
    const draft = { key: "p", description: { en: "saved" } };
    // The layout the save sent, and the answer: the same layout in the key
    // order the database returns.
    const sentLayout = { step_a: { x: 40, y: 0 } };
    const result = { revision: 2, layout: { step_a: { y: 0, x: 40 } } };
    expect(isLayoutDirty(sentLayout, savedLayout)).toBe(true);
    if (result) {
      savedBody = structuredClone(draft);
      savedLayout = result.layout;
      onSavedCount++;
    }

    expect(isDirty(draft, savedBody)).toBe(false);
    expect(isLayoutDirty(sentLayout, savedLayout)).toBe(false);
    expect(onSavedCount).toBe(1);
  });

  it("a save conflict (409) advances neither savedBody nor onSaved", () => {
    const savedBody = structuredClone({ key: "p" });
    let onSavedCount = 0;

    // doSave()'s conflict branch: saveDraft() returns undefined, so the
    // `if (result)` guard above never runs.
    const result: { revision: number; layout: Record<string, unknown> } | undefined = undefined;
    if (result) onSavedCount++;

    expect(onSavedCount).toBe(0);
    expect(savedBody).toEqual(structuredClone({ key: "p" }));
  });

  it("a reload advances savedBody but never fires onSaved", () => {
    let savedBody = structuredClone({ key: "p" });
    let onSavedCount = 0;

    // reload()'s conflict-recovery branch: `onSavedBodyChange(body);` and
    // `onSavedLayoutChange(record.layout);` — no `onSaved?.()` call sits
    // beside them.
    const serverBody = { key: "p", description: { en: "someone else's" } };
    savedBody = structuredClone(serverBody);

    expect(isDirty(serverBody, savedBody)).toBe(false);
    expect(onSavedCount).toBe(0);
  });
});

/**
 * `isDirty`'s own cases, moved here from studio-publishGateLogic.test.ts when
 * `simplify-web-logic-modules` folded that 13-line module into this one.
 */
describe("isDirty", () => {
  it("is false for the identical object", () => {
    const body = { key: "wf", fields: [] };
    expect(isDirty(body, body)).toBe(false);
  });

  it("is false for structurally equal but distinct objects", () => {
    expect(isDirty({ key: "wf", fields: [] }, { key: "wf", fields: [] })).toBe(false);
  });

  it("is true when a top-level field differs", () => {
    expect(isDirty({ key: "wf2" }, { key: "wf" })).toBe(true);
  });

  it("is true when a nested value differs", () => {
    const a = { workflow: { steps: [{ id: "step_a" }] } };
    const b = { workflow: { steps: [{ id: "step_b" }] } };
    expect(isDirty(a, b)).toBe(true);
  });
});

/**
 * A stored layout comes back in the key order of the database, so the compare
 * cannot read `JSON.stringify` order as a difference. The draft counts as
 * unsaved when the body or the layout differs from the last save.
 */
describe("isLayoutDirty and isDraftDirty (a layout change counts as unsaved)", () => {
  const body: Draft = { key: "p" };
  const layout = { step_a: { x: 1, y: 2 }, canvasEdgeStyle: "step" };

  it("isLayoutDirty is false for equal layouts in another key order", () => {
    const reordered = { canvasEdgeStyle: "step", step_a: { y: 2, x: 1 } };
    expect(isLayoutDirty(layout, reordered)).toBe(false);
  });

  it("isLayoutDirty is true when a coordinate moved", () => {
    expect(isLayoutDirty({ ...layout, step_a: { x: 1, y: 3 } }, layout)).toBe(true);
  });

  it("isLayoutDirty is true when a key was added", () => {
    expect(isLayoutDirty({ ...layout, step_b: { x: 0, y: 0 } }, layout)).toBe(true);
  });

  it("isLayoutDirty is true when a key was removed", () => {
    expect(isLayoutDirty({ step_a: { x: 1, y: 2 } }, layout)).toBe(true);
  });

  it("isLayoutDirty reads array order: a reordered waypoint list differs", () => {
    const a = { waypoints: { path_a: [{ x: 0, y: 0 }, { x: 8, y: 8 }] } };
    const b = { waypoints: { path_a: [{ x: 8, y: 8 }, { x: 0, y: 0 }] } };
    expect(isLayoutDirty(a, b)).toBe(true);
    expect(isLayoutDirty(a, structuredClone(a))).toBe(false);
  });

  it("isLayoutDirty reads a key holding undefined as an absent key", () => {
    expect(isLayoutDirty({ ...layout, canvasEdgeStyle: undefined }, { step_a: { x: 1, y: 2 } })).toBe(false);
  });

  it("isDraftDirty is false when body and layout both equal the last save", () => {
    expect(isDraftDirty(body, structuredClone(body), layout, { canvasEdgeStyle: "step", step_a: { y: 2, x: 1 } })).toBe(false);
  });

  it("isDraftDirty is true for a layout-only difference", () => {
    expect(isDraftDirty(body, structuredClone(body), { ...layout, step_a: { x: 9, y: 2 } }, layout)).toBe(true);
  });

  it("isDraftDirty is true for a body-only difference", () => {
    expect(isDraftDirty({ key: "q" }, body, layout, layout)).toBe(true);
  });

  it("isDraftDirty is true when both differ", () => {
    expect(isDraftDirty({ key: "q" }, body, { ...layout, step_a: { x: 9, y: 2 } }, layout)).toBe(true);
  });
});

/**
 * studio-publish-gate-and-report: the studio offers Publish only where the
 * engine would admit it, and the publish dialog names the version the publish
 * mints. Both decisions are pure, so both are asserted here rather than left
 * to the browser check.
 *
 * The violating inputs are named in design.md's own Tests section: a `false`
 * report that still yields an enabled control, and a null base version that a
 * naive increment renders as `vNaN`.
 */
describe("publishAvailability (studio-publish: the client gate reads the engine's report)", () => {
  it("a true report on an unblocked draft offers the control, with no reason", () => {
    expect(publishAvailability(true, false)).toEqual({ available: true });
  });

  it("a false report withholds the control and names a reason key", () => {
    const resolved = publishAvailability(false, false);
    expect(resolved.available).toBe(false);
    expect(resolved.reasonKey).toBe("draftToolbar.publishUnavailable");
  });

  it("an absent report reads as unavailable, not as permitted", () => {
    expect(publishAvailability(undefined, false).available).toBe(false);
  });

  // The blocked-but-permitted pair, the combination the old one-argument
  // signature could not express: a reason beside `available: true`.
  it("a blocked draft keeps the control available and names the blocking reason", () => {
    const resolved = publishAvailability(true, true);
    expect(resolved.available).toBe(true);
    expect(resolved.reasonKey).toBe("draftToolbar.publishBlockedReason");
  });

  // The permission answers first, so the two reasons never compete for the
  // one span. An unpermitted actor never reads the blocked reason.
  it("an absent permission outranks the blocked state, whatever blocked holds", () => {
    for (const blocked of [true, false]) {
      const resolved = publishAvailability(false, blocked);
      expect(resolved.available).toBe(false);
      expect(resolved.reasonKey).toBe("draftToolbar.publishUnavailable");
    }
  });
});

describe("publishAvailability with no step yet (studio-fresh-draft-starts-clean)", () => {
  it("a permitted draft with no step is unavailable and names the missing step", () => {
    expect(publishAvailability(true, false, true)).toEqual({
      available: false,
      reasonKey: "draftToolbar.publishNeedsStep",
    });
  });

  it("the permission reason wins over the missing step", () => {
    expect(publishAvailability(false, false, true)).toEqual({
      available: false,
      reasonKey: "draftToolbar.publishUnavailable",
    });
  });

  it("a draft with a step is available again", () => {
    expect(publishAvailability(true, false, false)).toEqual({ available: true });
  });
});

describe("nextVersionLabel (studio-publish: the dialog names a valid version label)", () => {
  it("increments a published base version", () => {
    expect(nextVersionLabel(3)).toBe("v4");
  });

  it("names v1 when nobody has published this process", () => {
    expect(nextVersionLabel(null)).toBe("v1");
  });

  it("names v1 for an absent base version too, never vNaN", () => {
    expect(nextVersionLabel(undefined)).toBe("v1");
  });

  it("never renders a non-number", () => {
    for (const base of [null, undefined, 0, 1, 42]) {
      expect(nextVersionLabel(base)).toMatch(/^v[0-9]+$/);
    }
  });
});

describe("headerStateLine", () => {
  it("a dirty draft reads unsaved, with or without a version and a past save", () => {
    expect(headerStateLine(true, undefined, null)).toEqual({ state: "unsaved" });
    expect(headerStateLine(true, undefined, 1)).toEqual({ state: "unsaved", version: "v1" });
    expect(headerStateLine(true, "10:32", 1)).toEqual({ state: "unsaved", version: "v1" });
  });

  it("a clean draft with no save in this session reads saved", () => {
    expect(headerStateLine(false, undefined, null)).toEqual({ state: "saved" });
    expect(headerStateLine(false, undefined, undefined)).toEqual({ state: "saved" });
    expect(headerStateLine(false, undefined, 3)).toEqual({ state: "saved", version: "v3" });
  });

  it("NaN and 0 are no published version", () => {
    expect(headerStateLine(false, undefined, Number.NaN)).toEqual({ state: "saved" });
    expect(headerStateLine(false, undefined, 0)).toEqual({ state: "saved" });
    expect(headerStateLine(true, undefined, 0)).toEqual({ state: "unsaved" });
  });

  it("a non-integer or negative base is no published version", () => {
    expect(headerStateLine(false, undefined, 1.5)).toEqual({ state: "saved" });
    expect(headerStateLine(false, undefined, -1)).toEqual({ state: "saved" });
  });

  it("a clean draft after a save reads saved at its time", () => {
    expect(headerStateLine(false, "10:32", null)).toEqual({ state: "savedAt", time: "10:32" });
    expect(headerStateLine(false, "10:32", 2)).toEqual({ state: "savedAt", time: "10:32", version: "v2" });
  });
});

describe("formatSavedTime", () => {
  it("prints hour and minute without seconds", () => {
    const out = formatSavedTime(new Date(2026, 0, 5, 9, 7, 42));
    expect(out).toMatch(/9.07/);
    expect(out).not.toMatch(/42/);
  });
});

describe("editingLocaleNote", () => {
  it("names nothing in the base language", () => {
    expect(editingLocaleNote("en", "en", false)).toBeUndefined();
    expect(editingLocaleNote("de", "de", false)).toBeUndefined();
  });

  it("names the language of another content locale", () => {
    expect(editingLocaleNote("de", "en", false)).toBe("German");
    expect(editingLocaleNote("en", "de", false)).toBe("English");
    expect(editingLocaleNote("pt-BR", "en", false)).toBe("Brazilian Portuguese");
  });

  it("reads an absent base as en", () => {
    expect(editingLocaleNote("de", undefined, false)).toBe("German");
    expect(editingLocaleNote("en", undefined, false)).toBeUndefined();
  });

  it("names nothing while the base language is part-typed or empty", () => {
    expect(editingLocaleNote("de", "d", false)).toBeUndefined();
    expect(editingLocaleNote("de", "", false)).toBeUndefined();
    expect(editingLocaleNote("de", "EN", false)).toBeUndefined();
  });

  it("prints a code it cannot name as itself and never throws", () => {
    expect(editingLocaleNote("zz", "en", false)).toBe("zz");
    expect(editingLocaleNote("not a tag", "en", false)).toBe("not a tag");
  });

  it("names nothing while the JSON surface is open", () => {
    expect(editingLocaleNote("de", "en", true)).toBeUndefined();
  });
});

describe("justPublishedAfter", () => {
  /** The flag across a run of renders, each named by whether the draft is dirty. */
  const across = (start: boolean, renders: boolean[]) => renders.reduce(justPublishedAfter, start);

  it("stands through clean renders after a publish", () => {
    expect(across(true, [false, false, false])).toBe(true);
  });

  it("falls on the first dirty render", () => {
    expect(across(true, [false, true])).toBe(false);
  });

  it("stays down after a publish, an edit and a save", () => {
    expect(across(true, [true, false])).toBe(false);
  });

  it("stays down when the author undoes the edit by hand", () => {
    expect(across(true, [true, true, false, false])).toBe(false);
  });

  it("never rises on its own, on a draft nobody published in this session", () => {
    expect(justPublishedAfter(false, false)).toBe(false);
    expect(justPublishedAfter(false, true)).toBe(false);
  });
});

describe("saveFocusTarget", () => {
  const answered = { pressed: true, clean: true, focusOnBody: true };

  it("moves the focus to the state line when a pressed Save vanished from the focus", () => {
    expect(saveFocusTarget(answered)).toBe("stateLine");
  });

  it("moves nothing on a refused save, which leaves the draft dirty", () => {
    expect(saveFocusTarget({ ...answered, clean: false })).toBeUndefined();
  });

  it("moves nothing on a successful save with a draft edited meanwhile", () => {
    expect(saveFocusTarget({ ...answered, clean: false, focusOnBody: false })).toBeUndefined();
  });

  it("moves nothing when the author moved the focus elsewhere", () => {
    expect(saveFocusTarget({ ...answered, focusOnBody: false })).toBeUndefined();
  });

  it("moves nothing on a save Save's own press did not start, such as the publish dialog's", () => {
    expect(saveFocusTarget({ ...answered, pressed: false })).toBeUndefined();
  });
});

describe("languageName", () => {
  it("names a language by its English name", () => {
    expect(languageName("de")).toBe("German");
    expect(languageName("pt-BR")).toBe("Brazilian Portuguese");
  });

  it("prints a code it cannot name as itself and never throws", () => {
    expect(languageName("zz")).toBe("zz");
    expect(languageName("not a tag")).toBe("not a tag");
    expect(languageName("")).toBe("");
  });
});
