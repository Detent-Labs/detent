import { useEffect, useRef } from "react";
import { Workflow, LayoutTemplate } from "lucide-react";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH, type NavigateOptions } from "../../shell/routing.js";
import { t } from "./catalog.js";
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

// The only role this file names on its own. Every other per-screen role comes
// from `ROUTE_ROLE`, so the nav and the guard cannot disagree with the map.
const TEMPLATES_ROLE = "system:templates";

/**
 * The same explanatory state the shell shows an actor with no studio role,
 * named per screen. Names every role that admits the screen, not just one: a
 * screen admitting two roles that named one would tell an author they need a
 * role they may already hold.
 */
function MissingRole({ roles }: { roles: readonly string[] }) {
  return (
    <main className="studio-empty-role">
      <h1>Not your screen</h1>
      <p>
        This screen needs the {roles.join(" or ")} role. Your account does not have it.
      </p>
    </main>
  );
}

/**
 * The studio area's root. Area entry is the shell's, read from one table
 * (`shell/areas.ts`), and it admits `system:developer`, `system:author` or
 * `system:templates`. Entry is therefore the weaker gate: `ROUTE_ROLE` in
 * `routing.ts` is the narrower one, so a template curator reaches the
 * templates screen alone and an author reaches neither migration planning nor
 * Tools. The server's role check on every route it calls stays the
 * enforcement.
 */
export function StudioArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("studio", localPath, matchRoute, routePath, go);
  const may = (roles: readonly string[]) => roles.some((role) => session.roles.includes(role));

  // Whether the open edit screen's draft carries unsaved changes, reported
  // up from `EditorArea` via `EditScreen`'s `onDirtyChange` prop. A ref, not
  // `useState`: nothing here renders differently based on dirtiness, it is
  // read only inside a click handler (design.md: "Report dirtiness upward
  // through one callback prop into a ref").
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (route.name !== "edit") dirtyRef.current = false;
  }, [route.name]);

  // Guards every navigation away from an open, unsaved draft behind one
  // confirmation (design.md: "Guard `navigate` once, at the point `root.tsx`
  // hands it downward"). `dest`, not `route`, so the parameter does not
  // shadow the outer `route` above.
  const guardedNavigate = (dest: Route, opts?: NavigateOptions) => {
    if (dirtyRef.current && dest.name !== "edit" && !confirm(t("app.leaveDraftConfirm"))) return;
    navigate(dest, opts);
  };

  // `matchRoute` falls back to the process list, which a curator holding only
  // `system:templates` cannot read. Move them to the screen they can, rather
  // than landing them on an explanation of why their own area refuses them.
  const strandedOnDefault = route.name === "processes" && !may(ROUTE_ROLE.processes) && may([TEMPLATES_ROLE]);
  useEffect(() => {
    if (strandedOnDefault) navigate({ name: "templates" });
  }, [strandedOnDefault, navigate]);

  const nav = (
    <nav className="shell-nav">
      {may(ROUTE_ROLE.processes) && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-current={route.name === "processes" || route.name === "edit" ? "page" : undefined}
          onClick={() => guardedNavigate({ name: "processes" })}
        >
          <Workflow size={18} strokeWidth={1.75} aria-hidden="true" />
          Processes
        </button>
      )}
      {may(ROUTE_ROLE.tools) && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-current={route.name === "tools" ? "page" : undefined}
          onClick={() => guardedNavigate({ name: "tools" })}
        >
          Tools
        </button>
      )}
      {may(ROUTE_ROLE.templates) && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-current={route.name === "templates" ? "page" : undefined}
          onClick={() => guardedNavigate({ name: "templates" })}
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
      session={session}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      onGoToProfile={() => go(PROFILE_PATH)}
      nav={nav}
    >
      {!may(required) && <MissingRole roles={required} />}
      {may(required) && (
        <>
          {route.name === "processes" && <ProcessesScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "edit" && (
            <EditScreen
              processId={route.processId}
              formStepId={route.formStepId}
              panel={route.panel}
              stepId={route.stepId}
              token={session.token}
              go={go}
              navigate={guardedNavigate}
              onUnauthorized={onUnauthorized}
              onDirtyChange={(d) => {
                dirtyRef.current = d;
              }}
            />
          )}
          {route.name === "versions" && (
            <VersionsScreen
              processId={route.processId}
              token={session.token}
              navigate={navigate}
              onUnauthorized={onUnauthorized}
            />
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
