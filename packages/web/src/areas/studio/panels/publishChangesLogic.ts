/**
 * The publish dialog's Changes sentence (`studio-publish`: "The publish dialog
 * states the changes since the base version"), picked from plain data so each
 * state tests with no rendering.
 *
 * A function fills each `{slot}`, so a `$` pattern in a message prints as
 * written.
 */
import { t } from "../catalog.js";

/** What the dialog knows about the draft's difference from its base. */
export type ChangesState =
  | { kind: "first" }
  | { kind: "reading" }
  | { kind: "failed"; message: string }
  | { kind: "loaded"; count: number };

/** The one sentence the Changes row reads for `state`. */
export function changesSentence(state: ChangesState, baseVersion: number | null): string {
  const version = String(baseVersion);
  switch (state.kind) {
    case "first":
      return t("draftToolbar.publishDialogFirstVersion");
    case "reading":
      return t("draftToolbar.publishDialogChangesReading").replace("{version}", () => version);
    case "failed":
      return t("draftToolbar.publishDialogChangesFailed")
        .replace("{version}", () => version)
        .replace("{message}", () => state.message);
    case "loaded":
      if (state.count === 0) return t("draftToolbar.publishDialogChangesNone").replace("{version}", () => version);
      if (state.count === 1) return t("draftToolbar.publishDialogChangesOne").replace("{version}", () => version);
      return t("draftToolbar.publishDialogChangesMany")
        .replace("{count}", () => String(state.count))
        .replace("{version}", () => version);
  }
}
