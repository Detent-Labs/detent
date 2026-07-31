import { useCallback, useEffect, useState } from "react";

/**
 * Every view route carries the selected process, so the selection survives a
 * view switch by construction rather than by a state variable the router could
 * fall out of step with. A bare `/` is the picker.
 */
export type Route =
  | { name: "picker" }
  | { name: "view"; view: ViewName; processId: string }
  | { name: "login" };

export type ViewName = "cycle-time" | "bottleneck" | "sla";

const VIEWS: ViewName[] = ["cycle-time", "bottleneck", "sla"];

function isView(raw: string): raw is ViewName {
  return (VIEWS as string[]).includes(raw);
}

/** Pure — testable without a DOM. An unrecognized path falls back to the picker rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/login") return { name: "login" };
  const match = /^\/processes\/([^/]+)\/([^/]+)$/.exec(path);
  if (match && isView(match[2]!)) {
    return { name: "view", view: match[2], processId: decodeURIComponent(match[1]!) };
  }
  return { name: "picker" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "picker":
      return "/";
    case "view":
      return `/processes/${encodeURIComponent(route.processId)}/${route.view}`;
    case "login":
      return "/login";
  }
}

/** Small hand-written History-API hook, adapted from packages/admin/src/routing.ts — three views don't justify a router dependency. */
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
