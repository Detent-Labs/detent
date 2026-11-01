import type { RefObject } from "react";
import { t } from "../catalog.js";
import type { StepRemovalReach } from "../draft/stepRemoval.js";
import { DestructiveConfirm, DialogCount, DialogFacts, DialogNote, StudioDialog } from "./shared/StudioDialog.js";

interface Props {
  /** The step's resolved label, or the unnamed-step text. */
  label: string;
  /** What the removal reaches, measured on the draft before any write. */
  reach: StepRemovalReach;
  /** The Remove this step control, for the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The Remove this step confirmation (`studio-step-page`: "Removing a step
 * confirms first", "The removal dialog counts what the removal reaches"). The
 * heading names the step, so the facts carry the counts alone. A count row
 * stands only where its count is above zero.
 */
export function RemoveStepDialog({ label, reach, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      // A replacer function, so a label holding a `$` pattern fills in as written.
      heading={t("removeStep.heading").replace("{step}", () => label)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("removeStep.confirm")}</DestructiveConfirm>}
    >
      <DialogFacts>
        <DialogCount term={t("removeStep.incomingTerm")} count={reach.incomingPaths} />
        <DialogCount term={t("removeStep.formFieldsTerm")} count={reach.formFields} />
      </DialogFacts>
      {reach.incomingPaths > 0 && <DialogNote>{t("removeStep.incomingNote")}</DialogNote>}
      {reach.isInitial && <DialogNote>{t("removeStep.firstStepNote")}</DialogNote>}
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}
