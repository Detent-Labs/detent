import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import type { FieldRemovalReach } from "../draft/field-removal.js";
import { useConfirmDialog } from "./shared/confirmDialog.js";

/**
 * Copied from `ProcessHeaderBar.tsx`'s own dialog styles, not imported: each
 * component keeps its own style module (design.md, "The dialog hook moves
 * into a shared studio module"; `stylex-phase-3-studio` D9 keeps that copy
 * the norm). `::backdrop` stays a literal fallback in `app.css`, matched by
 * the `studio-dialog` class beside this compiled style.
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
  studioMono: {
    fontFamily: fonts.mono,
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

/** One heading element either way, so one id names it regardless of kind. */
const HEADING_ID = "remove-field-confirm-heading";
/** `aria-describedby` on the dialog points at these two: the facts list and
 * the notes below it. */
const FACTS_ID = "remove-field-confirm-facts";
const NOTES_ID = "remove-field-confirm-notes";

interface Props {
  /**
   * The removed field's resolved label, with the rail's own fallback for an
   * unnamed field already applied by the caller (`FieldsTab`'s `fieldWord`,
   * `t("panelsScreen.unnamedField")`). `removalAnnouncement` names the same
   * field the same way, so the dialog and the announcement never disagree.
   */
  label: string;
  /** The removal's reach, measured on the draft before any write. */
  reach: FieldRemovalReach;
  /** The Remove field control that opened this dialog, passed straight to
   * `useConfirmDialog` for the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The removal confirmation (studio-app: "Removing a field that reaches past
 * the field catalog confirms first"). Shaped after `ProcessHeaderBar.tsx`'s
 * `DiscardConfirmDialog`: a native `dialog` opened with `showModal()`
 * (`useConfirmDialog`), the same 2px divider box, and the same
 * `btn-secondary btn-destructive` confirming control, never filled red. No
 * toast, no motion.
 *
 * Counts only, the mockup variant the owner chose on 2026-09-13: the dialog
 * names no step, no expression and no config by itself, since the "Used in"
 * zone already lists the steps. Each fact row gates on its own
 * `FieldRemovalReach` count — a caller renders this dialog only when
 * `hasReach` holds, but a removal with reach can still carry only some of
 * the seven kinds.
 *
 * Cancel holds the initial focus, never the confirming control: the studio
 * has no undo, so a reflexive Enter on an opening dialog must not commit the
 * one act it exists to question.
 */
export function RemoveFieldDialog({ label, reach, triggerRef, onCancel, onConfirm }: Props) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);
  const isGroup = reach.field.type === "group";
  const fieldKey = reach.field.key;
  const hasCelOrSettings = reach.celReads > 0 || reach.pluginSettings > 0;

  // A replacer function, so a label holding a `$` pattern such as `$&` fills
  // in as the author typed it.
  const heading = t(isGroup ? "fieldCatalog.removeDialogHeadingGroup" : "fieldCatalog.removeDialogHeadingField").replace(
    "{field}",
    () => label,
  );

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
        <dt {...stylex.props(styles.dialogFactsDt)}>
          {t(isGroup ? "fieldCatalog.removeDialogGroupTerm" : "fieldCatalog.removeDialogFieldTerm")}
        </dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          {label}
          {fieldKey && (
            <>
              {" "}
              <code {...stylex.props(styles.studioMono)}>{fieldKey}</code>
            </>
          )}
        </dd>
        {reach.fieldsInside > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogFieldsInsideTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.fieldsInside}</dd>
          </>
        )}
        {reach.steps > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogStepsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.steps}</dd>
          </>
        )}
        {reach.writers > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogWritersTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.writers}</dd>
          </>
        )}
        {reach.contractEntries > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogContractEntriesTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.contractEntries}</dd>
          </>
        )}
        {reach.columnMappings > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogColumnMappingsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.columnMappings}</dd>
          </>
        )}
        {reach.celReads > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogCelReadsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.celReads}</dd>
          </>
        )}
        {reach.pluginSettings > 0 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("fieldCatalog.removeDialogPluginSettingsTerm")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{reach.pluginSettings}</dd>
          </>
        )}
      </dl>
      <div id={NOTES_ID}>
        <p {...stylex.props(styles.dialogNote)}>{t("fieldCatalog.removeDialogNoteAlways")}</p>
        {isGroup && <p {...stylex.props(styles.dialogNote)}>{t("fieldCatalog.removeDialogNoteGroup")}</p>}
        {hasCelOrSettings && (
          <>
            <p {...stylex.props(styles.dialogNote)}>{t("fieldCatalog.removeDialogNoteCelKept")}</p>
            <p {...stylex.props(styles.dialogNote)}>{t("fieldCatalog.removeDialogNoteCheckPublish")}</p>
          </>
        )}
      </div>
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary btn-destructive" onClick={onConfirm}>
          {t(isGroup ? "fieldCatalog.removeDialogConfirmGroup" : "fieldCatalog.removeDialogConfirmField")}
        </button>
        {/* Cancel holds the initial focus. The studio has no undo, so a
            reflexive Enter on an opening dialog must not commit the
            irreversible removal instead. */}
        <button ref={declineRef} autoFocus type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("fieldCatalog.removeDialogCancel")}
        </button>
      </div>
    </dialog>
  );
}
