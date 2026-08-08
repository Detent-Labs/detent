import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { matchShell, useLocation, areaHref, LOGIN_PATH, PROFILE_PATH } from "./routing.js";
import {
  loadSession,
  persistSession,
  clearSession,
  browserStorage,
  hydrateSession,
  needsHydration,
  type Session,
} from "./session.js";
import { AREAS, landingArea, mayEnter, type Area } from "./areas.js";
import { adoptHydratedLocale, loadLocale, persistLocale, type UiLocale } from "../i18n/locale.js";
import { fetchAccount, patchAccount } from "../api/client.js";
import { syncLocaleChange } from "./localeSync.js";
import { t } from "./catalog.js";
import { LoginScreen } from "./LoginScreen.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { Chrome } from "./Chrome.js";
import { ProfilePage } from "./ProfilePage.js";

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

  // Memoized: passed down as `onUnauthorized`/`onLogout` and, through EditScreen's
  // `load`, into a useCallback dependency array. An inline arrow here gets a new
  // identity on every render, and `App` re-renders on every `go()` call (including
  // an in-place route change like the form editor's), which would re-fire `load`'s
  // effect and refetch the draft, discarding unsaved edits.
  const logout = useCallback(() => {
    clearSession();
    setSession(undefined);
    go(LOGIN_PATH);
  }, [go]);

  // The account menu's picker. Whether the choice reaches `PATCH /account/me`
  // is `syncLocaleChange`'s decision, not this one; what comes back is the
  // session to hold, or nothing where there was no session to change.
  const changeLocale = (next: UiLocale) => {
    setLocale(next);
    const updated = syncLocaleChange(next, { session, storage: browserStorage(), patchAccount });
    if (!updated) return;
    setSession(updated);
    persistSession(updated);
  };

  // `displayName` and `locale` come from `GET /account/me`, not from the login
  // response, and fill in after the fact: this runs both after a login and after
  // `loadSession()` restored a stored session that predates hydration. Neither
  // login nor the first render waits on it, so a failure costs the two fields and
  // nothing else. A dead token surfaces as the 401 an area's own call already
  // routes to `logout`.
  //
  // One attempt per token. A federated actor's response carries neither field, so
  // `needsHydration` stays true afterwards and the guard below is what stops a
  // resolved call from starting the next one.
  const hydratedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!session) {
      hydratedFor.current = undefined;
      return;
    }
    if (hydratedFor.current === session.token || !needsHydration(session)) return;
    hydratedFor.current = session.token;
    let live = true;
    void fetchAccount(session.token)
      .then((account) => {
        if (!live) return;
        const hydrated = hydrateSession(session, account);
        setSession(hydrated);
        persistSession(hydrated);
        const adopted = adoptHydratedLocale(account.locale, browserStorage());
        if (adopted) setLocale(adopted);
      })
      .catch(() => {
        // Best-effort. The session is established from the login response alone.
      });
    return () => {
      live = false;
    };
  }, [session]);

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

  // Identity belongs to every signed-in actor, so the profile page sits under
  // the shell rather than inside a role-gated area. It renders inside `Chrome`,
  // so the account menu and the area switcher stay reachable from it.
  if (here.kind === "profile") {
    return (
      <Chrome
        area="profile"
        roles={session.roles}
        locale={locale}
        onLocaleChange={changeLocale}
        onLogout={logout}
        onGoToArea={(a) => go(areaHref(a, "/"))}
        onGoToProfile={() => go(PROFILE_PATH)}
        nav={undefined}
      >
        <ProfilePage
          token={session.token}
          locale={locale}
          onSaved={(account) => {
            // The account of record just moved, so the session follows it, and
            // a locale chosen here becomes the active one at once. The form's
            // own PATCH already carried it to the account, so this writes the
            // browser's copy directly rather than through `changeLocale`, which
            // would send a second PATCH and rebuild the session from the copy
            // this callback closed over.
            const next = hydrateSession(session, account);
            setSession(next);
            persistSession(next);
            if (next.locale) {
              setLocale(next.locale);
              persistLocale(next.locale, browserStorage());
            }
          }}
          onUnauthorized={logout}
        />
      </Chrome>
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
        onGoToProfile={() => go(PROFILE_PATH)}
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
