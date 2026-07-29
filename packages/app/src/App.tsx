import { useState } from "react";
import { useRoute } from "./routing.js";
import { loadSession, persistSession, clearSession, type Session } from "./session.js";
import { loadLocale, persistLocale, type UiLocale } from "./i18n/locale.js";
import { t } from "./i18n/catalog.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { TasksScreen } from "./screens/TasksScreen.js";
import { TaskScreen } from "./screens/TaskScreen.js";
import { StartScreen } from "./screens/StartScreen.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

export function App() {
  const { route, navigate } = useRoute();
  const [session, setSession] = useState<Session | undefined>(() => loadSession());
  const [locale, setLocale] = useState<UiLocale>(() => loadLocale(typeof localStorage === "undefined" ? undefined : localStorage, navigator.language));

  const logout = () => {
    clearSession();
    setSession(undefined);
    navigate({ name: "login" });
  };

  const changeLocale = (next: UiLocale) => {
    setLocale(next);
    persistLocale(next, typeof localStorage === "undefined" ? undefined : localStorage);
  };

  if (!session || route.name === "login") {
    return (
      <LoginScreen
        locale={locale}
        onLoggedIn={(s) => {
          setSession(s);
          persistSession(s);
          navigate({ name: "tasks" });
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav>
          <button type="button" onClick={() => navigate({ name: "tasks" })}>
            {t(locale, "nav.myTasks")}
          </button>
          <button type="button" onClick={() => navigate({ name: "start" })}>
            {t(locale, "nav.startProcess")}
          </button>
        </nav>
        <div className="app-header-right">
          <select value={locale} onChange={(e) => changeLocale(e.target.value as UiLocale)}>
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
          <button type="button" onClick={logout}>
            {t(locale, "nav.logout")}
          </button>
        </div>
      </header>

      {/* Backstop for render-time throws only — see ErrorBoundary.tsx. Keyed on
          the route so navigating away from a tripped screen recovers it. */}
      <ErrorBoundary key={route.name} locale={locale}>
        {route.name === "tasks" && (
          <TasksScreen token={session.token} actorId={session.actorId} locale={locale} navigate={navigate} onUnauthorized={logout} />
        )}
        {route.name === "task" && <TaskScreen instanceId={route.instanceId} token={session.token} locale={locale} navigate={navigate} onUnauthorized={logout} />}
        {route.name === "start" && <StartScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={logout} />}
      </ErrorBoundary>
    </div>
  );
}
