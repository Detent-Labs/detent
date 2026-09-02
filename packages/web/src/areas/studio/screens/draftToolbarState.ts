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

/** What the Publish control renders, resolved from the loaded draft's own
 * `canPublish` report. */
export interface PublishAvailability {
  available: boolean;
  /** The catalog key of the reason, when the control is unavailable. */
  reasonKey?: "draftToolbar.publishUnavailable";
}

/**
 * Whether the studio offers Publish at all (studio-publish spec: "The studio
 * offers Publish only where the engine would admit it"). The argument is the
 * loaded record's `canPublish`, never a role: neither authoring role implies
 * the publish permission, and a scoped grant reaches it without either role,
 * so a role check answers wrong in both directions.
 *
 * `undefined` reads as unavailable. A response that carries no field is a
 * response the engine never blessed, and the safe reading of an absent
 * permission is that it is absent.
 */
export function publishAvailability(canPublish: boolean | undefined): PublishAvailability {
  return canPublish === true ? { available: true } : { available: false, reasonKey: "draftToolbar.publishUnavailable" };
}

/**
 * The version a publish is expected to mint, predicted from the draft's own
 * base version (design.md: no extra request, and no loading state). A null
 * base means nobody has published this process, so the publish mints v1 — the
 * case a naive `base + 1` renders as `vNaN`.
 *
 * The prediction can be wrong: another environment can promote a version
 * between the load and the publish. That is why the dialog labels the row
 * "Next version" rather than "Version", and why the header's published stamp
 * stays the report of the number the engine actually assigned.
 */
export function nextVersionLabel(baseVersion: number | null | undefined): string {
  return `v${typeof baseVersion === "number" ? baseVersion + 1 : 1}`;
}
