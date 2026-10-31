import { lazy, Suspense, useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { Workflow, LayoutTemplate } from "lucide-react";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH, type NavigateOptions } from "../../shell/routing.js";
import { t } from "./catalog.js";
import { Chrome } from "../../shell/Chrome.js";
import { navStyles } from "../../shell/navStyles.js";
import { colors, layout, space } from "form-ui/tokens.stylex";
import { ProcessesScreen } from "./screens/ProcessesScreen.js";
import { EditScreen } from "./screens/EditScreen.js";
import { VersionsScreen } from "./screens/VersionsScreen.js";
import { MigrationPlanScreen } from "./screens/MigrationPlanScreen.js";
import { ToolsScreen } from "./screens/ToolsScreen.js";
import { TemplatesScreen } from "./screens/TemplatesScreen.js";
import type { AreaRootProps } from "../../shell/App.js";

// The only role this file names on its own. Every other per-screen role comes
// from `ROUTE_ROLE`, so the nav and the guard cannot disagree with the map.
const TEMPLATES_ROLE = "system:templates";

/** The player loads as its own chunk when it first opens, so no other studio
 * screen downloads it (`studio-app`). */
const PlayerScreen = lazy(() => import("./screens/PlayerScreen.js").then((m) => ({ default: m.PlayerScreen })));

const styles = stylex.create({
  // `.studio-empty-role` from `app.css`.
  emptyRole: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    textAlign: "center",
    gap: space.s3,
    padding: space.s4,
  },
  // The waiting line while the player's chunk loads, in the player's own
  // frame: one muted line where the screen will stand.
  screenLoading: {
    maxWidth: layout.capWide,
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    color: colors.textMuted,
  },
});

/**
 * The same explanatory state the shell shows an actor with no studio role,
 * named per screen. Names every role that admits the screen, not just one: a
 * screen admitting two roles that named one would tell an author they need a
 * role they may already hold.
 */
function MissingRole({ roles }: { roles: readonly string[] }) {
  return (
    <main {...stylex.props(styles.emptyRole)}>
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

  // Whether the open draft carries unsaved changes, reported up from
  // `ProcessSurface` via `EditScreen`'s `onDirtyChange` prop. A ref, not
  // `useState`: nothing here renders differently based on dirtiness, it is
  // read only inside event handlers.
  const dirtyRef = useRef(false);
  // The studio's area nav reserves no element for a draft control any more.
  // Save, Discard draft and Publish render directly in the header bar, inside
  // `EditScreen`'s own tree, and the Checks tab's own count reports the state
  // the old area-nav Checks control used to carry (`studio-process-tabs`).
  useEffect(() => {
    if (route.name !== "edit") dirtyRef.current = false;
  }, [route.name]);

  // The one prompt for leaving an open, unsaved draft. A clean draft, or any
  // screen but the edit screen, leaves `dirtyRef` false and asks nothing.
  const confirmLeave = () => !dirtyRef.current || confirm(t("app.leaveDraftConfirm"));

  // Each exit from the draft goes through `confirmLeave`: in-area navigation,
  // an href leaving the area, and the account menu's logout. `dest`, not
  // `route`, so the parameter does not shadow the outer `route` above.
  // `onUnauthorized` stays raw: a dead session asks nothing.
  const guardedNavigate = (dest: Route, opts?: NavigateOptions) => {
    if (dest.name !== "edit" && !confirmLeave()) return;
    navigate(dest, opts);
  };
  const guardedGo = (href: string, opts?: NavigateOptions) => {
    if (!confirmLeave()) return;
    go(href, opts);
  };
  const guardedLogout = () => {
    if (!confirmLeave()) return;
    onLogout();
  };

  // The browser words this prompt. Modern browsers need `preventDefault()` to
  // raise it. It fires for tab close, reload and a new address, never for a
  // step between entries of the page, which raises `popstate` instead.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // `matchRoute` falls back to the process list, which a curator holding only
  // `system:templates` cannot read. Move them to the screen they can, rather
  // than landing them on an explanation of why their own area refuses them.
  const strandedOnDefault = route.name === "processes" && !may(ROUTE_ROLE.processes) && may([TEMPLATES_ROLE]);
  useEffect(() => {
    if (strandedOnDefault) navigate({ name: "templates" });
  }, [strandedOnDefault, navigate]);

  const processesCurrent = route.name === "processes" || route.name === "edit";
  const processesProps = stylex.props(processesCurrent && navStyles.navCurrent);
  const toolsProps = stylex.props(route.name === "tools" && navStyles.navCurrent);
  const templatesProps = stylex.props(route.name === "templates" && navStyles.navCurrent);

  const nav = (
    <nav {...stylex.props(navStyles.nav)}>
      {may(ROUTE_ROLE.processes) && (
        <button
          type="button"
          className={`btn btn-secondary ${processesProps.className}`}
          style={processesProps.style}
          aria-current={processesCurrent ? "page" : undefined}
          onClick={() => guardedNavigate({ name: "processes" })}
        >
          <Workflow size={18} strokeWidth={1.75} aria-hidden="true" />
          Processes
        </button>
      )}
      {may(ROUTE_ROLE.tools) && (
        <button
          type="button"
          className={`btn btn-secondary ${toolsProps.className}`}
          style={toolsProps.style}
          aria-current={route.name === "tools" ? "page" : undefined}
          onClick={() => guardedNavigate({ name: "tools" })}
        >
          Tools
        </button>
      )}
      {may(ROUTE_ROLE.templates) && (
        <button
          type="button"
          className={`btn btn-secondary ${templatesProps.className}`}
          style={templatesProps.style}
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
      onLogout={guardedLogout}
      onGoToArea={(a) => guardedGo(`/${a}`)}
      onGoToProfile={() => guardedGo(PROFILE_PATH)}
      nav={nav}
    >
      {!may(required) && <MissingRole roles={required} />}
      {may(required) && (
        <>
          {route.name === "processes" && <ProcessesScreen token={session.token} roles={session.roles} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "edit" && (
            <EditScreen
              processId={route.processId}
              formStepId={route.formStepId}
              tab={route.tab}
              view={route.view}
              stepId={route.stepId}
              token={session.token}
              roles={session.roles}
              go={guardedGo}
              navigate={guardedNavigate}
              actorId={session.actorId}
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
          {route.name === "play" && (
            // A local boundary: the shell's own would replace the whole area
            // while the chunk loads.
            <Suspense fallback={<main {...stylex.props(styles.screenLoading)}>{t("app.screenLoading")}</main>}>
              <PlayerScreen processId={route.processId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />
            </Suspense>
          )}
          {route.name === "templates" && <TemplatesScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
        </>
      )}
    </Chrome>
  );
}
