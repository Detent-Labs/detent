import { useEffect } from "react";
import { Workflow, LayoutTemplate } from "lucide-react";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { ProcessesScreen } from "./screens/ProcessesScreen.js";
import { EditScreen } from "./screens/EditScreen.js";
import { VersionsScreen } from "./screens/VersionsScreen.js";
import { MigrationPlanScreen } from "./screens/MigrationPlanScreen.js";
import { ToolsScreen } from "./screens/ToolsScreen.js";
import { PlayerScreen } from "./screens/PlayerScreen.js";
import { TemplatesScreen } from "./screens/TemplatesScreen.js";
import type { AreaRootProps } from "../../shell/App.js";
import "./app.css";

const DEVELOPER_ROLE = "system:developer";
const TEMPLATES_ROLE = "system:templates";

/** The same explanatory state the shell shows an actor with no studio role, named per screen. */
function MissingRole({ role }: { role: string }) {
  return (
    <main className="studio-empty-role">
      <h1>Not your screen</h1>
      <p>This screen needs the {role} role. Your account does not have it.</p>
    </main>
  );
}

/**
 * The developer area's root. Area entry is the shell's, read from one table
 * (`shell/areas.ts`), and it admits `system:developer` or `system:templates`.
 * Entry is therefore the weaker gate: `ROUTE_ROLE` in `routing.ts` is the
 * narrower one, so a template curator reaches the templates screen alone. The
 * server's `requireRole` on every route it calls stays the enforcement.
 */
export function StudioArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("studio", localPath, matchRoute, routePath, go);
  const may = (role: string) => session.roles.includes(role);

  // `matchRoute` falls back to the process list, which a curator holding only
  // `system:templates` cannot read. Move them to the screen they can, rather
  // than landing them on an explanation of why their own area refuses them.
  const strandedOnDefault = route.name === "processes" && !may(DEVELOPER_ROLE) && may(TEMPLATES_ROLE);
  useEffect(() => {
    if (strandedOnDefault) navigate({ name: "templates" });
  }, [strandedOnDefault, navigate]);

  const nav = (
    <nav className="shell-nav">
      {may(DEVELOPER_ROLE) && (
        <>
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
        </>
      )}
      {may(TEMPLATES_ROLE) && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-current={route.name === "templates" ? "page" : undefined}
          onClick={() => navigate({ name: "templates" })}
        >
          <LayoutTemplate size={18} strokeWidth={1.75} aria-hidden="true" />
          Templates
        </button>
      )}
    </nav>
  );

  const required = ROUTE_ROLE[route.name];

  return (
    <Chrome
      area="studio"
      roles={session.roles}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      onGoToProfile={() => go(PROFILE_PATH)}
      nav={nav}
    >
      {!may(required) && <MissingRole role={required} />}
      {may(required) && (
        <>
          {route.name === "processes" && <ProcessesScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "edit" && (
            <EditScreen
              processId={route.processId}
              formStepId={route.formStepId}
              token={session.token}
              navigate={navigate}
              onUnauthorized={onUnauthorized}
            />
          )}
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
          {route.name === "templates" && <TemplatesScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
        </>
      )}
    </Chrome>
  );
}
