import type { RefObject } from "react";
import type { SavePointList } from "../api/types.js";
import { t } from "../catalog.js";
import { ABSOLUTE_TIME } from "./DiscardDraftDialog.js";
import { removeHeading, restoreHeading } from "./savePointsLogic.js";
import { DestructiveConfirm, DialogFact, DialogFacts, DialogNote, DialogRefusal, PrimaryConfirm, StudioDialog } from "./shared/StudioDialog.js";

export type SavePointRow = SavePointList["items"][number];

interface Props {
  point: SavePointRow;
  /** A refused request, printed inside the open dialog. */
  refusal: string | undefined;
  /** True while the request runs. Both controls stand disabled. */
  busy: boolean;
  /** The row's control that opened this dialog, for the focus return. */
  triggerRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Who saved the point and when, the facts both dialogs open with. */
function PointFacts({ point }: { point: SavePointRow }) {
  return (
    <DialogFacts>
      {point.createdByDisplayName != null && <DialogFact term={t("savePoints.savedByTerm")}>{point.createdByDisplayName}</DialogFact>}
      <DialogFact term={t("savePoints.savedTerm")}>{ABSOLUTE_TIME.format(new Date(point.createdAt))}</DialogFact>
    </DialogFacts>
  );
}

/**
 * The restore confirmation (`studio-app`: "Restoring a save point asks first and
 * names what it kept"). The row stays, so its Restore takes the focus back.
 */
export function RestoreSavePointDialog({ point, refusal, busy, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      heading={restoreHeading(point.name)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      busy={busy}
      confirm={<PrimaryConfirm onClick={onConfirm}>{t("savePoints.restore")}</PrimaryConfirm>}
      refusal={refusal !== undefined && <DialogRefusal>{refusal}</DialogRefusal>}
    >
      <PointFacts point={point} />
      <DialogNote>{t("savePoints.restoreNote")}</DialogNote>
    </StudioDialog>
  );
}

/** The remove confirmation (`studio-app`: "Removing a save point asks first"). The row leaves, so the panel places the focus. */
export function RemoveSavePointDialog({ point, refusal, busy, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      heading={removeHeading(point.name)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      busy={busy}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("savePoints.remove")}</DestructiveConfirm>}
      refusal={refusal !== undefined && <DialogRefusal>{refusal}</DialogRefusal>}
    >
      <PointFacts point={point} />
      <DialogNote>{t("savePoints.removeNote")}</DialogNote>
    </StudioDialog>
  );
}
