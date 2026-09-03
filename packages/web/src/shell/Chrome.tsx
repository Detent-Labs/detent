import { useId, useRef, useState, type ReactNode, type ToggleEvent } from "react";
import { t } from "./catalog.js";
import { permittedAreas, type Area } from "./areas.js";
import { accountName } from "./accountName.js";
import type { Session } from "./session.js";
import type { UiLocale } from "../i18n/locale.js";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";

/** `.shell-header` and `.shell-tab` from `shell.css`, as StyleX. The header's
 * one narrow-viewport rule sits on the property it changes. */
const styles = stylex.create({
  header: {
    display: "flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: space.s3,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    backgroundColor: colors.surfaceMuted,
    flexWrap: { default: "nowrap", "@media (max-width: 30rem)": "wrap" },
  },
  tab: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: colors.accentContrast,
    backgroundColor: colors.accent,
    paddingBlock: space.s1,
    paddingLeft: space.s2,
    // Cut corners on the leading edge: a tab slotted into the register, not a pill.
    clipPath: "polygon(0 0, 100% 0, calc(100% - 0.4rem) 100%, 0 100%)",
    paddingRight: `calc(${space.s2} + 0.4rem)`,
  },
});

interface ChromeProps {
  /**
   * The open area, or `"profile"` for the one page that belongs to no area.
   * The switcher filters this value out of the permitted set, and `"profile"`
   * is in no actor's, so the profile page lists every area that actor may enter.
   */
  area: Area | "profile";
  roles: readonly string[];
  /** Sourced for the header's identity span; the display name, or the actorId fallback. */
  session: Pick<Session, "displayName" | "actorId">;
  locale: UiLocale;
  onLocaleChange: (locale: UiLocale) => void;
  onLogout: () => void;
  onGoToArea: (area: Area) => void;
  onGoToProfile: () => void;
  /** The area's own navigation, rendered on the left of the one header row. */
  nav?: ReactNode;
  children: ReactNode;
}

/** Mirrors `--space-1`: the gap `.shell-menu` sat below the trigger by under the old `top: calc(100% + var(--space-1))` rule. */
const MENU_GAP_PX = 4;

/**
 * The one header. Left: the register tab naming the open area, then that area's
 * own navigation. Right: the account menu, holding the profile entry, language,
 * the area switcher and logout.
 *
 * The switcher lists only the other areas this actor may see and is absent
 * entirely for an actor permitted one area, so a participant sees no trace of
 * the consolidation. Current location shows in the URL prefix and the tab, not
 * as a separate label.
 *
 * The menu opens and dismisses through the native Popover API rather than a
 * hand-rolled outside-click/Escape listener: `popover="auto"` on the menu,
 * `popoverTarget`/`popoverTargetAction` on the trigger. Light dismiss (an
 * outside pointer interaction, or Escape) and focus return to the trigger both
 * come from the platform. The menu mounts unconditionally — the UA stylesheet's
 * `[popover]:not(:popover-open) { display: none }` hides it while closed, the
 * same visibility the old `{open && (...)}` guard gave it, and a
 * `popoverTarget` trigger needs its target present in the DOM at all times to
 * resolve it.
 */
export function Chrome({ area, roles, session, locale, onLocaleChange, onLogout, onGoToArea, onGoToProfile, nav, children }: ChromeProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The Popover API wires no ARIA state of its own, so `aria-expanded` stays
  // hand-set here, driven by the same toggle that opens/closes the popover.
  const [expanded, setExpanded] = useState(false);
  const others = permittedAreas(roles).filter((a) => a !== area);
  const identity = accountName(session);

  // Fires on both directions of the toggle; only the opening edge needs a
  // position. The popover's own top-layer promotion strips `.shell-menu`'s old
  // CSS anchoring to `.shell-account` (see shell.css), so the menu's position
  // is computed here instead, off the trigger's live rect, each time it opens.
  const onMenuBeforeToggle = (e: ToggleEvent<HTMLDivElement>) => {
    setExpanded(e.newState === "open");
    if (e.newState !== "open") return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || !menuRef.current) return;
    menuRef.current.style.position = "fixed";
    menuRef.current.style.top = `${rect.bottom + MENU_GAP_PX}px`;
    menuRef.current.style.right = `${window.innerWidth - rect.right}px`;
  };

  return (
    <div className="shell">
      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.tab)}>{t(locale, `area.${area}`)}</span>
        {nav}
        <div className="shell-account-group">
          <span className={identity.mono ? "shell-account-name shell-account-name-id" : "shell-account-name"} title={identity.text}>
            {identity.text}
          </span>
          <div className="shell-account">
            <button
              ref={triggerRef}
              type="button"
              className="btn btn-secondary shell-account-button"
              aria-expanded={expanded}
              aria-haspopup="menu"
              popoverTarget={menuId}
              popoverTargetAction="toggle"
            >
              {t(locale, "account.menu")}
            </button>
            <div id={menuId} ref={menuRef} className="shell-menu" role="menu" popover="auto" onBeforeToggle={onMenuBeforeToggle}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  // Load-bearing: clicking this while already on `/profile`
                  // re-renders inside the same `Chrome` instance, with no
                  // unmount, so nothing else would close the menu. Native
                  // light-dismiss fires only on a pointer interaction outside
                  // the popover, never on a click of a control inside it.
                  menuRef.current?.hidePopover();
                  onGoToProfile();
                }}
              >
                {t(locale, "account.profile")}
              </button>
              <label className="shell-menu-row">
                {t(locale, "account.language")}
                {/* No hidePopover() call: this selection keeps the menu open for a further one. */}
                <select value={locale} onChange={(e) => onLocaleChange(e.target.value as UiLocale)}>
                  <option value="en">EN</option>
                  <option value="de">DE</option>
                </select>
              </label>
              {others.length > 0 && (
                <div className="shell-menu-group">
                  <span className="shell-menu-label">{t(locale, "account.switchArea")}</span>
                  {others.map((other) => (
                    <button
                      key={other}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        // Defensive, not load-bearing: a route change unmounts
                        // `Chrome` on its own, closing the menu regardless.
                        // Kept for the same shape as the profile entry above.
                        menuRef.current?.hidePopover();
                        onGoToArea(other);
                      }}
                    >
                      {t(locale, `area.${other}`)}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                role="menuitem"
                className="shell-menu-logout"
                onClick={() => {
                  // Defensive, not load-bearing: a return to `LoginScreen`
                  // unmounts `Chrome` on its own, closing the menu regardless.
                  menuRef.current?.hidePopover();
                  onLogout();
                }}
              >
                {t(locale, "account.logout")}
              </button>
              <div className="shell-menu-version">{__APP_VERSION__}</div>
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
