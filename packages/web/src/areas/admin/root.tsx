import { useEffect } from "react";
import { ListChecks, Send, Timer, Users, GitCompareArrows, Table2, Languages } from "lucide-react";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { InstancesScreen } from "./screens/InstancesScreen.js";
import { InstanceScreen } from "./screens/InstanceScreen.js";
import { OutboxScreen } from "./screens/OutboxScreen.js";
import { TimersScreen } from "./screens/TimersScreen.js";
import { UsersScreen } from "./screens/UsersScreen.js";
import { MigrationsScreen } from "./screens/MigrationsScreen.js";
import { DataListsScreen } from "./screens/DataListsScreen.js";
import { DataListScreen } from "./screens/DataListScreen.js";
import { UiStringsScreen } from "./screens/UiStringsScreen.js";
import type { AreaRootProps } from "../../shell/App.js";
import "./app.css";

const ADMIN_ROLE = "system:admin";
const DATALISTS_ROLE = "system:datalists";

/** The role each tab's screen needs; `ROUTE_ROLE` in `routing.ts` carries the same rule per route. */
const TABS = [
  { name: "instances", label: "Instances", role: ADMIN_ROLE, Icon: ListChecks },
  { name: "outbox", label: "Outbox", role: ADMIN_ROLE, Icon: Send },
  { name: "timers", label: "Timers", role: ADMIN_ROLE, Icon: Timer },
  { name: "users", label: "Users", role: ADMIN_ROLE, Icon: Users },
  { name: "migrations", label: "Migrations", role: ADMIN_ROLE, Icon: GitCompareArrows },
  { name: "dataLists", label: "Data lists", role: DATALISTS_ROLE, Icon: Table2 },
  { name: "uiStrings", label: "UI strings", role: ADMIN_ROLE, Icon: Languages },
] as const;

/** The same explanatory state the area shows an actor with no operator role, named per screen. */
function MissingRole({ role }: { role: string }) {
  return (
    <main className="admin-empty-role">
      <h1>Not your screen</h1>
      <p>This screen needs the {role} role. Your account does not have it.</p>
    </main>
  );
}

export function AdminArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("admin", localPath, matchRoute, routePath, go);
  const may = (role: string) => session.roles.includes(role);

  // `matchRoute` falls back to the instances list, which a maintainer holding
  // only `system:datalists` cannot read. Move them to the screen they can,
  // rather than landing them on an explanation of why the area is empty.
  const strandedOnDefault = route.name === "instances" && !may(ADMIN_ROLE) && may(DATALISTS_ROLE);
  useEffect(() => {
    if (strandedOnDefault) navigate({ name: "dataLists" });
  }, [strandedOnDefault, navigate]);

  const nav = (
    <nav className="shell-nav">
      {TABS.filter((tab) => may(tab.role)).map((tab) => (
        <button
          key={tab.name}
          type="button"
          className="btn btn-secondary"
          aria-current={
            route.name === tab.name ||
            (tab.name === "instances" && route.name === "instance") ||
            (tab.name === "dataLists" && route.name === "dataList")
              ? "page"
              : undefined
          }
          onClick={() => navigate({ name: tab.name } as Route)}
        >
          <tab.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          {tab.label}
        </button>
      ))}
    </nav>
  );

  const required = ROUTE_ROLE[route.name];

  return (
    <Chrome
      area="admin"
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
          {route.name === "instances" && <InstancesScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "instance" && (
            <InstanceScreen instanceId={route.instanceId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />
          )}
          {route.name === "outbox" && <OutboxScreen token={session.token} onUnauthorized={onUnauthorized} />}
          {route.name === "timers" && <TimersScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "users" && <UsersScreen token={session.token} onUnauthorized={onUnauthorized} />}
          {route.name === "migrations" && <MigrationsScreen token={session.token} onUnauthorized={onUnauthorized} />}
          {route.name === "dataLists" && <DataListsScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "uiStrings" && <UiStringsScreen token={session.token} onUnauthorized={onUnauthorized} />}
          {route.name === "dataList" && (
            <DataListScreen
              listKey={route.listKey}
              token={session.token}
              locale={locale}
              navigate={navigate}
              onUnauthorized={onUnauthorized}
            />
          )}
        </>
      )}
    </Chrome>
  );
}
