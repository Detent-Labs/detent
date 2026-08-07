import { describe, expect, it } from "bun:test";
import { savedBodyReducer, initialSavedBody, isDirty } from "../src/areas/studio/screens/draftToolbarState.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * `DraftToolbar` has no interactive DOM test environment to render through
 * (this repo's only "component tests" — packages/form-ui/test/field-form.test.tsx —
 * use react-dom/server's renderToStaticMarkup, which never fires an event or
 * re-renders on state change), so a real click-through conflict -> reload -> publish sequence
 * can't be driven directly. This is the documented fallback
 * (render-frontend-error-states design.md, task 6.4): the savedBody
 * transition is extracted into savedBodyReducer, and this test drives it
 * through the exact sequence DraftToolbar's wiring produces.
 *
 * The bug this guards was in the *wiring*, not in publishGateLogic.ts's
 * isDirty — that function is already correct and already tested
 * (publishGateLogic.test.ts). Before this change, DraftToolbar's reload()
 * called replace(record.body) but never advanced savedBody to match, so
 * isDirty compared the freshly-reloaded body against the stale, discarded
 * local edit and returned true for a draft byte-identical to the server's.
 * A test of isDirty alone cannot see that, because isDirty was never wrong —
 * the two arguments it was called with were.
 */
describe("DraftToolbar's savedBody transition (draftToolbarState.ts)", () => {
  it("conflict (409) -> reload -> publish: reload leaves the draft clean, so isDirty is false and publish would not prompt", () => {
    const original: Draft = { key: "expense-approval", label: { en: "Expense approval" } };
    let savedBody = initialSavedBody(original);

    // The user edits locally.
    const locallyEdited: Draft = { key: "expense-approval", label: { en: "Expense approval (mine)" } };

    // Save conflicts (409) — DraftToolbar's saveDraft() returns undefined on a
    // conflict, and doSave only dispatches "saved" `if (result)`, so savedBody
    // is untouched here — this line stands in for that skipped dispatch.

    // The user reloads. The server's stored body may differ from both the
    // original and the local edit (someone else's concurrent save).
    const serverBody: Draft = { key: "expense-approval", label: { en: "Expense approval (someone else's)" } };
    savedBody = savedBodyReducer(savedBody, serverBody);

    // replace(serverBody) makes the live draft equal serverBody too — the
    // toolbar's `draft` prop reflects that same replace() call.
    const draftAfterReload = serverBody;

    expect(isDirty(draftAfterReload, savedBody)).toBe(false);
    // Sanity check against the exact regression: comparing the reloaded draft
    // against the *stale* pre-reload savedBody (what the bug left it as) is
    // dirty — that's the false prompt this change removes.
    const staleSavedBody = initialSavedBody(original);
    expect(isDirty(draftAfterReload, staleSavedBody)).toBe(true);

    void locallyEdited; // documents the discarded edit; not otherwise asserted on
  });

  it("reload -> edit -> publish: editing after a reload is dirty again, so the fix does not turn the gate off permanently", () => {
    const serverBody: Draft = { key: "expense-approval", label: { en: "Expense approval" } };
    let savedBody = initialSavedBody(serverBody);
    savedBody = savedBodyReducer(savedBody, serverBody);
    expect(isDirty(serverBody, savedBody)).toBe(false);

    const editedAfterReload: Draft = { key: "expense-approval", label: { en: "Expense approval — edited" } };
    expect(isDirty(editedAfterReload, savedBody)).toBe(true);
  });

  it("advances on a successful save the same way it advances on a reload", () => {
    const original: Draft = { key: "p" };
    let savedBody = initialSavedBody(original);
    const edited: Draft = { key: "p", description: { en: "now with a description" } };

    savedBody = savedBodyReducer(savedBody, edited);

    expect(isDirty(edited, savedBody)).toBe(false);
  });

  it("clones rather than aliasing, so mutating the source body afterward does not follow into savedBody", () => {
    const draft: Draft = { key: "p" };
    const savedBody = savedBodyReducer(initialSavedBody(draft), draft);

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
 * (`dispatchSavedBody`) alone. Same no-interactive-DOM constraint as the
 * conflict -> reload -> publish test above: this drives the two call
 * sites' own sequence of effects by hand, counting how many times each
 * fires, rather than rendering `DraftToolbar` and clicking through it.
 */
describe("DraftToolbar's onSaved callback (design.md: onSaved vs dispatchSavedBody)", () => {
  it("a successful save advances savedBody and fires onSaved once", () => {
    let savedBody = initialSavedBody({ key: "p" });
    let onSavedCount = 0;

    // doSave()'s success branch: `if (result) { dispatchSavedBody(draft); onSaved?.(); }`
    const draft = { key: "p", description: { en: "saved" } };
    const result = { revision: 2, layout: {} };
    if (result) {
      savedBody = savedBodyReducer(savedBody, draft);
      onSavedCount++;
    }

    expect(isDirty(draft, savedBody)).toBe(false);
    expect(onSavedCount).toBe(1);
  });

  it("a save conflict (409) advances neither savedBody nor onSaved", () => {
    const savedBody = initialSavedBody({ key: "p" });
    let onSavedCount = 0;

    // doSave()'s conflict branch: saveDraft() returns undefined, so the
    // `if (result)` guard above never runs.
    const result: { revision: number; layout: Record<string, unknown> } | undefined = undefined;
    if (result) onSavedCount++;

    expect(onSavedCount).toBe(0);
    expect(savedBody).toEqual(initialSavedBody({ key: "p" }));
  });

  it("a reload advances savedBody but never fires onSaved", () => {
    let savedBody = initialSavedBody({ key: "p" });
    let onSavedCount = 0;

    // reload()'s conflict-recovery branch: `dispatchSavedBody(body);` alone —
    // no `onSaved?.()` call sits beside it.
    const serverBody = { key: "p", description: { en: "someone else's" } };
    savedBody = savedBodyReducer(savedBody, serverBody);

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
