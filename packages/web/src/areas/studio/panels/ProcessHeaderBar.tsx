import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { FileJson, History, MoreVertical, Play, Users2 } from "lucide-react";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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
  headerBarName: {
    margin: 0,
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
  },
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.accent400,
    paddingLeft: space.s2,
  },
  headerBarKey: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  headerBarBadge: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  headerBarDirty: {
    color: colors.refusal,
  },
  headerBarSaved: {
    color: colors.textMuted,
  },
  headerBarTimestamp: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  headerBarPublished: {
    fontFamily: fonts.mono,
    color: colors.text,
  },
  headerBarMenu: {
    position: "relative",
    marginLeft: "auto",
  },
  headerBarMenuPanel: {
    position: "absolute",
    right: 0,
    top: `calc(100% + ${space.s1})`,
    zIndex: 1,
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
  headerBarMenuGroup: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    paddingTop: space.s2,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  headerBarMenuLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  headerBarMenuRow: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.85rem",
  },
  headerBarMenuLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.s2,
    width: "100%",
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
   * same way `saveState` already is. The header bar reads its failure state
   * alone: Save, Discard draft and Publish stand in the studio's area nav
   * now, and `DraftNavControls` calls them there. */
  actions: DraftToolbarActions;
  /** True while a tab stands open. Gates the "Process, saved with the draft"
   * menu group alone: the process key, base locale, label, and add-locale
   * control all call `mutate()` directly, and `studio-json-view` requires
   * every draft-body-mutating control stay unreachable while the JSON surface
   * is open. The content-locale switch mutates nothing that surface edits, so
   * that spec names it exempt and this component renders it either way. */
  structureActive: boolean;
  /** The open process's id, threaded down for the "Manage assignment groups
   * for this process" link's `processId` query parameter (design.md:
   * "Threading `go` down to the link"). */
  processId: string;
  /** Cross-area navigation. The link is the only user: it calls
   * `go(href)` to reach the admin area's Groups screen — never a mutation. */
  go: (href: string, opts?: NavigateOptions) => void;
  /** Flips the JSON surface. `ProcessTabRow` keeps its own `jsonOpen` prop —
   * this menu derives the same fact from `structureActive` (`= !jsonOpen`)
   * instead of taking a second, redundant copy. */
  onToggleJson: () => void;
  onVersions: () => void;
  onPlayer: () => void;
}

/**
 * The process-identity header bar (studio-canvas: "A process-identity
 * header bar shows draft and publish status"). The name, the revision
 * badge, the dirty/saved state, the last-saved time and the published
 * version stay a read-only pass-through of state the process surface owns —
 * no logic of their own.
 *
 * The `⋮` menu carries two groups. "Process, saved with the draft" holds
 * the editable key, the base locale, the add-locale control and the link to
 * the admin area's assignment groups. "Views" holds the JSON surface toggle,
 * Versions and Player — navigation to other views of this process, so
 * unlike the first group it stays reachable whichever surface is active.
 * The menu carries no Save, no Discard and no Publish. Those four stand in
 * the studio's area nav, beside Checks (`studio-process-tabs`).
 *
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
  structureActive,
  processId,
  go,
  onToggleJson,
  onVersions,
  onPlayer,
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

  const dialogOpen = actions.pendingDialog !== null;

  const headerBarNameInputProps = stylex.props(styles.headerBarNameInput);
  const headerBarMenuLinkProps = stylex.props(styles.headerBarMenuLink);

  return (
    <>
    <header {...stylex.props(styles.headerBar)}>
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
      {/* Read-only; the editable key control lives in the ⋮ menu's "Process,
          saved with the draft" group. studio-canvas's header-bar requirement
          names this display explicitly: "the process name and the key in
          the mono face." */}
      {draft.key && <span {...stylex.props(styles.headerBarKey)}>{draft.key}</span>}
      <IssueList entityId="process" />
      <span {...stylex.props(styles.headerBarBadge)}>
        {t("headerBar.revision")} {revision}
      </span>
      <span {...stylex.props(isDirty ? styles.headerBarDirty : styles.headerBarSaved)}>
        {isDirty ? t("headerBar.unsaved") : t("headerBar.saved")}
      </span>
      {!isDirty && lastSavedAt && (
        <span {...stylex.props(styles.headerBarTimestamp)}>
          {t("headerBar.lastSaved")} {lastSavedAt.toLocaleTimeString()}
        </span>
      )}
      {publishResult && (
        <span {...stylex.props(styles.headerBarPublished)}>
          {t("headerBar.published")} v{publishResult.version} ({publishResult.definitionHash.slice(0, 12)})
        </span>
      )}

      <ContentLocaleBadge />

      <div {...stylex.props(styles.headerBarMenu)} ref={menuRef}>
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
          <div {...stylex.props(styles.headerBarMenuPanel)} role="menu">
            {/* One group and nothing beside it (`studio-process-tabs`: the
                header bar's own menu carries none of the area nav's four
                controls). AddLocaleControl renders on both surfaces:
                add-locale only calls setContentLocale (view state), never
                mutate() — studio-json-view names "the content-locale
                switcher" exempt from the JSON-surface reachability ban. Only
                key and baseLocale actually mutate the draft body, so only
                they are structureActive-gated within it. */}
            <div {...stylex.props(styles.headerBarMenuGroup)}>
              <span {...stylex.props(styles.headerBarMenuLabel)}>{t("headerBar.menuGroupDraft")}</span>
              {structureActive && (
                <>
                  <label {...stylex.props(styles.headerBarMenuRow)}>
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
                  <label {...stylex.props(styles.headerBarMenuRow)}>
                    baseLocale
                    <input type="text" value={draft.baseLocale ?? ""} onChange={(e) => changeBaseLocale(e.target.value)} />
                  </label>
                </>
              )}
              <AddLocaleControl />
              {/* Pure navigation, never gated by `structureActive`: it
                  mutates nothing the JSON surface itself edits, the same
                  exemption the content-locale switch already carries
                  (studio-json-view). It renders for
                  any signed-in actor regardless of role — following it
                  without `system:admin` is the admin area's own
                  `mayEnter`/`ROUTE_ROLE` gate to decide, not this link's
                  concern (studio-canvas). */}
              <button
                type="button"
                className={`btn btn-secondary ${headerBarMenuLinkProps.className}`}
                style={headerBarMenuLinkProps.style}
                onClick={() => runMenuAction(() => go(`${areaHref("admin", "/groups")}?processId=${encodeURIComponent(processId)}`))}
              >
                <Users2 size={18} strokeWidth={1.75} aria-hidden="true" />
                {t("headerBar.manageGroups")}
              </button>
            </div>
            {/* What the tab row's own overflow menu carried before this
                menu absorbed it: navigation to other views of the same
                process, never a draft-body mutation, so it stays reachable
                whichever surface is active — unlike the group above. */}
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
