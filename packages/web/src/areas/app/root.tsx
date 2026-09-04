import { Inbox, FileClock, Users } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { matchRoute, routePath, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { navStyles } from "../../shell/navStyles.js";
import { t } from "./catalog.js";
import { TasksScreen } from "./screens/TasksScreen.js";
import { TaskScreen } from "./screens/TaskScreen.js";
import { StartScreen } from "./screens/StartScreen.js";
import { StartedScreen } from "./screens/StartedScreen.js";
import { InvolvedScreen } from "./screens/InvolvedScreen.js";
import type { AreaRootProps } from "../../shell/App.js";

/**
 * The participant area's root. It owns its screens and its own route table;
 * the prefix, the session, the login screen and the account menu belong to the
 * shell. Nothing here imports from another area.
 */
export function AppArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("app", localPath, matchRoute, routePath, go);

  const navProps = (isCurrent: boolean) => stylex.props(isCurrent && navStyles.navCurrent);
  const tasksProps = navProps(route.name === "tasks");
  const startedProps = navProps(route.name === "started");
  const involvedProps = navProps(route.name === "involved");
  const startProps = navProps(route.name === "start");

  const nav = (
    <nav {...stylex.props(navStyles.nav)}>
      <button
        type="button"
        className={`btn btn-secondary ${tasksProps.className}`}
        style={tasksProps.style}
        aria-current={route.name === "tasks" ? "page" : undefined}
        onClick={() => navigate({ name: "tasks" })}
      >
        <Inbox size={18} strokeWidth={1.75} aria-hidden="true" />
        {t(locale, "nav.myTasks")}
      </button>
      <button
        type="button"
        className={`btn btn-secondary ${startedProps.className}`}
        style={startedProps.style}
        aria-current={route.name === "started" ? "page" : undefined}
        onClick={() => navigate({ name: "started" })}
      >
        <FileClock size={18} strokeWidth={1.75} aria-hidden="true" />
        {t(locale, "nav.startedCases")}
      </button>
      <button
        type="button"
        className={`btn btn-secondary ${involvedProps.className}`}
        style={involvedProps.style}
        aria-current={route.name === "involved" ? "page" : undefined}
        onClick={() => navigate({ name: "involved" })}
      >
        <Users size={18} strokeWidth={1.75} aria-hidden="true" />
        {t(locale, "nav.involvedCases")}
      </button>
      <button
        type="button"
        className={`btn btn-secondary ${startProps.className}`}
        style={startProps.style}
        aria-current={route.name === "start" ? "page" : undefined}
        onClick={() => navigate({ name: "start" })}
      >
        {t(locale, "nav.startProcess")}
      </button>
    </nav>
  );

  return (
    <Chrome
      area="app"
      roles={session.roles}
      session={session}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      onGoToProfile={() => go(PROFILE_PATH)}
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
      {route.name === "started" && <StartedScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "involved" && <InvolvedScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "start" && <StartScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
    </Chrome>
  );
}
