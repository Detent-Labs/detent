import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "./catalog.js";
import { permittedAreas, type Area } from "./areas.js";
import type { UiLocale } from "../i18n/locale.js";

interface ChromeProps {
  area: Area;
  roles: readonly string[];
  locale: UiLocale;
  onLocaleChange: (locale: UiLocale) => void;
  onLogout: () => void;
  onGoToArea: (area: Area) => void;
  /** The area's own navigation, rendered on the left of the one header row. */
  nav?: ReactNode;
  children: ReactNode;
}

/**
 * The one header. Left: the register tab naming the open area, then that area's
 * own navigation. Right: the account menu, holding language, the area switcher
 * and logout.
 *
 * The switcher lists only the other areas this actor may see and is absent
 * entirely for an actor permitted one area, so a participant sees no trace of
 * the consolidation. Current location shows in the URL prefix and the tab, not
 * as a separate label.
 */
export function Chrome({ area, roles, locale, onLocaleChange, onLogout, onGoToArea, nav, children }: ChromeProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const others = permittedAreas(roles).filter((a) => a !== area);

  useEffect(() => {
    if (!open) return;
    const onDocument = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocument);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocument);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-tab">{t(locale, `area.${area}`)}</span>
        {nav}
        <div className="shell-account" ref={menu}>
          <button type="button" className="shell-account-button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
            {t(locale, "account.menu")}
          </button>
          {open && (
            <div className="shell-menu" role="menu">
              <label className="shell-menu-row">
                {t(locale, "account.language")}
                <select value={locale} onChange={(e) => onLocaleChange(e.target.value as UiLocale)}>
                  <option value="en">EN</option>
                  <option value="de">DE</option>
                </select>
              </label>
              {others.length > 0 && (
                <div className="shell-menu-group">
                  <span className="shell-menu-label">{t(locale, "account.switchArea")}</span>
                  {others.map((other) => (
                    <button key={other} type="button" role="menuitem" onClick={() => onGoToArea(other)}>
                      {t(locale, `area.${other}`)}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" role="menuitem" className="shell-menu-logout" onClick={onLogout}>
                {t(locale, "account.logout")}
              </button>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
