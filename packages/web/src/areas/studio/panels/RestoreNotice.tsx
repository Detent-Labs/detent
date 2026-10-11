import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";

const NARROW = "@media (max-width: 40rem)";

/** The warning callout of `DESIGN.md`: refusal text beside a 3px rule in the
 * advisory role, 8px before the text. The message and the buttons share a
 * line on a wide screen and stack below 40rem. */
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
}

/** Offers the unsaved work a 401 kept in this tab (`draft/draftStash.ts`).
 * `ProcessSurface` owns the stash and unmounts this after either button. */
export function RestoreNotice({ onRestore, onDiscard }: RestoreNoticeProps) {
  return (
    <div role="status" {...stylex.props(styles.notice)}>
      <p {...stylex.props(styles.message)}>{t("restoreNotice.message")}</p>
      <div {...stylex.props(styles.actions)}>
        <button type="button" className="btn btn-secondary" onClick={onRestore}>
          {t("restoreNotice.restore")}
        </button>
        <button type="button" className="btn btn-destructive" onClick={onDiscard}>
          {t("restoreNotice.discard")}
        </button>
      </div>
    </div>
  );
}
