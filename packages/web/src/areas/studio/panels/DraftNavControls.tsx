import { useEffect, useRef, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { checksDotState, groupChecksBySource } from "../draft/checksRail.js";
import type { ValidationResult } from "../draft/validation.js";
import { ChecksRail } from "./ChecksRail.js";
import type { DraftToolbarActions } from "./DraftToolbar.js";
import { publishAvailability, nextVersionLabel } from "../screens/draftToolbarState.js";

/** The Publish control points `aria-describedby` here when the permission is
 * absent. One area nav renders per screen, so one constant id suffices. */
const PUBLISH_REASON_ID = "studio-publish-unavailable-reason";

const styles = stylex.create({
  // The four controls sit in the studio's area nav, right of Processes, Tools
  // and Templates. They keep the nav's own gap, so nothing here declares a
  // layout of its own beyond the separator before the group.
  group: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
  publishReason: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // `::backdrop` stays a literal fallback in `app.css`, which the
  // `studio-dialog` class beside this compiled style keeps matching.
  dialog: {
    maxWidth: "34rem",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    padding: space.s4,
    background: colors.surface,
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
  dialogBlocked: {
    color: colors.refusal,
  },
  dialogError: {
    color: colors.refusal,
    whiteSpace: "pre-line",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
});

/**
 * The area nav's Publish control, with the reason line that renders beneath it
 * when the permission is absent (studio-publish: "The studio offers Publish
 * only where the engine would admit it, and names the reason otherwise").
 *
 * A component of its own because the gate and its reason are one concept: the
 * `role="group"` wrapper, the `aria-disabled` control, the reason line and the
 * `aria-describedby` that binds them have to stay together or the reason
 * reaches nobody.
 *
 * `aria-disabled`, not the native `disabled` attribute, for the permission
 * state: a natively disabled button takes no focus, so nothing ever reads its
 * `aria-describedby` and the reason a blind developer needs is the one they
 * never hear. The pending disable beside it stays native — a request in flight
 * is a different state, and it carries no reason to read. The reason is text,
 * never a `title`: a tooltip reaches neither the keyboard nor a screen reader.
 */
export function PublishNavControl({
  canPublish,
  publishing,
  onPublish,
  triggerRef,
}: {
  canPublish: boolean;
  publishing: boolean;
  onPublish: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const gate = publishAvailability(canPublish);
  return (
    <div role="group">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-primary"
        disabled={publishing}
        aria-disabled={gate.available ? undefined : true}
        aria-describedby={gate.available ? undefined : PUBLISH_REASON_ID}
        onClick={() => {
          if (!gate.available) return;
          onPublish();
        }}
      >
        {publishing ? t("draftToolbar.publishing") : t("draftToolbar.publish")}
      </button>
      {gate.reasonKey && (
        <span id={PUBLISH_REASON_ID} {...stylex.props(styles.publishReason)}>
          {t(gate.reasonKey)}
        </span>
      )}
    </div>
  );
}

/**
 * Opens a mounted confirmation dialog modally, puts the initial focus on its
 * declining control, and returns focus to the nav control that opened it.
 *
 * Three separate mechanisms, because none of them alone holds:
 *
 * The `autoFocus` prop states the intent and is the property a rendered string
 * carries, so a static-markup test can assert it. On the client it is NOT an
 * attribute: React 19 skips it in `setProp` and calls `.focus()` from
 * `commitMount` instead.
 *
 * That client focus lands before this passive effect runs, and `showModal()`
 * then re-runs the dialog focusing steps. Those steps look for the `autofocus`
 * ATTRIBUTE, find none, and fall to the first focusable descendant — the
 * committing button, which for the discard dialog destroys the draft. So the
 * effect focuses the declining control again, after `showModal()`.
 *
 * The cleanup covers every close route at once: Cancel, Escape, a backdrop
 * dismissal, and a completed request all clear `pendingDialog`, which unmounts
 * the dialog. Without it focus drops to `<body>` and a keyboard user restarts
 * their traversal from the top of the screen.
 */
function useConfirmDialog(triggerRef: RefObject<HTMLButtonElement | null>) {
  const ref = useRef<HTMLDialogElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    declineRef.current?.focus();
    return () => triggerRef.current?.focus();
  }, [triggerRef]);

  return { ref, declineRef };
}

interface ConfirmDialogProps {
  processLabel: string;
  revision: number;
  /** The nav control that opened this dialog, for the focus return above. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The refusal to render inside the dialog, or null. A modal puts everything
   * behind it out of reach, so a banner on the screen reports nothing here
   * (spa-error-reporting). */
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The publish confirmation (studio-publish: "Publishing confirms in a modal
 * dialog that names the version and its immutability").
 *
 * A native `dialog` opened with `showModal()`, the pattern
 * `ProcessesScreen.tsx`'s `PromotionPreviewDialog` already ships. The focus
 * trap, the Escape key and the backdrop come from the platform, so none of the
 * three is hand-rolled. Mounted only while the dialog is pending, so the open
 * effect runs once.
 */
function PublishConfirmDialog({
  processLabel,
  processId,
  revision,
  nextVersion,
  dirty,
  openIssues,
  blocked,
  error,
  busy,
  triggerRef,
  onCancel,
  onConfirm,
}: ConfirmDialogProps & {
  processId: string;
  nextVersion: string;
  dirty: boolean;
  openIssues: number;
  blocked: boolean;
}) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${dialogProps.className}`}
      style={dialogProps.style}
      aria-labelledby="publish-confirm-heading"
      onCancel={onCancel}
    >
      <h2 id="publish-confirm-heading">{t("draftToolbar.publishDialogHeading")}</h2>
      <dl {...stylex.props(styles.dialogFacts)}>
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogProcess")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{processLabel}</dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogProcessId")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{processId}</code>
        </dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogRevision")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{revision}</dd>
        {/* "Next version", not "Version": the engine assigns the number, and
            another environment can promote one between this load and this
            publish. The header's own published stamp reports what the engine
            actually assigned. */}
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.publishDialogNextVersion")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{nextVersion}</code>
        </dd>
        {/* The same `validation.issues[]` the area nav's Checks control counts,
            so the dialog and the control can never disagree. */}
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.publishDialogOpenIssues")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{openIssues}</dd>
      </dl>
      {blocked && <p {...stylex.props(styles.dialogBlocked)}>{t("draftToolbar.publishDialogBlocked")}</p>}
      {dirty && <p {...stylex.props(styles.dialogNote)}>{t("draftToolbar.publishDialogUnsaved")}</p>}
      <p {...stylex.props(styles.dialogNote)}>{t("draftToolbar.publishDialogImmutable")}</p>
      {error !== null && (
        <p {...stylex.props(styles.dialogError)} role="alert">
          {error}
        </p>
      )}
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? t("draftToolbar.publishing") : t("draftToolbar.publish")}
        </button>
        {/* Cancel holds the initial focus, not Publish beside it. A publish
            mints a version that can never change, and the studio carries no
            undo, so a reflexive Enter on an opening dialog must not commit
            the act the dialog exists to question. */}
        <button ref={declineRef} autoFocus type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {t("draftToolbar.dialogCancel")}
        </button>
      </div>
    </dialog>
  );
}

/**
 * The discard confirmation (studio-app: "Discarding a draft confirms in a
 * modal dialog"). Same element, same class and same platform behavior as the
 * publish dialog above; different facts and a different verb.
 *
 * The confirming button is `btn-destructive`, which the design language keeps
 * outlined in the accent rather than filled red.
 */
function DiscardConfirmDialog({
  processLabel,
  revision,
  lastSavedAt,
  error,
  busy,
  triggerRef,
  onCancel,
  onConfirm,
}: ConfirmDialogProps & { lastSavedAt: Date | undefined }) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);

  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${dialogProps.className}`}
      style={dialogProps.style}
      aria-labelledby="discard-confirm-heading"
      onCancel={onCancel}
    >
      <h2 id="discard-confirm-heading">{t("draftToolbar.discardDialogHeading")}</h2>
      <dl {...stylex.props(styles.dialogFacts)}>
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogProcess")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{processLabel}</dd>
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogRevision")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{revision}</dd>
        {lastSavedAt && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.discardDialogLastSaved")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>{lastSavedAt.toLocaleTimeString()}</dd>
          </>
        )}
      </dl>
      <p {...stylex.props(styles.dialogNote)}>{t("draftToolbar.discardDialogKeepsPublished")}</p>
      {error !== null && (
        <p {...stylex.props(styles.dialogError)} role="alert">
          {error}
        </p>
      )}
      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-destructive" onClick={onConfirm} disabled={busy}>
          {t("draftToolbar.discard")}
        </button>
        {/* Cancel holds the initial focus. Discard draft is the first
            focusable control in DOM order, so the browser's own dialog
            focusing steps would otherwise prime the one irreversible button
            on the screen. */}
        <button ref={declineRef} autoFocus type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {t("draftToolbar.dialogCancel")}
        </button>
      </div>
    </dialog>
  );
}

