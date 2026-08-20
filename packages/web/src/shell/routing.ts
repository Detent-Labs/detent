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

/** Navigation options every `go`/`navigate` call takes. `replace` swaps
 * `history.pushState` for `history.replaceState`, for a route that consumes a
 * one-shot target and clears it from its own address (`unified-shell`'s
 * navigation requirement): pushing there would leave the target's URL as a
 * live history entry, so a later Back would return to it, re-trigger
 * whatever consumed the target, and push the cleared address again — Back
 * could then never reach the screen the navigation came from. */
export interface NavigateOptions {
  replace?: boolean;
}

/** Small hand-written History-API hook — one copy now, where there were four. */
export function useLocation(): { pathname: string; go: (href: string, opts?: NavigateOptions) => void } {
  const [pathname, setPathname] = useState(() => (typeof location === "undefined" ? "/" : location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const go = useCallback((href: string, opts?: NavigateOptions) => {
    if (href !== location.pathname) {
      if (opts?.replace) history.replaceState(null, "", href);
      else history.pushState(null, "", href);
    }
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
  go: (href: string, opts?: NavigateOptions) => void,
): { route: R; navigate: (route: R, opts?: NavigateOptions) => void } {
  const navigate = useCallback((route: R, opts?: NavigateOptions) => go(areaHref(area, toPath(route)), opts), [area, toPath, go]);
  return { route: match(localPath), navigate };
}
