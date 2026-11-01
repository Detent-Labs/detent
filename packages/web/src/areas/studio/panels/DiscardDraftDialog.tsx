import type { RefObject } from "react";
import { t } from "../catalog.js";
import { DestructiveConfirm, DialogFact, DialogFacts, DialogNote, DialogRefusal, StudioDialog } from "./shared/StudioDialog.js";

/** A date and time for the studio's English sentences, so a German browser never
 * prints a German month inside one. */
export const ABSOLUTE_TIME = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

interface Props {
  /** The process's resolved name, with the untitled fallback already applied. */
  processLabel: string;
  /** When the draft last saved in this session, or undefined where unknown. */
  lastSavedAt?: Date;
  /** A refused discard, printed inside the open dialog: a modal puts everything
   * behind it out of reach. `detail` is the server's text for a Developer view. */
  refusal: { message: string; detail: string | null } | null;
  /** True while the request runs. Both controls stand disabled. */
  busy: boolean;
  /** The control that opened this dialog, for the focus return. */
  triggerRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The discard confirmation (studio-app: "Discarding a draft confirms in a
 * modal dialog", "Discarding from the process list takes the discard dialog").
 * The header bar and the process list both mount it.
 */
export function DiscardDraftDialog({ processLabel, lastSavedAt, refusal, busy, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      heading={t("draftToolbar.discardDialogHeading")}
      triggerRef={triggerRef}
      onCancel={onCancel}
      busy={busy}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("draftToolbar.discard")}</DestructiveConfirm>}
      refusal={refusal && <DialogRefusal detail={refusal.detail}>{refusal.message}</DialogRefusal>}
    >
      <DialogFacts>
        <DialogFact term={t("draftToolbar.dialogProcess")}>{processLabel}</DialogFact>
        {lastSavedAt && <DialogFact term={t("draftToolbar.discardDialogLastSaved")}>{ABSOLUTE_TIME.format(lastSavedAt)}</DialogFact>}
      </DialogFacts>
      <DialogNote>{t("draftToolbar.discardDialogKeepsPublished")}</DialogNote>
    </StudioDialog>
  );
}
