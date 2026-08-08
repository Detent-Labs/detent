import { useCallback, useEffect, useState } from "react";
import { isArea, type Area } from "./areas.js";

/**
 * The shell owns `location.pathname`. It splits the first segment off as the
 * area and hands only the remainder to that area's own matcher, then prepends
 * the same prefix to whatever that area's own path builder returns.
 *
 * That is what lets each area's `matchRoute`/`routePath` stay exactly as it was
 * before the consolidation, prefix-unaware and testable without a DOM.
 * ROADMAP.md item 12 assumed all four would be rewritten; stripping the prefix
 * here is what makes that unnecessary.
 */
export type ShellLocation =
  | { kind: "login" }
  | { kind: "profile" }
  | { kind: "root" }
  | { kind: "area"; area: Area; path: string }
  | { kind: "unknown" };

export function matchShell(pathname: string): ShellLocation {
  const [head, ...rest] = pathname.split("/").filter(Boolean);
  if (head === undefined) return { kind: "root" };
  if (head === "login") return { kind: "login" };
  // The profile page is one page, not an area: it owns the whole segment and
  // hands no remainder to anybody, so anything below it names nothing.
  if (head === "profile") return rest.length === 0 ? { kind: "profile" } : { kind: "unknown" };
  if (isArea(head)) return { kind: "area", area: head, path: `/${rest.join("/")}` };
  return { kind: "unknown" };
}

/** `/studio` for a local `/`, never `/studio/` — a trailing slash would round-trip differently. */
export function areaHref(area: Area, localPath: string): string {
  return localPath === "/" ? `/${area}` : `/${area}${localPath}`;
}

export const LOGIN_PATH = "/login";

/** Names no area, and differs from every API route path — the engine matches its route table before it falls through to static serving. */
export const PROFILE_PATH = "/profile";

/** Small hand-written History-API hook — one copy now, where there were four. */
export function useLocation(): { pathname: string; go: (href: string) => void } {
  const [pathname, setPathname] = useState(() => (typeof location === "undefined" ? "/" : location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const go = useCallback((href: string) => {
    if (href !== location.pathname) history.pushState(null, "", href);
    setPathname(href);
  }, []);

  return { pathname, go };
}

/**
 * Binds an area's own pure matcher and path builder to the shell's location.
 * The area passes its existing functions unchanged; the prefix is handled here
 * and nowhere else.
 */
export function useAreaRoute<R>(
  area: Area,
  localPath: string,
  match: (path: string) => R,
  toPath: (route: R) => string,
  go: (href: string) => void,
): { route: R; navigate: (route: R) => void } {
  const navigate = useCallback((route: R) => go(areaHref(area, toPath(route))), [area, toPath, go]);
  return { route: match(localPath), navigate };
}
