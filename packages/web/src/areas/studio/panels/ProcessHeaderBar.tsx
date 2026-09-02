import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { MoreVertical, Users2 } from "lucide-react";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { resolveBaseLocaleChange } from "../screens/processHeaderLogic.js";
import { missingTranslationWarning, resolveDraftLocalizedText } from "../draft/localized-text";
import { deriveKey, shouldAutoDeriveKey } from "../draft/deriveKey.js";
import { ContentLocaleBadge, AddLocaleControl } from "./shared/ContentLocaleSwitcher.js";
import { LocalizedTextInput } from "./shared/LocalizedTextInput.js";
import { IssueList } from "./shared/IssueList.js";
import type { DraftToolbarActions } from "./DraftToolbar.js";
import type { PublishResult } from "../api/types.js";
import { publishAvailability, nextVersionLabel } from "../screens/draftToolbarState.js";
import { areaHref, type NavigateOptions } from "../../../shell/routing.js";

/** The Publish item points `aria-describedby` here when the permission is
 * absent. One header bar renders per screen, so one constant id suffices. */
const PUBLISH_REASON_ID = "studio-publish-unavailable-reason";

/**
 * The `⋮` menu's Publish item, with the reason line that renders beneath it
 * when the permission is absent (studio-publish: "The studio offers Publish
 * only where the engine would admit it, and names the reason otherwise").
 *
 * A component of its own because the gate and its reason are one concept: the
 * `role="group"` wrapper, the `aria-disabled` item, the reason line and the
 * `aria-describedby` that binds them have to stay together or the reason
 * reaches nobody. `ProcessHeaderBar` is its only production caller. The export
 * is there so `studio-processHeaderBar-publishGate.test.tsx` can render it —
 * `menuOpen` is `ProcessHeaderBar`'s own state, and `renderToStaticMarkup`
 * fires no click, so the panel's markup is unreachable from a render of the
 * header itself.
 *
 * `aria-disabled`, not the native `disabled` attribute, for the permission
 * state: a natively disabled button takes no focus, so nothing ever reads its
 * `aria-describedby` and the reason a blind developer needs is the one they
 * never hear. The pending disable beside it stays native — a request in flight
 * is a different state, and it carries no reason to read. The reason is text,
 * never a `title`: a tooltip reaches neither the keyboard nor a screen reader.
 *
 * A `role="menu"` admits `menuitem`, `group` and `separator` as children, and
 * a bare span is none of those, so the item and its reason sit in a group.
 */
export function PublishMenuItem({ canPublish, publishing, onPublish }: { canPublish: boolean; publishing: boolean; onPublish: () => void }) {
  const gate = publishAvailability(canPublish);
  return (
    <div role="group">
      <button
        type="button"
        role="menuitem"
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
        <span id={PUBLISH_REASON_ID} className="studio-header-bar-menu-label">
          {t(gate.reasonKey)}
        </span>
      )}
    </div>
  );
}

