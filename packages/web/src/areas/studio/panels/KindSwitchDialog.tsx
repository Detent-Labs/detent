import type { RefObject } from "react";
import { t, type CatalogKey } from "../catalog.js";
import { stepKindPhrase } from "../draft/guided-labels.js";
import type { KindBoundKey, PerformedBy, PerformedByReach } from "../draft/performedBy.js";
import { DestructiveConfirm, DialogCount, DialogFacts, DialogNote, StudioDialog } from "./shared/StudioDialog.js";

/** One fact row per kind of key, in the order the reach lists them. */
const TERMS: [KindBoundKey, CatalogKey][] = [
  ["subprocess", "kindSwitch.subprocessTerm"],
  ["paths", "kindSwitch.pathsTerm"],
  ["timers", "kindSwitch.timersTerm"],
  ["onExit", "kindSwitch.onExitTerm"],
  ["onCancel", "kindSwitch.onCancelTerm"],
  ["cancellable", "kindSwitch.cancellableTerm"],
  ["outcome", "kindSwitch.outcomeTerm"],
];

interface Props {
  /** The kind the step switches to. */
  kind: PerformedBy;
  /** What the switch removes, measured on the step before any write. */
  reach: PerformedByReach;
  /** The kind control the author pressed, for the focus return on every route out. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The kind switch confirmation (`studio-step-page`: "A kind switch confirms
 * before it removes keys"). Counts only: the dialog names no step content.
 */
export function KindSwitchDialog({ kind, reach, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      // A replacer function, so a phrase holding a `$` pattern fills in as written.
      heading={t("kindSwitch.heading").replace("{kind}", () => stepKindPhrase(kind))}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("kindSwitch.confirm")}</DestructiveConfirm>}
    >
      <DialogFacts>
        {TERMS.map(([key, term]) => (
          <DialogCount key={key} term={t(term)} count={reach[key] ?? 0} />
        ))}
      </DialogFacts>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}
