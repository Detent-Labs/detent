import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";

const NARROW = "@media (max-width: 40rem)";

/** The warning callout of `DESIGN.md`: refusal text beside a 3px rule in the
 * advisory role, 8px before the text. The message and the buttons share a row
 * on a wide screen and stack below 40rem. The message keeps the 68ch measure,
 * so its text wraps inside the row. */
const styles = stylex.create({
  notice: {
    display: "flex",
    flexWrap: "wrap",
    flexDirection: { default: "row", [NARROW]: "column" },
    alignItems: { default: "baseline", [NARROW]: "flex-start" },
    gap: space.s3,
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
    marginBottom: space.s3,
  },
  message: {
    margin: 0,
    maxWidth: "68ch",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
  },
});

interface RestoreNoticeProps {
  onRestore: () => void;
  onDiscard: () => void;
  /** Disables both buttons. A save in flight writes its answer's revision over
   * the draft's, so a restore during it would drop the stored revision. */
  disabled?: boolean;
}

/** Offers the unsaved work a 401 kept in this tab (`draft/draftStash.ts`).
 * `ProcessSurface` owns the stash and unmounts this after either button. */
export function RestoreNotice({ onRestore, onDiscard, disabled = false }: RestoreNoticeProps) {
  return (
    <div role="status" {...stylex.props(styles.notice)}>
      <p {...stylex.props(styles.message)}>{t("restoreNotice.message")}</p>
      <div {...stylex.props(styles.actions)}>
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={onRestore}>
          {t("restoreNotice.restore")}
        </button>
        <button type="button" className="btn btn-secondary btn-destructive" disabled={disabled} onClick={onDiscard}>
          {t("restoreNotice.discard")}
        </button>
      </div>
    </div>
  );
}
