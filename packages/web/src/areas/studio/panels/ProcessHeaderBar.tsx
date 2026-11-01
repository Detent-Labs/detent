import { useEffect, useRef, useState, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { FileJson, History, MoreVertical, Play, Trash2 } from "lucide-react";
import { colors, focus, fonts, space, shadow } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { collectUsedLocales, missingTranslationWarning, resolveDraftLocalizedText } from "../draft/localized-text";
import { deriveKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { LocalizedTextInput } from "./shared/LocalizedTextInput.js";
import { IssueList } from "./shared/IssueList.js";
import { useConfirmDialog } from "./shared/confirmDialog.js";
import { localeOptionLabel } from "./shared/ContentLocaleSwitcher.js";
import { PublishChanges } from "./PublishChanges.js";
import { checksDotState, groupChecksBySource } from "../draft/checksRail.js";
import { editingLocaleNote, formatSavedTime, headerStateLine, nextVersionLabel, publishAvailability, saveFocusTarget } from "../screens/draftToolbarState.js";
import type { DraftToolbarActions } from "./DraftToolbar.js";
import type { ValidationResult } from "../draft/validation.js";
import type { PublishResult } from "../api/types.js";
import type { Draft } from "../draft/types.js";

/** Every class this file's own markup renders, from `app.css`. */
const styles = stylex.create({
  headerBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s3,
    paddingBottom: space.s3,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    marginBottom: space.s3,
  },
  // Back, name, warning, issue sentence, state, Save, the note and the Versions
  // offer. It takes the row's free space from a zero basis and wraps inside
  // itself, so a control appearing here moves nothing in the trailing cluster.
  // The minimum basis keeps the name readable: where the row cannot give the
  // group that much beside the cluster, the cluster wraps under it.
  leading: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s3,
    flex: "1 1 0",
    minWidth: "min(24rem, 100%)",
  },
  backControl: {
    paddingLeft: 0,
    whiteSpace: "nowrap",
  },
  // The cap sits here, on the shrink-to-fit parent, so a long name leaves no
  // empty width between the input and the state line. The input inherits the
  // font, so `ch` reads the same on both.
  headerBarName: {
    margin: 0,
    minWidth: 0,
    maxWidth: "min(40ch, 100%)",
    fontFamily: fonts.heading,
    fontWeight: fonts.headingWeight,
    fontSize: "1rem",
    textTransform: "none",
    letterSpacing: "normal",
    color: colors.text,
  },
  // Strips the global input chrome so the process label reads as heading
  // text until focused; the global `input:focus-visible` rule still
  // supplies the accent ring on top of this border-bottom override.
  headerBarNameInput: {
    borderStyle: "none",
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: {
      default: colors.border,
      ":focus-visible": colors.accent,
    },
    borderRadius: 0,
    padding: 0,
    backgroundColor: "transparent",
    font: "inherit",
    color: "inherit",
    width: "auto",
    minWidth: "8ch",
    // Sizes to its text up to the `h1`'s cap. A browser with no `field-sizing`
    // keeps the input's default width.
    fieldSizing: "content",
    maxWidth: "100%",
  },
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
  },
  // The state line's own ground is the muted tone. Dirty words and a fresh
  // version each pick their own (`studio-canvas`, `studio-publish`).
  stateLine: {
    color: colors.textMuted,
  },
  stateDirty: {
    color: colors.refusal,
  },
  stateJustPublished: {
    color: colors.text,
  },
  stateVersion: {
    fontFamily: fonts.mono,
  },
  // Wraps the button group and the `⋮` menu as one flex item within
  // `headerBar`, so `headerBar`'s own wrap never splits them onto separate
  // lines with the menu stranded at the row's left edge. Only this outer
  // wrapper carries `marginLeft: "auto"` — an auto-margin on each of its two
  // children as well would split the row's free space between them and open
  // a gap. `flexWrap`/`justifyContent: flex-end` only matter in the rare
  // case where even this wrapper's own two children stop fitting one line;
  // both then stay right-aligned instead of the second one drifting left.
  trailingCluster: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.s2,
    flex: "0 1 auto",
    marginLeft: "auto",
  },
  draftActions: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
  // In flow, as the cluster's own leading item. The cluster is right-aligned
  // behind `marginLeft: auto`, so its right edge is pinned and it grows to
  // the LEFT: Publish holds its position with the line present and absent.
  // The 167px shift a line in flow once measured came from placing it beside
  // the cluster instead, where it ate the free space the auto-margin was
  // spending.
  //
  // Inside the cluster it also wraps with the cluster. A line ahead of the
  // cluster takes the auto-margin with it, and the cluster then strands at
  // the row's LEFT edge on every width where the row wraps — measured at
  // 1200, 1150, 1100, 1024, 960, 600, 500, 430 and 375.
  //
  // The out-of-flow placement that stood here read as a caption of the tab
  // row: pinned beneath the button, it crossed the header's own 2px bottom
  // border at mid-cap height and struck the sentence through.
  publishReason: {
    whiteSpace: "nowrap",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // The blocked reason names an issue the draft itself carries, the same fact
  // the Checks count already colors. The permission-denied reason keeps the
  // muted tone: it names an administrative fact about the actor instead.
  publishBlockedReason: {
    color: colors.refusal,
  },
  // `::backdrop` stays a literal fallback in `app.css`, which the
  // `studio-dialog` class beside this compiled style keeps matching. A long
  // change list scrolls inside the dialog, so its controls stay reachable.
  // The scroll box keeps the focus ring's reach clear at every edge.
  dialog: {
    maxWidth: "34rem",
    maxHeight: "85vh",
    overflowY: "auto",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    padding: `max(${space.s4}, ${focus.reach})`,
    scrollPadding: focus.reach,
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
  dialogLanguages: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // The machine values stand in a closed disclosure under the facts, in the
  // shape the Settings tab's Developer view takes.
  dialogDeveloper: {
    marginBlock: space.s3,
  },
  dialogDeveloperSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  dialogMono: {
    fontFamily: fonts.mono,
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
  headerBarMenu: {
    position: "relative",
  },
  headerBarMenuPanel: {
    position: "absolute",
    right: 0,
    top: `calc(100% + ${space.s1})`,
    // Above the field matrix's sticky headers, at 2 and 3, so a press on an
    // entry reaches that entry.
    zIndex: 4,
    minWidth: "16rem",
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    padding: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // One group of the menu. No top border: the label and the panel's gap divide
  // the two groups, and the panel's own border divides the first from whatever
  // is above the menu.
  headerBarMenuGroup: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  headerBarMenuLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  headerBarMenuLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.s2,
    width: "100%",
    // Overrides the global `.btn` class's centered text: the flex row above
    // already left-aligns the icon and label as items, but a label
    // long enough to wrap still centers its own wrapped line
    // without this, since text-align governs a flex item's own inline
    // content independently of the row's justify-content.
    textAlign: "left",
  },
  // A publish's findings, a block under the bar with the banners' own rhythm.
  findings: {
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
  },
  // `.studio-edit-screen > *` used to zero every direct child's own
  // top margin, since a flex column does not collapse adjacent ones the
  // way block layout does. This banner is always a non-first child of
  // that (now-compiled-away) column, so the zero moves here permanently.
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlockStart: 0,
    marginBlockEnd: space.s3,
    marginInline: 0,
  },
  errorBannerStamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
});

