import type { Collaboration } from "workflow-engine/schema";
import { deriveKey, dedupeKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text.js";
import { isDraftViewField, type DraftViewEntry } from "../draft/view-layout.js";

/**
 * A step's label edit's whole key decision (design.md: "Extract the step-key
 * decision"), shared by the identity zone's own label input and the canvas
 * node's inline rename, so the two routes to `step.label` cannot drift on
 * this behavior either — `inlineRename.ts`'s own "cannot drift" contract,
 * extended to the derived key.
 *
 * Derivation reads only the base-locale entry of both the prior and the new
 * label (design.md Decisions: "Derivation reads only the base-locale
 * entry"), so an edit to a non-base content locale's entry resolves to the
 * same base-locale text on both sides and the lock check sees no change.
 *
 * Returns the derived-and-deduped key when the lock check says auto-fill is
 * still live, or `undefined` when it says to leave `key` untouched — the
 * caller applies the return value only when it's defined.
 */
export function nextStepKey(
  currentKey: string,
  priorLabel: DraftLocalizedText,
  newLabel: DraftLocalizedText,
  baseLocale: string,
  siblingKeys: ReadonlySet<string>,
): string | undefined {
  const priorDerived = deriveKey(resolveDraftLocalizedText(priorLabel, baseLocale, baseLocale) ?? "");
  if (!shouldAutoDeriveKey(currentKey, priorDerived)) return undefined;

  const newDerived = deriveKey(resolveDraftLocalizedText(newLabel, baseLocale, baseLocale) ?? "");
  return dedupeKey(newDerived, siblingKeys);
}

/** How many of the catalog's fields a step's view configures — field entries
 * alone. A note occupies no catalog row, so it raises this count by none. */
export function configuredFieldCount(fields: DraftViewEntry[] | undefined): number {
  return (fields ?? []).filter(isDraftViewField).length;
}

/**
 * A step's own `collaboration` override after the Collaboration section's
 * Segmented Control sets one key to Default (`next === undefined`), On
 * (`true`) or Off (`false`).
 *
 * Selecting Default deletes that key from the local copy rather than setting
 * it to `undefined`: an explicit `undefined` still leaves the wrapper object
 * behind (`JSON.stringify` drops the key but not its parent), so a step
 * toggled and reverted would publish `"collaboration": {}` forever instead of
 * carrying no `collaboration` key at all, moving `definitionHash` for a step
 * that is otherwise identical to one nobody touched. Once the patched object
 * holds no key, the return value is `undefined` so the caller drops the whole
 * `collaboration` object instead of persisting `{}`.
 */
export function nextCollaborationOverride(
  current: Collaboration | undefined,
  key: keyof Collaboration,
  next: boolean | undefined,
): Collaboration | undefined {
  const patched = { ...(current ?? {}) };
  if (next === undefined) {
    delete patched[key];
  } else {
    patched[key] = next;
  }
  return Object.keys(patched).length > 0 ? patched : undefined;
}
