import { useEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { ListChecks, Send, Timer, Users, GitCompareArrows, Users2, Table2, Languages } from "lucide-react";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "./routing.js";
import { useAreaRoute, PROFILE_PATH } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { navStyles } from "../../shell/navStyles.js";
import { space } from "form-ui/tokens.stylex";
import { InstancesScreen } from "./screens/InstancesScreen.js";
import { InstanceScreen } from "./screens/InstanceScreen.js";
import { OutboxScreen } from "./screens/OutboxScreen.js";
import { TimersScreen } from "./screens/TimersScreen.js";
import { UsersScreen } from "./screens/UsersScreen.js";
import { MigrationsScreen } from "./screens/MigrationsScreen.js";
import { GroupsScreen } from "./screens/GroupsScreen.js";
import { DataListsScreen } from "./screens/DataListsScreen.js";
import { DataListScreen } from "./screens/DataListScreen.js";
import { UiStringsScreen } from "./screens/UiStringsScreen.js";
import { t, tFill, type CatalogKey } from "./catalog.js";
import type { UiLocale } from "../../i18n/locale.js";
import type { AreaRootProps } from "../../shell/App.js";

const ADMIN_ROLE = "system:admin";
const DATALISTS_ROLE = "system:datalists";

/** `.admin-empty-role` from `app.css`. */
const styles = stylex.create({
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
});

/** The role each tab's screen needs; `ROUTE_ROLE` in `routing.ts` carries the same rule per route. */
const TABS: { name: Route["name"]; labelKey: CatalogKey; role: string; Icon: typeof ListChecks }[] = [
  { name: "instances", labelKey: "nav.instances", role: ADMIN_ROLE, Icon: ListChecks },
  { name: "outbox", labelKey: "nav.outbox", role: ADMIN_ROLE, Icon: Send },
  { name: "timers", labelKey: "nav.timers", role: ADMIN_ROLE, Icon: Timer },
  { name: "users", labelKey: "nav.users", role: ADMIN_ROLE, Icon: Users },
  { name: "migrations", labelKey: "nav.migrations", role: ADMIN_ROLE, Icon: GitCompareArrows },
  { name: "groups", labelKey: "nav.groups", role: ADMIN_ROLE, Icon: Users2 },
  { name: "dataLists", labelKey: "nav.dataLists", role: DATALISTS_ROLE, Icon: Table2 },
  { name: "uiStrings", labelKey: "nav.uiStrings", role: ADMIN_ROLE, Icon: Languages },
];

/**
 * The same explanatory state the area shows an actor with no operator role,
 * named per screen. The role name itself stays as the engine spells it.
 */
function MissingRole({ role, locale }: { role: string; locale: UiLocale }) {
  return (
    <main {...stylex.props(styles.emptyRole)}>
      <h1>{t(locale, "role.title")}</h1>
      <p>{tFill(locale, "role.body", { role })}</p>
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
    <nav {...stylex.props(navStyles.nav)}>
      {TABS.filter((tab) => may(tab.role)).map((tab) => {
        const isCurrent =
          route.name === tab.name ||
          (tab.name === "instances" && route.name === "instance") ||
          (tab.name === "dataLists" && route.name === "dataList");
        const tabProps = stylex.props(isCurrent && navStyles.navCurrent);
        return (
          <button
            key={tab.name}
            type="button"
            className={`btn btn-secondary ${tabProps.className}`}
            style={tabProps.style}
            aria-current={isCurrent ? "page" : undefined}
            onClick={() => navigate({ name: tab.name } as Route)}
          >
            <tab.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {t(locale, tab.labelKey)}
          </button>
        );
      })}
    </nav>
  );

  const required = ROUTE_ROLE[route.name];

  return (
    <Chrome
      area="admin"
      roles={session.roles}
      session={session}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      onGoToProfile={() => go(PROFILE_PATH)}
      nav={nav}
    >
      {!may(required) && <MissingRole role={required} locale={locale} />}
      {may(required) && (
        <>
          {route.name === "instances" && <InstancesScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "instance" && (
            <InstanceScreen instanceId={route.instanceId} token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />
          )}
          {route.name === "outbox" && <OutboxScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
          {route.name === "timers" && <TimersScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "users" && <UsersScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
          {route.name === "migrations" && <MigrationsScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
          {route.name === "groups" && (
            <GroupsScreen token={session.token} locale={locale} initialProcessId={route.processId} onUnauthorized={onUnauthorized} />
          )}
          {route.name === "dataLists" && <DataListsScreen token={session.token} locale={locale} navigate={navigate} onUnauthorized={onUnauthorized} />}
          {route.name === "uiStrings" && <UiStringsScreen token={session.token} locale={locale} onUnauthorized={onUnauthorized} />}
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
