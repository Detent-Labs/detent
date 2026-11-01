import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import type { StepRemovalReach } from "../draft/stepRemoval.js";
import { useConfirmDialog } from "./shared/confirmDialog.js";

/**
 * Copied from `KindSwitchDialog.tsx`'s own dialog styles, not imported: each
 * component keeps its own style module (`stylex-phase-3-studio` D9).
 * `::backdrop` stays a literal fallback in `shell/global.css`, matched by the
 * `studio-dialog` class beside this compiled style.
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

const HEADING_ID = "remove-step-confirm-heading";
/** `aria-describedby` on the dialog points at these two: the facts list and
 * the notes below it. */
const FACTS_ID = "remove-step-confirm-facts";
const NOTES_ID = "remove-step-confirm-notes";

interface Props {
  /** The step's resolved label, or the unnamed-step text. */
  label: string;
  /** What the removal reaches, measured on the draft before any write. */
  reach: StepRemovalReach;
  /** The Remove this step control, passed straight to `useConfirmDialog` for
   * the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The Remove this step confirmation (`studio-step-page`: "Removing a step
 * confirms first", "The removal dialog counts what the removal reaches").
 * Shaped after `KindSwitchDialog.tsx`: a native `dialog` opened with
 * `showModal()` (`useConfirmDialog`), the same 2px divider box, and the same
 * outlined `btn-secondary btn-destructive` confirming control.
 *
 * A fact row stands only where its count is above zero. Cancel holds the
 * initial focus, never the confirming control: the studio has no undo, so a
 * reflexive Enter on an opening dialog must not commit the removal.
 */
export function RemoveStepDialog({ label, reach, triggerRef, onCancel, onConfirm }: Props) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);
  // A replacer function, so a label holding a `$` pattern fills in as written.
  const heading = t("removeStep.heading").replace("{step}", () => label);

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
        <FactRow term={t("removeStep.stepTerm")} value={label} />
        {reach.incomingPaths > 0 && <FactRow term={t("removeStep.incomingTerm")} value={String(reach.incomingPaths)} />}
        {reach.formFields > 0 && <FactRow term={t("removeStep.formFieldsTerm")} value={String(reach.formFields)} />}
      </dl>
      <div id={NOTES_ID}>
        <p {...stylex.props(styles.dialogNote)}>{t("removeStep.noUndo")}</p>
        {reach.incomingPaths > 0 && <p {...stylex.props(styles.dialogNote)}>{t("removeStep.incomingNote")}</p>}
        {reach.isInitial && <p {...stylex.props(styles.dialogNote)}>{t("removeStep.firstStepNote")}</p>}
      </div>
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary btn-destructive" onClick={onConfirm}>
          {t("removeStep.confirm")}
        </button>
        {/* Cancel holds the initial focus. The studio has no undo, so a
            reflexive Enter on an opening dialog must not commit the removal. */}
        <button ref={declineRef} autoFocus type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("fieldCatalog.removeDialogCancel")}
        </button>
      </div>
    </dialog>
  );
}

function FactRow({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt {...stylex.props(styles.dialogFactsDt)}>{term}</dt>
      <dd {...stylex.props(styles.dialogFactsDd)}>{value}</dd>
    </>
  );
}