/** The Publish control points `aria-describedby` here whenever it carries a
 * reason. Two reach it: the permission is absent, or a blocking issue stands
 * in the draft. One header bar renders per screen, so one constant id
 * suffices. */
const PUBLISH_REASON_ID = "studio-publish-reason";

/**
 * The header bar's Publish control (studio-publish: "The studio offers
 * Publish only where the engine would admit it, and names the reason
 * otherwise"). `PublishReasonLine` below renders the reason itself, from its
 * own place on the header row.
 *
 * Two reasons exist. An absent permission makes the control unavailable. A
 * blocking issue in the draft leaves it available and operable: the click
 * still opens the confirmation dialog, which states the same warning. The
 * reason says so before the click rather than only after.
 *
 * The control and its reason stand in two places in the row, so
 * `aria-describedby` carries the binding alone. An id reference needs no DOM
 * adjacency, and `PUBLISH_REASON_ID` is the one constant both sides read.
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
  blocked,
  noStepYet = false,
  publishing,
  onPublish,
  triggerRef,
}: {
  canPublish: boolean;
  /** True when the draft's worst open issue is a blocker. Adds a hidden
   * reason; it leaves the control available and operable. */
  blocked: boolean;
  /** True when the draft has no step yet. Makes the control unavailable. */
  noStepYet?: boolean;
  publishing: boolean;
  onPublish: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const gate = publishAvailability(canPublish, blocked, noStepYet);
  return (
    <button
      ref={triggerRef}
      type="button"
      className="btn btn-primary"
      disabled={publishing}
      // `aria-disabled` and the click guard read availability, so the
      // blocked-but-permitted control stays operable. `aria-describedby`
      // reads the reason instead, so the blocked case's text reaches the
      // button the same way the permission case's does.
      aria-disabled={gate.available ? undefined : true}
      aria-describedby={gate.reasonKey ? PUBLISH_REASON_ID : undefined}
      onClick={() => {
        if (!gate.available) return;
        onPublish();
      }}
    >
      {publishing ? t("draftToolbar.publishing") : t("draftToolbar.publish")}
    </button>
  );
}

