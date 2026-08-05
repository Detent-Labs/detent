import { lazy, Suspense, useState } from "react";
import { matchShell, useLocation, areaHref, LOGIN_PATH } from "./routing.js";
import { loadSession, persistSession, clearSession, browserStorage, type Session } from "./session.js";
import { AREAS, landingArea, mayEnter, type Area } from "./areas.js";
import { loadLocale, persistLocale, type UiLocale } from "../i18n/locale.js";
import { t } from "./catalog.js";
import { LoginScreen } from "./LoginScreen.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { Chrome } from "./Chrome.js";

/**
 * One dynamic import per area, so the build emits one chunk per area and a
 * participant loading `/app` never downloads the Studio canvas. Areas that
 * have not migrated yet are absent from `MIGRATED` and still run from their
 * own package on their own port.
 */
const AREA_ROOTS: Record<Area, ReturnType<typeof lazy>> = {
  app: lazy(() => import("../areas/app/root.js").then((m) => ({ default: m.AppArea }))),
  admin: lazy(() => import("../areas/admin/root.js").then((m) => ({ default: m.AdminArea }))),
  studio: lazy(() => import("../areas/studio/root.js").then((m) => ({ default: m.StudioArea }))),
  reporting: lazy(() => import("../areas/reporting/root.js").then((m) => ({ default: m.ReportingArea }))),
};

/** What every area root receives. The shell owns all of it; an area owns its screens. */
export interface AreaRootProps {
  session: Session;
  locale: UiLocale;
  /** The path with the area prefix already stripped, so the area matcher never sees it. */
  localPath: string;
  go: (href: string) => void;
  onUnauthorized: () => void;
  onLocaleChange: (locale: UiLocale) => void;
  onLogout: () => void;
}

export function App() {
  const { pathname, go } = useLocation();
  const [session, setSession] = useState<Session | undefined>(() => loadSession());
  const [locale, setLocale] = useState<UiLocale>(() =>
    loadLocale(browserStorage(), typeof navigator === "undefined" ? undefined : navigator.language),
  );

  const logout = () => {
    clearSession();
    setSession(undefined);
    go(LOGIN_PATH);
  };

  const changeLocale = (next: UiLocale) => {
    setLocale(next);
    persistLocale(next, browserStorage());
  };

  const here = matchShell(pathname);

  if (!session || here.kind === "login") {
    return (
      <LoginScreen
        locale={locale}
        onLoggedIn={(s) => {
          setSession(s);
          persistSession(s);
          go(`/${landingArea(s.roles)}`);
        }}
      />
    );
  }

  // `/` and any unknown first segment resolve client-side. The engine never
  // issues a redirect for them: it must not need to know its outward address.
  if (here.kind === "root" || here.kind === "unknown") {
    const target = `/${landingArea(session.roles)}`;
    if (pathname !== target) queueMicrotask(() => go(target));
    return null;
  }

  const Root = AREA_ROOTS[here.area];
  if (!mayEnter(here.area, session.roles)) {
    return (
      <Chrome
        area={AREAS[0]}
        roles={session.roles}
        locale={locale}
        onLocaleChange={changeLocale}
        onLogout={logout}
        onGoToArea={(a) => go(areaHref(a, "/"))}
        nav={undefined}
      >
        <main className="shell-empty">{t(locale, "area.forbidden")}</main>
      </Chrome>
    );
  }

  // Keyed on the area so navigating away from a tripped area recovers it.
  return (
    <ErrorBoundary key={here.area} locale={locale}>
      <Suspense fallback={<main className="shell-empty">{t(locale, "area.loading")}</main>}>
        <Root
          session={session}
          locale={locale}
          localPath={here.path}
          go={go}
          onUnauthorized={logout}
          onLocaleChange={changeLocale}
          onLogout={logout}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