/**
 * Opens a mounted confirmation dialog modally, puts the initial focus on its
 * declining control, and returns focus to the `⋮` trigger when it closes.
 *
 * Three separate mechanisms, because none of them alone holds:
 *
 * The `autoFocus` prop states the intent and is the property a rendered string
 * carries, so `studio-processHeaderBar-publishGate.test.tsx` can assert it. On
 * the client it is NOT an attribute: React 19 skips it in `setProp` and calls
 * `.focus()` from `commitMount` instead.
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
  /** The `⋮` trigger that opened this dialog, for the focus return above. */
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
 * dialog that names the version and its immutability"). It replaces both
 * native prompts the publish path used to raise: the save prompt a dirty draft
 * raised, and nothing at all for the publish itself.
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
  error,
  busy,
  triggerRef,
  onCancel,
  onConfirm,
}: ConfirmDialogProps & { processId: string; nextVersion: string; dirty: boolean }) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);

  return (
    <dialog ref={ref} className="studio-dialog" aria-labelledby="publish-confirm-heading" onCancel={onCancel}>
      <h2 id="publish-confirm-heading">{t("draftToolbar.publishDialogHeading")}</h2>
      <dl className="studio-dialog-facts">
        <dt>{t("draftToolbar.dialogProcess")}</dt>
        <dd>{processLabel}</dd>
        <dt>{t("draftToolbar.dialogProcessId")}</dt>
        <dd>
          <code>{processId}</code>
        </dd>
        <dt>{t("draftToolbar.dialogRevision")}</dt>
        <dd>{revision}</dd>
        {/* "Next version", not "Version": the engine assigns the number, and
            another environment can promote one between this load and this
            publish. The header's own published stamp reports what the engine
            actually assigned. */}
        <dt>{t("draftToolbar.publishDialogNextVersion")}</dt>
        <dd>
          <code>{nextVersion}</code>
        </dd>
      </dl>
      {dirty && <p className="studio-dialog-note">{t("draftToolbar.publishDialogUnsaved")}</p>}
      <p className="studio-dialog-note">{t("draftToolbar.publishDialogImmutable")}</p>
      {error !== null && (
        <p className="studio-error studio-json-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-controls">
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
function DiscardConfirmDialog({ processLabel, revision, lastSavedAt, error, busy, triggerRef, onCancel, onConfirm }: ConfirmDialogProps & { lastSavedAt: Date | undefined }) {
  const { ref, declineRef } = useConfirmDialog(triggerRef);

  return (
    <dialog ref={ref} className="studio-dialog" aria-labelledby="discard-confirm-heading" onCancel={onCancel}>
      <h2 id="discard-confirm-heading">{t("draftToolbar.discardDialogHeading")}</h2>
      <dl className="studio-dialog-facts">
        <dt>{t("draftToolbar.dialogProcess")}</dt>
        <dd>{processLabel}</dd>
        <dt>{t("draftToolbar.dialogRevision")}</dt>
        <dd>{revision}</dd>
        {lastSavedAt && (
          <>
            <dt>{t("draftToolbar.discardDialogLastSaved")}</dt>
            <dd>{lastSavedAt.toLocaleTimeString()}</dd>
          </>
        )}
      </dl>
      <p className="studio-dialog-note">{t("draftToolbar.discardDialogKeepsPublished")}</p>
      {error !== null && (
        <p className="studio-error studio-json-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-controls">
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
  revision: number;
  isDirty: boolean;
  lastSavedAt: Date | undefined;
  publishResult: PublishResult | null;
  /** `saveState.conflict` — the caller already owns `saveState`, so this
   * stays a plain pass-through rather than a second copy. Drives the conflict
   * banner below, which renders as a block after the header row and outside
   * the closed `⋮` menu: a closed menu must never hide the one moment a
   * conflict most needs attention. */
  conflict: boolean;
  /** `useDraftToolbarActions`'s own return value, lifted by the caller the
   * same way `saveState` already is (design.md: "EditorArea lifts those
   * handlers into ProcessHeaderBar's ⋮ menu, the same way it already lifts
   * saveState"). The menu calls these; it holds no save/discard/publish
   * logic of its own. */
  actions: DraftToolbarActions;
  /** A slot for `EditScreen.tsx`'s existing Structure/JSON `role="tablist"`
   * (task 4.2) — this component renders it wherever the header row's own
   * layout puts it and owns no surface state itself. */
  surfaceToggle?: ReactNode;
  /** True while the Structure surface is active. Gates the "Process, saved
   * with the draft" menu group alone: the process key, base locale, label,
   * and add-locale control all call `mutate()` directly, and
   * `studio-json-view` requires every draft-body-mutating control stay
   * unreachable while the JSON surface is active — the same rule that kept
   * the old `ProcessHeader` fieldset Structure-only. Save/Discard/Publish and
   * the content-locale switch mutate nothing the JSON surface itself edits,
   * so that spec names them exempt and this component renders them
   * regardless of `structureActive`. */
  structureActive: boolean;
  /** The open process's id, threaded down for the "Manage assignment groups
   * for this process" link's `processId` query parameter (design.md:
   * "Threading `go` down to the link"), and named in the publish dialog's own
   * fact list, since the engine matches it exactly. */
  processId: string;
  /** The loaded draft's own `canPublish` report, folded with whatever
   * `reload()` last re-read (`EditScreen.tsx`). Never a role check: neither
   * authoring role implies the publish permission, and a scoped grant reaches
   * it without either role (process-drafts). */
  canPublish: boolean;
  /** The published version this draft sits on, already folded with any publish
   * this session made. The publish dialog names the next number from it. */
  baseVersion: number | null;
  /** Cross-area navigation. The link is the only user: it calls
   * `go(href)` to reach the admin area's Groups screen — never a mutation. */
  go: (href: string, opts?: NavigateOptions) => void;
}

/**
 * The process-identity header bar (studio-canvas: "A process-identity
 * header bar shows draft and publish status"). The name, the revision
 * badge, the dirty/saved state, the last-saved time and the published
 * version stay a read-only pass-through of state `EditorArea` owns — no
 * logic of their own, same as before this change.
 *
 * The `⋮` menu is new. It renders `DraftToolbar`'s Save, Discard draft and
 * Publish actions (via `actions`, design.md: "DraftToolbar keeps its logic.
 * ProcessHeaderBar renders the buttons."), plus one group, "Process, saved
 * with the draft" (the editable key and the base-locale and add-locale
 * controls). That group renders only while the Structure surface is active
 * (`structureActive`).
 * `DraftToolbar`'s error message and its save-conflict banner render as
 * alert banners after the header row, and its publish-success confirmation
 * (the published summary field above) stays in the row. All three sit outside
 * the menu — a closed menu must never hide the one moment a conflict most
 * needs attention (design.md).
 *
 * The process label's own `LocalizedTextInput` and missing-translation
 * warning — `ProcessHeader`'s third field, beside key and baseLocale — stay
 * in the header row's own `<h1>`, not the menu (studio-app: "Every inline
 * missing-translation warning SHALL survive the move ... the process label,
 * which stays on the screen"). Unlike key and baseLocale, the label is one
 * of the six sites that requirement names as staying always visible, not
 * moving into a disclosure — so it is the one field this menu does NOT
 * carry.
 */
export function ProcessHeaderBar({
  revision,
  isDirty,
  lastSavedAt,
  publishResult,
  conflict,
  actions,
  surfaceToggle,
  structureActive,
  processId,
  canPublish,
  baseVersion,
  go,
}: Props) {
  const { draft, mutate, contentLocale, setContentLocale } = useDraft();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // The control that opens both confirmation dialogs, and so the control focus
  // returns to when either closes.
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocument = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** Same decision `EditScreen.tsx`'s `ProcessHeader` makes today, reused
   * here via the same pure `resolveBaseLocaleChange` rather than
   * reimplemented (see that function's own doc for why a malformed typed
   * value leaves the content locale where it is). */
  const changeBaseLocale = (typed: string) => {
    const change = resolveBaseLocaleChange(typed, contentLocale);
    mutate((d) => {
      d.baseLocale = change.baseLocale;
    });
    setContentLocale(change.contentLocale);
  };

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const dialogOpen = actions.pendingDialog !== null;
  const processLabel = resolveDraftLocalizedText(draft.label, contentLocale, draft.baseLocale ?? "en") ?? t("headerBar.unnamedProcess");

  return (
    <>
    <header className="studio-header-bar">
      {/* The one h1 this route renders (task 5.1 removed the screen's old
          generic "Process Studio" <h1>, the duplicate-status pair
          proposal.md names as the problem this change fixes): every other
          studio screen's own h1 already names that screen's specific
          content the same way (Player, Versions, Tools), and this names the
          loaded process.

          Editable, not read-only text: studio-app's "canvas-primary
          surface" requirement lists the process label as one of six
          LocalizedTextInput sites and requires it "stays on the screen" —
          unlike a step's label or a field's label, which move into a
          disclosure or the shared modal. The old ProcessHeader fieldset's
          label input lives here now, inline, never behind the ⋮ menu.

          `disabled` while the JSON surface is active, not conditionally
          rendered: this header renders on both surfaces (DraftToolbar and
          the content-locale switcher both "remain visible and usable
          regardless of which surface is active", studio-json-view), but the
          process header itself is explicitly named there as one of the
          draft-body-mutating components that SHALL NOT stay reachable while
          JSON is active — unlike those two, this field does call
          `mutate()`. A disabled input drops out of the tab order and fires
          no onChange, so it satisfies "not reachable" while still showing
          the current value. */}
      <h1 className="studio-header-bar-name">
        <LocalizedTextInput
          value={draft.label}
          placeholder={t("headerBar.unnamedProcess")}
          disabled={!structureActive}
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
        <p className="studio-warning">{missingTranslationWarning(draft.label, contentLocale, draft.baseLocale)}</p>
      )}
      {/* Read-only; the editable key control lives in the ⋮ menu's "Process,
          saved with the draft" group. studio-canvas's header-bar requirement
          names this display explicitly: "the process name and the key in
          the mono face." */}
      {draft.key && <span className="studio-header-bar-key">{draft.key}</span>}
      <IssueList entityId="process" />
      <span className="studio-header-bar-badge">
        {t("headerBar.revision")} {revision}
      </span>
      <span className={isDirty ? "studio-header-bar-dirty" : "studio-header-bar-saved"}>
        {isDirty ? t("headerBar.unsaved") : t("headerBar.saved")}
      </span>
      {!isDirty && lastSavedAt && (
        <span className="studio-header-bar-timestamp">
          {t("headerBar.lastSaved")} {lastSavedAt.toLocaleTimeString()}
        </span>
      )}
      {publishResult && (
        <span className="studio-header-bar-published">
          {t("headerBar.published")} v{publishResult.version} ({publishResult.definitionHash.slice(0, 12)})
        </span>
      )}

      <ContentLocaleBadge />
      {surfaceToggle}

      <div className="studio-header-bar-menu" ref={menuRef}>
        <button
          ref={menuTriggerRef}
          type="button"
          className="btn btn-secondary studio-header-bar-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("headerBar.menuTrigger")}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="studio-header-bar-menu-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={actions.saving}
              onClick={() => runMenuAction(actions.save)}
            >
              {actions.saving ? t("draftToolbar.saving") : t("draftToolbar.save")}
            </button>
            <button type="button" role="menuitem" onClick={() => runMenuAction(actions.discard)}>
              {t("draftToolbar.discard")}
            </button>
            <PublishMenuItem canPublish={canPublish} publishing={actions.publishing} onPublish={() => runMenuAction(actions.publish)} />

            {/* The group itself, and AddLocaleControl inside it, render on
                both surfaces: add-locale only calls setContentLocale (view
                state), never mutate() — studio-json-view names "the
                content-locale switcher" (both halves, this is one of them)
                exempt from the JSON-surface reachability ban, the same as
                DraftToolbar. Only key and baseLocale actually mutate the
                draft body, so only they are structureActive-gated within
                it. */}
            <div className="studio-header-bar-menu-group">
              <span className="studio-header-bar-menu-label">{t("headerBar.menuGroupDraft")}</span>
              {structureActive && (
                <>
                  <label className="studio-header-bar-menu-row">
                    key
                    <input
                      type="text"
                      value={draft.key ?? ""}
                      onChange={(e) =>
                        mutate((d) => {
                          d.key = e.target.value;
                        })
                      }
                    />
                  </label>
                  {/* Before label: baseLocale decides which entry of every
                      LocalizedText below it is mandatory, so the declaration
                      precedes the first localized value it governs (same
                      ordering the old ProcessHeader fieldset used). */}
                  <label className="studio-header-bar-menu-row">
                    baseLocale
                    <input type="text" value={draft.baseLocale ?? ""} onChange={(e) => changeBaseLocale(e.target.value)} />
                  </label>
                </>
              )}
              <AddLocaleControl />
              {/* Pure navigation, never gated by `structureActive`: it
                  mutates nothing the JSON surface itself edits, the same
                  exemption Save/Discard/Publish and the content-locale
                  switch already carry (studio-json-view). It renders for
                  any signed-in actor regardless of role — following it
                  without `system:admin` is the admin area's own
                  `mayEnter`/`ROUTE_ROLE` gate to decide, not this link's
                  concern (studio-canvas). */}
              <button
                type="button"
                className="btn btn-secondary studio-header-bar-menu-link"
                onClick={() => runMenuAction(() => go(`${areaHref("admin", "/groups")}?processId=${encodeURIComponent(processId)}`))}
              >
                <Users2 size={18} strokeWidth={1.75} aria-hidden="true" />
                {t("headerBar.manageGroups")}
              </button>
            </div>
          </div>
        )}
      </div>

      {publishResult && publishResult.findings.length > 0 && (
        <ul className="issue-list">
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
      </header>

      {/* Siblings of the header, not items inside it. The header is a wrapping
          flex row, so a bordered banner placed in it stays one more item on a
          wrapped line, beside ten badges — the exact rendering that let a 403
          reach the DOM and reach nobody. `.studio-edit-screen` is a flex
          column, so a block sibling needs no rule of its own; the
          `.draft-incomplete` paragraph is already one.

          Suppressed while a dialog is open: the dialog reports the same
          failure inside itself, and two alert regions for one failure announce
          it twice (spa-error-reporting). */}
      {!dialogOpen && actions.error && (
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{actions.error}</span>
        </div>
      )}
      {!dialogOpen && conflict && (
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{t("draftToolbar.conflictMessage")}</span>
          <button type="button" className="btn btn-secondary" onClick={actions.reload}>
            {t("draftToolbar.conflictReload")}
          </button>
        </div>
      )}

      {actions.pendingDialog === "publish" && (
        <PublishConfirmDialog
          processLabel={processLabel}
          processId={processId}
          revision={revision}
          nextVersion={nextVersionLabel(baseVersion)}
          dirty={isDirty}
          triggerRef={menuTriggerRef}
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
          triggerRef={menuTriggerRef}
          error={actions.error}
          busy={false}
          onCancel={() => actions.resolveDialog(false)}
          onConfirm={() => actions.resolveDialog(true)}
        />
      )}
    </>
  );
}
