import type { Draft } from "../draft/types.js";

/**
 * The one transition `DraftToolbar`'s `savedBody` goes through: advance to a
 * clone of whatever body the server just confirmed as persisted. Extracted
 * as a pure reducer, beside `publishGateLogic.ts`, so the invariant it
 * encodes — "the body last known to be persisted" — has exactly one place
 * that writes it, and that place is unit-testable without a DOM.
 *
 * Both action kinds do the same thing: a successful save and a reload both
 * mean "current and saved now coincide" (design.md). They stay distinct
 * kinds anyway, one per call site (`doSave`, `reload`), so a reader tracing
 * either wiring path sees which one fired.
 *
 * `structuredClone` on the way in, matching the mount seed — the draft
 * object is mutated in place by the panels, so storing the same reference
 * would make `savedBody` follow every later edit and turn the dirty gate
 * permanently off, the worse defect (design.md's "Decisions").
 *
 * This is the fallback the design allows for testing this fix: the repo has
 * no interactive DOM test environment (component tests here render via
 * `react-dom/server`'s `renderToStaticMarkup`, which never fires an event or
 * re-renders on state change — see `packages/form-ui/test/field-form.test.tsx`),
 * so a click-through conflict -> reload -> publish flow can't be driven
 * directly. The bug itself was in the *wiring* (`reload()` never called the
 * equivalent of this), which a reducer test alone cannot see — the test
 * beside this file exercises the wiring by calling `DraftToolbar`'s
 * `reload()`-shaped sequence through this reducer, the same one production
 * code now goes through for both call sites.
 */
export type SavedBodyAction = { kind: "saved"; body: Draft } | { kind: "reloaded"; body: Draft };

export function savedBodyReducer(_state: Draft, action: SavedBodyAction): Draft {
  return structuredClone(action.body);
}

export function initialSavedBody(draft: Draft): Draft {
  return structuredClone(draft);
}
