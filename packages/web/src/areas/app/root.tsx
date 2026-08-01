import { matchRoute, routePath, type Route } from "./routing.js";
import { useAreaRoute } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { t } from "./catalog.js";
import { TasksScreen } from "./screens/TasksScreen.js";
import { TaskScreen } from "./screens/TaskScreen.js";
import { StartScreen } from "./screens/StartScreen.js";
import type { AreaRootProps } from "../../shell/App.js";
import "./app.css";

/**
 * The participant area's root. It owns its screens and its own route table;
 * the prefix, the session, the login screen and the account menu belong to the
 * shell. Nothing here imports from another area.
 */
export function AppArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("app", localPath, matchRoute, routePath, go);

  const nav = (
    <nav className="shell-nav">
      <button type="button" onClick={() => navigate({ name: "tasks" })}>
        {t(locale, "nav.myTasks")}
      </button>
      <button type="button" onClick={() => navigate({ name: "start" })}>
        {t(locale, "nav.startProcess")}
      </button>
    </nav>
  );

  return (
    <Chrome
      area="app"
      roles={session.roles}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      nav={nav}
    >
      {route.name === "tasks" && (
        <TasksScreen token={session.token} actorId={session.actorId} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />
      )}
      {route.name === "task" && (
        <TaskScreen
          instanceId={route.instanceId}
          token={session.token}
          actorId={session.actorId}
          actorRoles={session.roles}
          locale={locale}
          navigate={navigate}
          onUnauthorized={onUnauthorized}
        />
      )}
      {route.name === "start" && <StartScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
    </Chrome>
  );
}
