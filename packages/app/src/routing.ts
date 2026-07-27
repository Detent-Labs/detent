import { useCallback, useEffect, useState } from "react";

export type Route = { name: "tasks" } | { name: "task"; instanceId: string } | { name: "start" } | { name: "login" };

/** Pure — testable without a DOM. An unrecognized path falls back to the
 * inbox rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/start") return { name: "start" };
  if (path === "/login") return { name: "login" };
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
    case "login":
      return "/login";
  }
}

/** Small hand-written History-API hook — four routes don't justify a router
 * dependency, and task URLs (`/tasks/:instanceId`) stay directly shareable. */
export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const [path, setPath] = useState(() => (typeof location === "undefined" ? "/" : location.pathname));

  useEffect(() => {
    const onPopState = () => setPath(location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((route: Route) => {
    const next = routePath(route);
    if (next !== location.pathname) history.pushState(null, "", next);
    setPath(next);
  }, []);

  return { route: matchRoute(path), navigate };
}
