export type Route = { name: "tasks" } | { name: "task"; instanceId: string } | { name: "start" } | { name: "started" } | { name: "involved" };

/**
 * Pure — testable without a DOM, and prefix-unaware: the shell strips `/app`
 * before calling this and prepends it to what `routePath` returns. An
 * unrecognized path falls back to the inbox rather than a dead end.
 */
export function matchRoute(path: string): Route {
  if (path === "/start") return { name: "start" };
  if (path === "/started") return { name: "started" };
  if (path === "/involved") return { name: "involved" };
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(path);
  if (taskMatch) return { name: "task", instanceId: decodeURIComponent(taskMatch[1]!) };
  return { name: "tasks" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "tasks":
      return "/";
    case "task":
      return `/tasks/${encodeURIComponent(route.instanceId)}`;
    case "start":
      return "/start";
    case "started":
      return "/started";
    case "involved":
      return "/involved";
  }
}
