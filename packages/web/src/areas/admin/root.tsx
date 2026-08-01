import { matchRoute, routePath, type Route } from "./routing.js";
import { useAreaRoute } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { InstancesScreen } from "./screens/InstancesScreen.js";
import { InstanceScreen } from "./screens/InstanceScreen.js";
import { OutboxScreen } from "./screens/OutboxScreen.js";
import { TimersScreen } from "./screens/TimersScreen.js";
import { UsersScreen } from "./screens/UsersScreen.js";
import { MigrationsScreen } from "./screens/MigrationsScreen.js";
import type { AreaRootProps } from "../../shell/App.js";
import "./app.css";

const TABS = [
  { name: "instances", label: "Instances" },
  { name: "outbox", label: "Outbox" },
  { name: "timers", label: "Timers" },
  { name: "users", label: "Users" },
  { name: "migrations", label: "Migrations" },
] as const;

/**
 * The operator area's root. The `system:admin` gate that used to live here is
 * now the shell's, read from one table (`shell/areas.ts`); the server's
 * `requireRole` on every `/admin/*` route stays the enforcement.
 */
export function AdminArea({ session, locale, localPath, go, onUnauthorized, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("admin", localPath, matchRoute, routePath, go);

  const nav = (
    <nav className="shell-nav">
      {TABS.map((tab) => (
        <button
          key={tab.name}
          type="button"
          aria-current={route.name === tab.name || (tab.name === "instances" && route.name === "instance") ? "page" : undefined}
          onClick={() => navigate({ name: tab.name } as Route)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );

  return (
    <Chrome
      area="admin"
      roles={session.roles}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      nav={nav}
    >
      {route.name === "instances" && <InstancesScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "instance" && (
        <InstanceScreen instanceId={route.instanceId} token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />
      )}
      {route.name === "outbox" && <OutboxScreen token={session.token} onUnauthorized={onUnauthorized} />}
      {route.name === "timers" && <TimersScreen token={session.token} navigate={navigate} onUnauthorized={onUnauthorized} />}
      {route.name === "users" && <UsersScreen token={session.token} onUnauthorized={onUnauthorized} />}
      {route.name === "migrations" && <MigrationsScreen token={session.token} onUnauthorized={onUnauthorized} />}
    </Chrome>
  );
}
