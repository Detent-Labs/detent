import { useCallback, useEffect, useState } from "react";

export type Route = { name: "processes" } | { name: "edit"; processId: string } | { name: "login" };

/** Pure — testable without a DOM. An unrecognized path falls back to the process list rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/login") return { name: "login" };
  const editMatch = /^\/processes\/([^/]+)\/edit$/.exec(path);
  if (editMatch) return { name: "edit", processId: decodeURIComponent(editMatch[1]!) };
  return { name: "processes" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "processes":
      return "/";
    case "edit":
      return `/processes/${encodeURIComponent(route.processId)}/edit`;
    case "login":
      return "/login";
  }
}

/** Small hand-written History-API hook, adapted from packages/app/src/routing.ts — three routes don't justify a router dependency. */
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
