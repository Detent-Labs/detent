import type { SavePointList } from "../api/types.js";
import { t } from "../catalog.js";
import type { SavePointOutcome } from "../screens/draftAutosaveLogic.js";

/**
 * The Save points view's decisions, apart from its requests and its focus, so
 * `bun:test` can pin them (`studio-app`: "The Save points view lists a draft's
 * save points"). `SavePointsPanel.tsx` runs them.
 */

/** The longest name the input takes. The engine admits 200, for the kept point's longer name. */
export const SAVE_POINT_NAME_MAX = 120;

/** What stands where the rows will. */
export type RowsState = "waiting" | "failed" | "empty" | "list";

export interface ViewState {
  /** The rows' place. A refetch keeps `list`, so it never shows as `waiting`. */
  rows: RowsState;
  /** The input and its control, or the sentence that takes their place at the bound. */
  form: "input" | "bound";
}

/** The bound is reached when the list holds as many points as the server states. */
export function atBound(list: SavePointList | undefined): boolean {
  return list !== undefined && list.items.length >= list.limit;
}

/**
 * A failed fetch drops the list, so the form returns and the banner stands where
 * the rows would. A refetch keeps the old rows until its answer.
 */
export function viewState(list: SavePointList | undefined, failed: boolean): ViewState {
  if (failed) return { rows: "failed", form: "input" };
  if (list === undefined) return { rows: "waiting", form: "input" };
  return { rows: list.items.length === 0 ? "empty" : "list", form: atBound(list) ? "bound" : "input" };
}

/** The name as sent, or `empty` for the sentence at the input. */
export function nameDecision(raw: string): { kind: "empty" } | { kind: "name"; name: string } {
  const name = raw.trim();
  return name === "" ? { kind: "empty" } : { kind: "name", name };
}

/** A name in a sentence. A function fills the slot, so a `$` pattern prints as written. */
function fillName(key: Parameters<typeof t>[0], name: string): string {
  return t(key).replace("{name}", () => name);
}

export const createdLine = (name: string) => fillName("savePoints.created", name);
export const removedLine = (name: string) => fillName("savePoints.removed", name);
export const createUnsavedLine = () => t("savePoints.createUnsaved");
export const restoreUnsavedLine = () => t("savePoints.restoreUnsaved");
export const restoreHeading = (name: string) => fillName("savePoints.restoreHeading", name);
export const removeHeading = (name: string) => fillName("savePoints.removeHeading", name);
export const restoreRowLabel = (name: string) => fillName("savePoints.restoreRow", name);
export const removeRowLabel = (name: string) => fillName("savePoints.removeRow", name);
/** One pass over both slots, so a name that reads `{kept}` prints as written. */
export const restoredLine = (name: string, kept: string) =>
  t("savePoints.restored").replace(/\{(name|kept)\}/g, (_, slot: string) => (slot === "name" ? name : kept));
export const boundSentence = (limit: number) => t("savePoints.atBound").replace("{limit}", () => String(limit));

/** What a create's outcome does to the view. */
export interface CreateLanding {
  clearName: boolean;
  /** The status line's new text. */
  status?: string;
  /** A sentence at the input. The name stays typed. */
  inputError?: string;
  refetch: boolean;
}

/**
 * Each outcome has one home (`design.md` D10). A failed save says so at the input,
 * since its banner stands apart from the press. A conflicted create prints nothing
 * here: its banner holds the one way on, and the name stays typed.
 */
export function createLanding(outcome: SavePointOutcome<unknown>, name: string): CreateLanding {
  switch (outcome.kind) {
    case "done":
      return { clearName: true, status: createdLine(name), refetch: true };
    case "refused":
      return { clearName: false, inputError: outcome.message, refetch: outcome.lost === true };
    case "unsaved":
      return { clearName: false, inputError: createUnsavedLine(), refetch: false };
    case "conflict":
    case "gone":
    case "ended":
      return { clearName: false, refetch: false };
  }
}

/** What a restore's or a remove's outcome does to the open dialog and the list. */
export interface DialogLanding {
  dialog: "close" | "stay";
  /** Printed inside the open dialog. */
  refusal?: string;
  refetch: boolean;
  status?: string;
  /** The focus goes to the name input once the refetch has answered. */
  focusInputAfter: boolean;
}

export function restoreLanding(outcome: SavePointOutcome<{ kept: string }>, name: string): DialogLanding {
  switch (outcome.kind) {
    case "done":
      return { dialog: "close", refetch: true, status: restoredLine(name, outcome.value.kept), focusInputAfter: false };
    case "gone":
      return { dialog: "close", refetch: true, focusInputAfter: true };
    case "refused":
      return { dialog: "stay", refusal: outcome.message, refetch: outcome.lost === true, focusInputAfter: false };
    case "unsaved":
      return { dialog: "stay", refusal: restoreUnsavedLine(), refetch: false, focusInputAfter: false };
    case "conflict":
    case "ended":
      return { dialog: "close", refetch: false, focusInputAfter: false };
  }
}

/** A remove sends at once, so it never meets a failed save. */
export function removeLanding(outcome: SavePointOutcome<undefined>, name: string): DialogLanding {
  switch (outcome.kind) {
    case "done":
    case "gone":
      return { dialog: "close", refetch: true, status: removedLine(name), focusInputAfter: true };
    case "refused":
      return { dialog: "stay", refusal: outcome.message, refetch: false, focusInputAfter: false };
    default:
      return { dialog: "close", refetch: false, focusInputAfter: false };
  }
}

/**
 * Whether an answer moves the focus to the bound's sentence: it reaches the bound
 * while the input, which the bound takes away, held the focus.
 */
export function movesToBound(before: { inputHeld: boolean; atBound: boolean }, after: { atBound: boolean }): boolean {
  return before.inputHeld && !before.atBound && after.atBound;
}

/** Where the focus lands on entry from the `⋮` menu and after a remove: the input, or the sentence where it stands in its place. */
export function entryFocus(bound: boolean): "input" | "bound" {
  return bound ? "bound" : "input";
}

/** The saved line's template and the name it fills. A point with no display name reads without one. */
export function savedLineTemplate(createdByDisplayName: string | null | undefined): string {
  return createdByDisplayName == null ? t("processList.savedAnonymous") : t("processList.savedBy");
}
