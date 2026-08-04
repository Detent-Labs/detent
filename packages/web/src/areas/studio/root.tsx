import { Workflow } from "lucide-react";
import { matchRoute, routePath, type Route } from "./routing.js";
import { useAreaRoute } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { ProcessesScreen } from "./screens/ProcessesScreen.js";
import { EditScreen } from "./screens/EditScreen.js";
import { VersionsScreen } from "./screens/VersionsScreen.js";
import { MigrationPlanScreen } from "./screens/MigrationPlanScreen.js";
import { ToolsScreen } from "./screens/ToolsScreen.js";
import { PlayerScreen } from "./screens/PlayerScreen.js";
import type { AreaRootProps } from "../../shell/App.js";
import "./app.css";

/**
 * The developer area's root. The `system:developer` gate that used to live here
 * is now the shell's, read from one table (`shell/areas.ts`); the server's
 * `requireRole` on every route it calls stays the enforcement.
 */
export function StudioArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("studio", localPath, matchRoute, routePath, go);

  const nav = (
    <nav className="shell-nav">
      <button
        type="button"
        className="btn btn-secondary"
        aria-current={route.name === "processes" || route.name === "edit" ? "page" : undefined}
        onClick={() => navigate({ name: "processes" })}
      >
        <Workflow size={18} strokeWidth={1.75} aria-hidden="true" />
        Processes
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        aria-current={route.name === "tools" ? "page" : undefined}
        onClick={() => navigate({ name: "tools" })}
      >
        Tools
      </button>
    </nav>
  );

  return (
    <Chrome
      area="studio"
      roles={session.roles}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      nav={nav}
    >
      {route.name === "processes" && <ProcessesScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "edit" && <EditScreen processId={route.processId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "versions" && (
        <VersionsScreen processId={route.processId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />
      )}
      {route.name === "migrate" && (
        <MigrationPlanScreen
          processId={route.processId}
          from={route.from}
          to={route.to}
          token={session.token}
          navigate={navigate}
          onUnauthorized={onUnauthorized}
        />
      )}
      {route.name === "tools" && <ToolsScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "play" && <PlayerScreen processId={route.processId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
    </Chrome>
  );
}
