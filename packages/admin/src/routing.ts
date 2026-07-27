import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "instances" }
  | { name: "instance"; instanceId: string }
  | { name: "outbox" }
  | { name: "timers" }
  | { name: "login" };

/** Pure — testable without a DOM. An unrecognized path falls back to the instances list rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/login") return { name: "login" };
  if (path === "/outbox") return { name: "outbox" };
  if (path === "/timers") return { name: "timers" };
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
    case "login":
      return "/login";
  }
}

/** Small hand-written History-API hook, adapted from packages/app/src/routing.ts — five routes don't justify a router dependency. */
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
