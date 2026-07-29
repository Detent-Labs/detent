import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "processes" }
  | { name: "edit"; processId: string }
  | { name: "login" }
  | { name: "versions"; processId: string }
  | { name: "migrate"; processId: string; from: string; to: string }
  | { name: "tools" }
  | { name: "play"; processId: string };

/** Pure — testable without a DOM. An unrecognized path falls back to the process list rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/login") return { name: "login" };
  if (path === "/tools") return { name: "tools" };
  const editMatch = /^\/processes\/([^/]+)\/edit$/.exec(path);
  if (editMatch) return { name: "edit", processId: decodeURIComponent(editMatch[1]!) };
  const versionsMatch = /^\/processes\/([^/]+)\/versions$/.exec(path);
  if (versionsMatch) return { name: "versions", processId: decodeURIComponent(versionsMatch[1]!) };
  const migrateMatch = /^\/processes\/([^/]+)\/migrate\/([^/]+)\/([^/]+)$/.exec(path);
  if (migrateMatch)
    return { name: "migrate", processId: decodeURIComponent(migrateMatch[1]!), from: migrateMatch[2]!, to: migrateMatch[3]! };
  const playMatch = /^\/processes\/([^/]+)\/play$/.exec(path);
  if (playMatch) return { name: "play", processId: decodeURIComponent(playMatch[1]!) };
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
    case "versions":
      return `/processes/${encodeURIComponent(route.processId)}/versions`;
    case "migrate":
      return `/processes/${encodeURIComponent(route.processId)}/migrate/${route.from}/${route.to}`;
    case "tools":
      return "/tools";
    case "play":
      return `/processes/${encodeURIComponent(route.processId)}/play`;
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
