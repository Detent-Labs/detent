import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { areaHref, type NavigateOptions } from "../../../shell/routing.js";

interface Props {
  revision: number;
  isDirty: boolean;
  lastSavedAt: Date | undefined;
  publishResult: PublishResult | null;
  /** `saveState.conflict` — the caller already owns `saveState`, so this
   * stays a plain pass-through rather than a second copy. Drives the
   * conflict banner below, which renders inline in the header row, outside
   * the closed `⋮` menu (design.md: "DraftToolbar's ... save-conflict
   * banner (with its Reload action) ... stay inline in the header row"). */
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
   * "Threading `go` down to the link"). */
  processId: string;
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
 * `DraftToolbar`'s error message, its
 * save-conflict banner and its publish-success confirmation (the published
 * summary field above) all stay outside the menu, in the header row itself
 * — a closed menu must never hide the one moment a conflict most needs
 * attention (design.md).
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
  go,
}: Props) {
  const { draft, mutate, contentLocale, setContentLocale } = useDraft();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
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
            <button
              type="button"
              role="menuitem"
              disabled={actions.publishing}
              onClick={() => runMenuAction(actions.publish)}
            >
              {actions.publishing ? t("draftToolbar.publishing") : t("draftToolbar.publish")}
            </button>

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

      {actions.error && <p className="studio-error">{actions.error}</p>}
      {conflict && (
        <p className="studio-conflict">
          {t("draftToolbar.conflictMessage")}{" "}
          <button type="button" className="btn btn-secondary" onClick={actions.reload}>
            {t("draftToolbar.conflictReload")}
          </button>
        </p>
      )}
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
  );
}
