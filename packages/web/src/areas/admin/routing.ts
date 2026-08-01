export type Route =
  | { name: "instances" }
  | { name: "instance"; instanceId: string }
  | { name: "outbox" }
  | { name: "timers" }
  | { name: "users" }
  | { name: "migrations" };

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
  const instanceMatch = /^\/instances\/([^/]+)$/.exec(path);
  if (instanceMatch) return { name: "instance", instanceId: decodeURIComponent(instanceMatch[1]!) };
  return { name: "instances" };
}

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
  }
}