interface Props {
  processId: string;
  processLabel: string;
  revision: number;
  isDirty: boolean;
  lastSavedAt: Date | undefined;
  validation: ValidationResult;
  canPublish: boolean;
  baseVersion: number | null;
  actions: DraftToolbarActions;
  /** Pressing Checks opens the Checks tab. It expands no list in place, under
   * the area nav or on any tab (`studio-checks-rail`). */
  onOpenChecks: () => void;
}

/**
 * The four controls the studio's area nav carries while a draft stands open:
 * Checks, Save, Discard draft and Publish (`studio-process-tabs`). The header
 * bar's own `⋮` menu carries none of them.
 *
 * The Checks control is the checks rail's collapsed summary. It carries the
 * open issue count and a dot reading the worst open issue, and its accessible
 * name states both in one sentence. It stands on every tab and in every state
 * of the surface, whatever the author has selected.
 *
 * Both confirmation dialogs live here, beside the controls that open them, so
 * focus returns to the pressed control when either closes.
 */
export function DraftNavControls({
  processId,
  processLabel,
  revision,
  isDirty,
  lastSavedAt,
  validation,
  canPublish,
  baseVersion,
  actions,
  onOpenChecks,
}: Props) {
  const publishTriggerRef = useRef<HTMLButtonElement>(null);
  const discardTriggerRef = useRef<HTMLButtonElement>(null);

  // The blocking verdict the publish dialog states, from the same groups the
  // Checks control's own dot reads. The `view` group holds the studio's own
  // findings and refuses no publish, so an advisory draft names no refusal.
  const blocked = checksDotState(groupChecksBySource(validation)) === "blocker";

  return (
    <div {...stylex.props(styles.group)}>
      {/* The checks rail's collapsed form, not a second summary component: one
          count, read off one `validation.issues[]`, so the nav and the Checks
          tab can never disagree. */}
      <ChecksRail validation={validation} canPublish={canPublish} collapsed onOpen={onOpenChecks} />
      <button type="button" className="btn btn-secondary" disabled={actions.saving} onClick={actions.save}>
        {actions.saving ? t("draftToolbar.saving") : t("draftToolbar.save")}
      </button>
      <button ref={discardTriggerRef} type="button" className="btn btn-ghost" onClick={actions.discard}>
        {t("draftToolbar.discard")}
      </button>
      <PublishNavControl
        canPublish={canPublish}
        publishing={actions.publishing}
        onPublish={actions.publish}
        triggerRef={publishTriggerRef}
      />

      {actions.pendingDialog === "publish" && (
        <PublishConfirmDialog
          processLabel={processLabel}
          processId={processId}
          revision={revision}
          nextVersion={nextVersionLabel(baseVersion)}
          dirty={isDirty}
          openIssues={validation.issues.length}
          blocked={blocked}
          triggerRef={publishTriggerRef}
          error={actions.error}
          busy={actions.saving || actions.publishing}
          onCancel={() => actions.resolveDialog(false)}
          onConfirm={() => actions.resolveDialog(true)}
        />
      )}
      {actions.pendingDialog === "discard" && (
        <DiscardConfirmDialog
          processLabel={processLabel}
          revision={revision}
          lastSavedAt={lastSavedAt}
          triggerRef={discardTriggerRef}
          error={actions.error}
          busy={false}
          onCancel={() => actions.resolveDialog(false)}
          onConfirm={() => actions.resolveDialog(true)}
        />
      )}
    </div>
  );
}
