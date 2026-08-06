export type Route =
  | { name: "instances" }
  | { name: "instance"; instanceId: string }
  | { name: "outbox" }
  | { name: "timers" }
  | { name: "users" }
  | { name: "migrations" }
  | { name: "dataLists" }
  | { name: "dataList"; listKey: string }
  | { name: "uiStrings" };

/**
 * Pure — testable without a DOM, and prefix-unaware: the shell strips `/admin`
 * before calling this and prepends it to what `routePath` returns. An
 * unrecognized path falls back to the instances list rather than a dead end.
 */
export function matchRoute(path: string): Route {
  if (path === "/outbox") return { name: "outbox" };
  if (path === "/timers") return { name: "timers" };
  if (path === "/users") return { name: "users" };
  if (path === "/migrations") return { name: "migrations" };
  if (path === "/data-lists") return { name: "dataLists" };
  if (path === "/ui-strings") return { name: "uiStrings" };
  const dataListMatch = /^\/data-lists\/([^/]+)$/.exec(path);
  if (dataListMatch) return { name: "dataList", listKey: decodeURIComponent(dataListMatch[1]!) };
  const instanceMatch = /^\/instances\/([^/]+)$/.exec(path);
  if (instanceMatch) return { name: "instance", instanceId: decodeURIComponent(instanceMatch[1]!) };
  return { name: "instances" };
}

/**
 * The role each route's screen needs. Area entry admits either role (see
 * `shell/areas.ts`), so this is the second, narrower gate: an actor holding
 * only `system:datalists` reaches the data list screens and nothing else.
 *
 * Homed here rather than in `root.tsx` so it stays readable without React —
 * `root.tsx` pulls in every screen and the area stylesheet. The server's
 * `requireRole` on every `/admin/*` route stays the enforcement; this is
 * display logic.
 */
export const ROUTE_ROLE: Record<Route["name"], string> = {
  instances: "system:admin",
  instance: "system:admin",
  outbox: "system:admin",
  timers: "system:admin",
  users: "system:admin",
  migrations: "system:admin",
  dataLists: "system:datalists",
  dataList: "system:datalists",
  uiStrings: "system:admin",
};

export function routePath(route: Route): string {
  switch (route.name) {
    case "instances":
      return "/";
    case "instance":
      return `/instances/${encodeURIComponent(route.instanceId)}`;
    case "outbox":
      return "/outbox";
    case "timers":
      return "/timers";
    case "users":
      return "/users";
    case "migrations":
      return "/migrations";
    case "dataLists":
      return "/data-lists";
    case "dataList":
      return `/data-lists/${encodeURIComponent(route.listKey)}`;
    case "uiStrings":
      return "/ui-strings";
  }
}