/**
 * The reason the Publish control carries, or nothing. It renders as the
 * action cluster's leading item, on the header row itself. The cluster's own
 * `marginLeft: auto` pins its trailing edge, so the cluster grows leftward
 * and no control moves (see `publishReason` above).
 *
 * The blocked reason takes the refusal tone. It names an issue the draft
 * carries, the same fact the Checks count colors. The permission-denied
 * reason keeps the muted tone: it names a fact about the actor instead.
 *
 * `publishAvailability` runs here a second time rather than taking a prop.
 * The function is pure over three booleans the header bar already holds, and a
 * threaded prop would let the button's reason and this line's reason drift.
 */
export function PublishReasonLine({
  canPublish,
  blocked,
  noStepYet = false,
}: {
  canPublish: boolean;
  blocked: boolean;
  noStepYet?: boolean;
}) {
  const gate = publishAvailability(canPublish, blocked, noStepYet);
  if (!gate.reasonKey) return null;
  return (
    <span
      id={PUBLISH_REASON_ID}
      {...stylex.props(
        styles.publishReason,
        gate.reasonKey === "draftToolbar.publishBlockedReason" && styles.publishBlockedReason,
      )}
    >
      {t(gate.reasonKey)}
    </span>
  );
}

interface ConfirmDialogProps {
  processLabel: string;
  revision: number;
  /** The nav control that opened this dialog, for `useConfirmDialog`'s focus return. */
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
  token,
  baseVersion,
  draft,
  contentLocale,
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
  token: string;
  baseVersion: number | null;
  draft: Draft;
  contentLocale: string;
  nextVersion: string;
  dirty: boolean;
  openIssues: number;
  blocked: boolean;
}) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);
  const dialogProps = stylex.props(styles.dialog);
  const languages = collectUsedLocales(draft);

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
        {/* "Next version", not "Version": the engine assigns the number, and
            another environment can promote one between this load and this
            publish. The header bar's state reports what the engine actually
            assigned. */}
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.publishDialogNextVersion")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>
          <code>{nextVersion}</code>
        </dd>
        {/* The same `validation.issues[]` the area nav's Checks control counts,
            so the dialog and the control can never disagree. */}
        <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.publishDialogOpenIssues")}</dt>
        <dd {...stylex.props(styles.dialogFactsDd)}>{openIssues}</dd>
        {/* A draft in one language has no language to name. Each language
            reads as the content-locale select's option does. */}
        {languages.length > 1 && (
          <>
            <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogLanguages")}</dt>
            <dd {...stylex.props(styles.dialogFactsDd)}>
              <ul {...stylex.props(styles.dialogLanguages)}>
                {languages.map((code) => (
                  <li key={code}>{localeOptionLabel(draft, code)}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <PublishChanges processId={processId} token={token} baseVersion={baseVersion} draft={draft} contentLocale={contentLocale} />
      </dl>
      <details {...stylex.props(styles.dialogDeveloper)}>
        <summary {...stylex.props(styles.dialogDeveloperSummary)}>{t("draftToolbar.dialogDeveloperView")}</summary>
        <dl {...stylex.props(styles.dialogFacts)}>
          {draft.key && (
            <>
              <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogKey")}</dt>
              <dd {...stylex.props(styles.dialogFactsDd, styles.dialogMono)}>{draft.key}</dd>
            </>
          )}
          <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogProcessId")}</dt>
          <dd {...stylex.props(styles.dialogFactsDd, styles.dialogMono)}>{processId}</dd>
          <dt {...stylex.props(styles.dialogFactsDt)}>{t("draftToolbar.dialogRevision")}</dt>
          <dd {...stylex.props(styles.dialogFactsDd, styles.dialogMono)}>{revision}</dd>
        </dl>
      </details>
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
        <button type="button" className="btn btn-secondary btn-destructive" onClick={onConfirm} disabled={busy}>
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

/**
 * The header bar's state (studio-canvas: "The header bar's state says what
 * holds for the draft"). `headerStateLine` picks the parts. One `role="status"`
 * span prints them, so a screen reader hears "Saved" when Save vanishes. Every
 * control beside the state stands after this span, never inside it.
 *
 * `tabIndex={-1}` lets the focus land here when a save's answer removes the
 * button that held it. Nothing else moves the focus here.
 */
function DraftStateLine({
  ref,
  dirty,
  lastSavedAt,
  baseVersion,
  justPublished,
}: {
  ref: RefObject<HTMLSpanElement | null>;
  dirty: boolean;
  lastSavedAt: Date | undefined;
  baseVersion: number | null;
  justPublished: boolean;
}) {
  const line = headerStateLine(dirty, lastSavedAt && formatSavedTime(lastSavedAt), baseVersion);
  const words =
    line.state === "unsaved"
      ? t("headerBar.unsaved")
      : line.state === "savedAt"
        ? t("headerBar.savedAt").replace("{time}", () => line.time ?? "")
        : t("headerBar.saved");
  // One catalog sentence around a mono version.
  const [beforeVersion, afterVersion] = t("headerBar.versionPublished").split("{version}");
  return (
    <span ref={ref} role="status" tabIndex={-1} {...stylex.props(styles.stateLine)}>
      <span {...stylex.props(dirty && styles.stateDirty)}>{words}</span>
      {line.version !== undefined && (
        <>
          {" · "}
          <span {...stylex.props(justPublished && styles.stateJustPublished)}>
            {beforeVersion}
            <span {...stylex.props(styles.stateVersion)} translate="no">
              {line.version}
            </span>
            {afterVersion}
          </span>
        </>
      )}
    </span>
  );
}

interface Props {
  revision: number;
  isDirty: boolean;
  lastSavedAt: Date | undefined;
  /** The last publish's answer in this session. The bar prints its findings. */
  publishResult: PublishResult | null;
  /** `saveState.conflict` — the caller already owns `saveState`, so this
   * stays a plain pass-through rather than a second copy. Drives the conflict
   * banner below, which renders as a block after the header row and outside
   * the closed `⋮` menu: a closed menu must never hide the one moment a
   * conflict most needs attention. */
  conflict: boolean;
  /** `useDraftToolbarActions`'s own return value, lifted by the caller the
   * same way `saveState` already is. The header bar reads it fully now: the
   * failure state for the banner below, and `save`/`discard`/`publish`/
   * `pendingDialog`/`resolveDialog` for the controls and the two dialogs. */
  actions: DraftToolbarActions;
  /** Gates the Publish control and names the reason when unavailable
   * (`studio-publish`). */
  canPublish: boolean;
  /** The published version the draft sits on. The state line prints it. The
   * publish dialog names the version a publish would mint from it, and compares
   * the draft with it. */
  baseVersion: number | null;
  /** Feeds the publish dialog's open-issue count and its blocked state — the
   * same groups the area nav's Checks control reads, so the two can never
   * disagree. */
  validation: ValidationResult;
  /** The draft's resolved display label, named in both confirmation
   * dialogs. */
  processLabel: string;
  /** True while a tab stands open, false while the JSON surface does. It
   * picks the JSON entry's label, disables the process label input and hides
   * the "Editing" note: `studio-json-view` requires every draft-body-mutating
   * control stay unreachable while the JSON surface is open, and that surface
   * reads no content locale. */
  structureActive: boolean;
  /** The open process's id, named in the publish dialog. */
  processId: string;
  /** The session token the publish dialog's base-body read sends. */
  token: string;
  /** True from a successful publish until the draft next changes. It takes the
   * version to the ink tone and raises the Versions offer (`studio-publish`). */
  justPublished: boolean;
  /** Leaves for the process list, through the leave guard. */
  onBack: () => void;
  /** Opens the Settings tab's Process view, from the "Editing" note. */
  onOpenSettings: () => void;
  /** Flips the JSON surface. `ProcessTabRow` keeps its own `jsonOpen` prop —
   * this menu derives the same fact from `structureActive` (`= !jsonOpen`)
   * instead of taking a second, redundant copy. */
  onToggleJson: () => void;
  onVersions: () => void;
  onPlayer: () => void;
}

/**
 * The process-identity header bar (studio-canvas: "The header bar holds back,
 * name, state, Test, Publish and the menu"). Two groups share the row. The
 * `leading` group holds the back control, the name, the state and whatever
 * stands beside the state. The trailing cluster holds Test, Publish and the
 * `⋮` trigger. No key, id, revision or hash prints here: those stand in the
 * Settings tab's Developer view.
 *
 * Save stands beside the state while the draft is dirty (`studio-process-tabs`).
 * While a save runs it reads "Saving…" and carries `aria-disabled` with a press
 * guard, so the button keeps the focus. A native `disabled` would blur it. When
 * the answer removes the button, the focus moves to the state line, not the
 * body. A ref set by the press limits that to this case.
 *
 * The Versions offer stands while `justPublished` does. The "Editing" note stands
 * while `editingLocaleNote` names a language. Both are controls after the state,
 * and neither moves the trailing cluster.
 *
 * The `⋮` menu carries two groups. "Views" holds the JSON surface toggle, Versions
 * and Player, navigation to other views of this process. "Draft" holds Discard
 * draft. The menu stays reachable whichever surface is active. The process
 * settings stand on the Settings tab. The studio's area nav carries no draft
 * control: the Checks tab's own count reports that state instead.
 *
 * The panel implements no arrow-key navigation, so it carries no
 * `role="menu"`; the trigger's `aria-haspopup="true"` names a plain
 * disclosure instead. Escape closes the panel and returns focus to
 * the trigger, the one thing a keyboard-only dismissal must do that an
 * outside click has no equivalent for.
 *
 * Save, Discard draft and Publish are wired to the same `actions`
 * (`useDraftToolbarActions`, called once by `EditScreen.tsx`) the error
 * banner below already reads. Both confirmation dialogs render here too. Publish
 * returns the focus to its own control. Discard draft's entry unmounts when the
 * menu closes, so its dialog returns the focus to the `⋮` trigger. Publish names
 * the process, its id, the revision, the next version, the open issue count and
 * the changes since the base version; Discard names the process, the revision
 * and the last-saved time.
 *
 * A publish's findings, the action error and the save-conflict banner all render
 * after the header row as block siblings. A closed menu must never hide the one
 * moment a conflict most needs attention.
 *
 * The process label's own `LocalizedTextInput` and missing-translation
 * warning stay in the header row's own `<h1>` (studio-app: "Every inline
 * missing-translation warning SHALL survive the move ... the process label,
 * which stays on the screen").
 */
export function ProcessHeaderBar({
  revision,
  isDirty,
  lastSavedAt,
  publishResult,
  conflict,
  actions,
  canPublish,
  baseVersion,
  validation,
  processLabel,
  structureActive,
  processId,
  token,
  justPublished,
  onBack,
  onOpenSettings,
  onToggleJson,
  onVersions,
  onPlayer,
}: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const publishTriggerRef = useRef<HTMLButtonElement>(null);
  const stateLineRef = useRef<HTMLSpanElement>(null);
  // Set by a press on Save, cleared once that save answers.
  const savePressedRef = useRef(false);

  // The blocking verdict the publish dialog states, from the same groups the
  // area nav's Checks control reads. The `view` group holds the studio's own
  // findings and refuses no publish, so an advisory draft names no refusal.
  const blocked = checksDotState(groupChecksBySource(validation), validation.noStepYet) === "blocker";

  useEffect(() => {
    if (!menuOpen) return;
    const onDocument = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    // Refocuses the trigger on Escape, unlike the outside-click close below:
    // a mouse dismissal has nowhere sensible to send focus, but a keyboard
    // dismissal must return it to the control that opened the menu, or a
    // keyboard-only user lands on `<body>` with no sense of where they are.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // A save's answer can unmount the button that holds the focus, which drops the
  // focus to the body. `saveFocusTarget` rules on it once the save has answered.
  useEffect(() => {
    if (actions.saving) return;
    const pressed = savePressedRef.current;
    savePressedRef.current = false;
    const target = saveFocusTarget({ pressed, clean: !isDirty, focusOnBody: document.activeElement === document.body });
    if (target === "stateLine") stateLineRef.current?.focus();
  }, [actions.saving, isDirty]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const dialogOpen = actions.pendingDialog !== null;

  const headerBarNameInputProps = stylex.props(styles.headerBarNameInput);
  const headerBarMenuLinkProps = stylex.props(styles.headerBarMenuLink);
  const backControlProps = stylex.props(styles.backControl);
  const editingLanguage = editingLocaleNote(contentLocale, draft.baseLocale, !structureActive);

  return (
    <>
    <header {...stylex.props(styles.headerBar)}>
      <div {...stylex.props(styles.leading)}>
        <button
          type="button"
          className={`btn btn-ghost ${backControlProps.className}`}
          style={backControlProps.style}
          aria-label={t("headerBar.backLabel")}
          onClick={onBack}
        >
          {t("headerBar.back")}
        </button>
        {/* The one h1 this route renders. Every other studio screen's own h1
            names that screen's content the same way (Player, Versions, Tools),
            and this names the loaded process.

            Editable: studio-app's "canvas-primary surface" requirement lists the
            process label as one of six LocalizedTextInput sites and requires it
            "stays on the screen".

            `disabled` while the JSON surface is active, not conditionally
            rendered: this header renders on both surfaces, but `studio-json-view`
            names the process header among the draft-body-mutating components
            that SHALL NOT stay reachable there, and this field calls `mutate()`.
            A disabled input drops out of the tab order and fires no onChange, so
            it satisfies "not reachable" while still showing the current value. */}
        <h1 {...stylex.props(styles.headerBarName)}>
          <LocalizedTextInput
            value={draft.label}
            placeholder={t("headerBar.unnamedProcess")}
            disabled={!structureActive}
            className={headerBarNameInputProps.className}
            style={headerBarNameInputProps.style}
            onChange={(next) => {
              const baseLocale = draft.baseLocale ?? "en";
              const priorDerivedKey = deriveKey(resolveDraftLocalizedText(draft.label, baseLocale, baseLocale) ?? "");
              const deriveNextKey = shouldAutoDeriveKey(draft.key ?? "", priorDerivedKey);
              mutate((d) => {
                d.label = next;
                if (deriveNextKey) {
                  d.key = deriveKey(resolveDraftLocalizedText(next, baseLocale, baseLocale) ?? "");
                }
              });
            }}
          />
        </h1>
        {missingTranslationWarning(draft.label, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.warning)}>{missingTranslationWarning(draft.label, contentLocale, draft.baseLocale)}</p>
        )}
        <IssueList entityId="process" />
        <DraftStateLine
          ref={stateLineRef}
          dirty={isDirty}
          lastSavedAt={lastSavedAt}
          baseVersion={baseVersion}
          justPublished={justPublished}
        />
        {isDirty && (
          <button
            type="button"
            className="btn btn-secondary"
            aria-disabled={actions.saving ? true : undefined}
            onClick={() => {
              if (actions.saving) return;
              savePressedRef.current = true;
              actions.save();
            }}
          >
            {actions.saving ? t("draftToolbar.saving") : t("draftToolbar.save")}
          </button>
        )}
        {editingLanguage !== undefined && (
          <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
            {t("headerBar.editingNote").replace("{language}", () => editingLanguage)}
          </button>
        )}
        {justPublished && (
          <button type="button" className="btn btn-ghost" onClick={onVersions}>
            {t("headerBar.versions")}
          </button>
        )}
      </div>

      {/* Test and Publish, right-aligned ahead of the `⋮` trigger
          (`studio-process-tabs`): always visible, never inside the menu, on
          every tab and while the JSON surface is active — this row renders
          unconditionally above the tab row regardless of `jsonOpen`. Wrapped
          together with the `⋮` menu below in one `trailingCluster` so a narrow
          viewport wraps them as a unit instead of stranding the menu alone at
          the row's left edge. */}
      <div {...stylex.props(styles.trailingCluster)}>
        {/* The cluster's leading item, so the reason reads on the row's own
            baseline beside the state it explains, wraps with the controls it
            belongs to, and leaves the row's 2px bottom border whole. */}
        <PublishReasonLine canPublish={canPublish} blocked={blocked} noStepYet={validation.noStepYet} />

        <div {...stylex.props(styles.draftActions)}>
          <button type="button" className="btn btn-secondary" onClick={onPlayer}>
            {t("headerBar.test")}
          </button>
          <PublishNavControl
            canPublish={canPublish}
            blocked={blocked}
            noStepYet={validation.noStepYet}
            publishing={actions.publishing}
            onPublish={actions.publish}
            triggerRef={publishTriggerRef}
          />
        </div>

        <div {...stylex.props(styles.headerBarMenu)} ref={menuRef}>
          <button
            type="button"
            className="btn btn-secondary studio-header-bar-menu-trigger"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={t("headerBar.menuTrigger")}
            ref={triggerRef}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div {...stylex.props(styles.headerBarMenuPanel)}>
              {/* Views: navigation to other views of this process, never a
                  draft-body mutation, so it stays reachable whichever surface is
                  active. Draft holds Discard draft. Save and Publish stand in
                  this row instead, and the process settings on the Settings tab
                  (`studio-process-tabs`). The panel holds command buttons alone
                  but implements no arrow-key navigation, so it carries no
                  `role="menu"`/`menuitem` pair. */}
              <div {...stylex.props(styles.headerBarMenuGroup)}>
                <span {...stylex.props(styles.headerBarMenuLabel)}>{t("headerBar.menuGroupViews")}</span>
                <button
                  type="button"
                  className={`btn btn-secondary ${headerBarMenuLinkProps.className}`}
                  style={headerBarMenuLinkProps.style}
                  onClick={() => runMenuAction(onToggleJson)}
                >
                  <FileJson size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t(structureActive ? "headerBar.jsonOpen" : "headerBar.jsonLeave")}
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary ${headerBarMenuLinkProps.className}`}
                  style={headerBarMenuLinkProps.style}
                  onClick={() => runMenuAction(onVersions)}
                >
                  <History size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t("headerBar.versions")}
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary ${headerBarMenuLinkProps.className}`}
                  style={headerBarMenuLinkProps.style}
                  onClick={() => runMenuAction(onPlayer)}
                >
                  <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t("headerBar.player")}
                </button>
              </div>
              <div {...stylex.props(styles.headerBarMenuGroup)}>
                <span {...stylex.props(styles.headerBarMenuLabel)}>{t("headerBar.menuGroupDraft")}</span>
                <button
                  type="button"
                  className={`btn btn-secondary btn-destructive ${headerBarMenuLinkProps.className}`}
                  style={headerBarMenuLinkProps.style}
                  onClick={() => runMenuAction(actions.discard)}
                >
                  <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                  {t("draftToolbar.discard")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {actions.pendingDialog === "publish" && (
        <PublishConfirmDialog
          processLabel={processLabel}
          processId={processId}
          token={token}
          baseVersion={baseVersion}
          draft={draft}
          contentLocale={contentLocale}
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
          triggerRef={triggerRef}
          error={actions.error}
          busy={false}
          onCancel={() => actions.resolveDialog(false)}
          onConfirm={() => actions.resolveDialog(true)}
        />
      )}

      </header>

      {publishResult && publishResult.findings.length > 0 && (
        <ul className={`issue-list ${stylex.props(styles.findings).className}`}>
          {publishResult.findings.map((f, i) => (
            <li key={i} className="issue issue-finding">
              {t("headerBar.findingPrefix")} {f.dataSourceId ?? f.loc}: {f.reference} (
              {f.carriedByVersions.length > 0
                ? `${t("headerBar.findingCarriedBy")} v${f.carriedByVersions.join(", v")}, ${f.liveInstanceCountOutsideCarryingVersions} ${t("headerBar.findingLiveElsewhere")}`
                : t("headerBar.findingCarriedByNone")}
              )
            </li>
          ))}
        </ul>
      )}

      {/* Siblings of the header, not items inside it. The header is a wrapping
          flex row, so a bordered banner placed in it stays one more item on a
          wrapped line — the exact rendering that let a 403 reach the DOM and
          reach nobody. `.studio-edit-screen` is a flex column, so a block
          sibling needs no rule of its own; the `.draft-incomplete` paragraph
          is already one.

          Suppressed while a dialog is open: the dialog reports the same
          failure inside itself, and two alert regions for one failure announce
          it twice (spa-error-reporting). */}
      {!dialogOpen && actions.error && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{actions.error}</span>
        </div>
      )}
      {!dialogOpen && conflict && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{t("draftToolbar.conflictMessage")}</span>
          <button type="button" className="btn btn-secondary" onClick={actions.reload}>
            {t("draftToolbar.conflictReload")}
          </button>
        </div>
      )}
    </>
  );
}
