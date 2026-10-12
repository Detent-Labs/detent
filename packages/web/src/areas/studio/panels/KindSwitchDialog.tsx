import type { RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t, type CatalogKey } from "../catalog.js";
import { stepKindPhrase } from "../draft/guided-labels.js";
import type { KindBoundKey, PerformedBy, PerformedByReach } from "../draft/performedBy.js";
import { useConfirmDialog } from "./shared/confirmDialog.js";

/**
 * Copied from `RemoveFieldDialog.tsx`'s own dialog styles, not imported: each
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

const HEADING_ID = "kind-switch-confirm-heading";
/** `aria-describedby` on the dialog points at these two: the facts list and
 * the note below it. */
const FACTS_ID = "kind-switch-confirm-facts";
const NOTES_ID = "kind-switch-confirm-notes";

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
  /** The kind control the author pressed, passed straight to
   * `useConfirmDialog` for the focus return on every route out. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The kind switch confirmation (`studio-step-page`: "A kind switch confirms
 * before it removes keys"). Shaped after `RemoveFieldDialog.tsx`: a native
 * `dialog` opened with `showModal()` (`useConfirmDialog`), the same 2px
 * divider box, and the same outlined `btn-secondary btn-destructive`
 * confirming control. Counts only: the dialog names no step content.
 *
 * Cancel holds the initial focus, never the confirming control: the studio
 * has no undo, so a reflexive Enter on an opening dialog must not commit the
 * removal.
 */
export function KindSwitchDialog({ kind, reach, triggerRef, onCancel, onConfirm }: Props) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);
  // A replacer function, so a phrase holding a `$` pattern fills in as written.
  const heading = t("kindSwitch.heading").replace("{kind}", () => stepKindPhrase(kind));

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
        {TERMS.map(([key, term]) => {
          const count = reach[key] ?? 0;
          if (count <= 0) return null;
          return (
            <FactRow key={key} term={t(term)} count={count} />
          );
        })}
      </dl>
      <div id={NOTES_ID}>
        <p {...stylex.props(styles.dialogNote)}>{t("kindSwitch.noUndo")}</p>
      </div>
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-secondary btn-destructive" onClick={onConfirm}>
          {t("kindSwitch.confirm")}
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

function FactRow({ term, count }: { term: string; count: number }) {
  return (
    <>
      <dt {...stylex.props(styles.dialogFactsDt)}>{term}</dt>
      <dd {...stylex.props(styles.dialogFactsDd)}>{count}</dd>
    </>
  );
}
