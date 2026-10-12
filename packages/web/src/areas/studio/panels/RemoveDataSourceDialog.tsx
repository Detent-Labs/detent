import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import type { DataSourceRemovalReach } from "../draft/data-source-removal.js";
import { useConfirmDialog } from "./shared/confirmDialog.js";

/**
 * Copied from `RemoveFieldDialog.tsx`'s own dialog styles, not imported: each
 * component keeps its own style module. `::backdrop` stays a literal fallback
 * in `shell/global.css`, matched by the `studio-dialog` class beside this
 * compiled style.
 */
const styles = stylex.create({
  dialog: {
    maxWidth: "34rem",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    padding: space.s4,
    backgroundColor: colors.surface,
    color: colors.text,
    overscrollBehavior: "contain",
    boxShadow: shadow.lg,
  },
  dialogFacts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: `${space.s1} ${space.s3}`,
    marginBlock: space.s3,
    marginInline: 0,
  },
  dialogFactsDt: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  dialogFactsDd: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  dialogNote: {
    color: colors.textMuted,
    fontSize: "0.9rem",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
});

const HEADING_ID = "remove-data-source-confirm-heading";
/** `aria-describedby` on the dialog points at these two: the facts list and
 * the notes below it. */
const FACTS_ID = "remove-data-source-confirm-facts";
const NOTES_ID = "remove-data-source-confirm-notes";

interface Props {
  /**
   * The removed data source's key, with the rail's own fallback for an unnamed
   * source already applied by the caller (`DataSourcesTab`'s
   * `t("panelsScreen.unnamedDataSource")`).
   */
  label: string;
  /** The removal's reach, measured on the draft before any write. */
  reach: DataSourceRemovalReach;
  /** The Remove data source control that opened this dialog, passed straight
   * to `useConfirmDialog` for the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The data source removal confirmation (studio-app: "Removing a data source
 * that fields use confirms first"). It takes `RemoveFieldDialog`'s treatment:
 * a native `dialog` opened with `showModal()` (`useConfirmDialog`), the 2px
 * divider box, and the `btn-secondary btn-destructive` confirming control,
 * never filled red.
 *
 * Counts only: the dialog names the source by its key and no field. A fact
 * row prints for a count above zero alone.
 *
 * Cancel holds the initial focus, never the confirming control: the studio
 * has no undo, so a reflexive Enter on an opening dialog must not commit the
 * one act it exists to question.
 */
export function RemoveDataSourceDialog({ label, reach, triggerRef, onCancel, onConfirm }: Props) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);

  // A replacer function, so a key holding a `$` pattern such as `$&` fills in
  // as the author typed it.
  const heading = t("dataSources.removeDialogHeading").replace("{source}", () => label);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${dialogProps.className}`}
      style={dialogProps.style}
      aria-labelledby={HEADING_ID}
      aria-describedby={`${FACTS_ID} ${NOTES_ID}`}
      onCancel={onCancel}
    >
      <h2 id={HEADING_ID}>{heading}</h2>
      <dl id={FACTS_ID} {...stylex.props(styles.dialogFacts)}>
        {reach.fields > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("dataSources.removeDialogFieldsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.fields}</dd>
          </>
        )}
        {reach.columnMappings > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("dataSources.removeDialogColumnMappingsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.columnMappings}</dd>
          </>
        )}
      </dl>
      <div id={NOTES_ID}>
        <p {...stylex.props(styles.dialogNote)}>{t("dataSources.removeDialogNoteClears")}</p>
        <p {...stylex.props(styles.dialogNote)}>{t("dataSources.removeDialogNoteNoUndo")}</p>
      </div>
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary btn-destructive" onClick={onConfirm}>
          {t("dataSources.removeDataSource")}
        </button>
        {/* Cancel holds the initial focus. The studio has no undo, so a
            reflexive Enter on an opening dialog must not commit the
            irreversible removal instead. */}
        <button ref={declineRef} autoFocus type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("dataSources.removeDialogCancel")}
        </button>
      </div>
    </dialog>
  );
}
