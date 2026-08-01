/**
 * The save/conflict state machine for the editing screen, extracted from the
 * component so it's directly testable (studio-app spec: "Studio's testable
 * logic is extracted from its components"). Tracks only what a `PUT
 * /drafts/:processId` response affects — `revision`/`layout`/conflict —
 * never the Draft body itself, which lives in `draft/store.tsx` and is left
 * untouched on a conflict (studio-app spec: "the local editing state is left
 * intact until the user chooses").
 */
export interface DraftSaveState {
  revision: number;
  layout: Record<string, unknown>;
  conflict: boolean;
}

export function initialSaveState(revision: number, layout: Record<string, unknown>): DraftSaveState {
  return { revision, layout, conflict: false };
}

/** A save's server response: `undefined` means the API layer saw a 409. */
export function applySaveResult(state: DraftSaveState, result: { revision: number; layout: Record<string, unknown> } | undefined): DraftSaveState {
  if (result === undefined) return { ...state, conflict: true };
  return { revision: result.revision, layout: result.layout, conflict: false };
}

/** Reloading after a conflict adopts the stored revision/layout and clears the conflict, regardless of the state it started from. */
export function applyReload(stored: { revision: number; layout: Record<string, unknown> }): DraftSaveState {
  return { revision: stored.revision, layout: stored.layout, conflict: false };
}
