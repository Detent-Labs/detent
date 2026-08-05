import type { Draft } from "../draft/types.js";

/**
 * The draft toolbar's one invariant: the body the server last confirmed as
 * persisted. `savedBodyReducer` writes it and `isDirty` reads it.
 *
 * `structuredClone` on the way in, matching the mount seed. The panels mutate
 * the draft object in place, so storing the same reference would make
 * `savedBody` follow every later change and turn the dirty gate permanently
 * off, the worse defect (design.md's "Decisions").
 *
 * A save and a reload both mean "current and saved now coincide", so the
 * reducer takes the body itself. It carried a two-kind action union until
 * `simplify-web-logic-modules`; both branches were this same expression, and
 * the call sites are already named `doSave` and `reload`.
 *
 * This file is a reducer rather than an inline `setState` because the repo has
 * no interactive DOM test environment: component tests render via
 * `react-dom/server`'s `renderToStaticMarkup`, which fires no event and
 * re-renders on no state change. The bug this guards was in the *wiring*
 * (`reload()` never advanced `savedBody`), so the test beside this file drives
 * `DraftToolbar`'s reload-shaped sequence through the reducer both call sites
 * now go through.
 */
export function savedBodyReducer(_state: Draft, body: Draft): Draft {
  return structuredClone(body);
}

export function initialSavedBody(draft: Draft): Draft {
  return structuredClone(draft);
}

/**
 * Whether the currently-open draft differs from the last body successfully
 * saved to the server, checked structurally, since neither side carries a
 * cheap identity or hash the client can compare instead. Publish always
 * targets the persisted draft (studio-publish spec), so a dirty draft must be
 * saved first. This is the gate `DraftToolbar`'s Publish action checks before
 * calling `publishDraft` (studio-app spec: "Publishing with unsaved changes
 * prompts a save first").
 */
export function isDirty(current: unknown, savedSnapshot: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(savedSnapshot);
}
