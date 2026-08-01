/**
 * Whether the currently-open draft differs from the last body successfully
 * saved to the server — checked structurally, since neither side carries a
 * cheap identity/hash the client can compare instead. Publish always targets
 * the persisted draft (studio-publish spec), so a dirty draft must be saved
 * first; this is the gate `DraftToolbar`'s Publish action checks before
 * calling `publishDraft` (studio-app spec: "Publishing with unsaved changes
 * prompts a save first").
 */
export function isDirty(current: unknown, savedSnapshot: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(savedSnapshot);
}
