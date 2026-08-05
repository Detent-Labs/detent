export type Route =
  | { name: "processes" }
  | { name: "edit"; processId: string }
  | { name: "versions"; processId: string }
  | { name: "migrate"; processId: string; from: string; to: string }
  | { name: "tools" }
  | { name: "play"; processId: string }
  | { name: "templates" };

/**
 * Pure — testable without a DOM, and prefix-unaware: the shell strips `/studio`
 * before calling this and prepends it to what `routePath` returns, so the
 * migrate route below is matched against exactly the path it saw before the
 * consolidation. An unrecognized path falls back to the process list rather
 * than a dead end.
 */
export function matchRoute(path: string): Route {
  if (path === "/tools") return { name: "tools" };
  if (path === "/templates") return { name: "templates" };
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
    case "versions":
      return `/processes/${encodeURIComponent(route.processId)}/versions`;
    case "migrate":
      return `/processes/${encodeURIComponent(route.processId)}/migrate/${route.from}/${route.to}`;
    case "tools":
      return "/tools";
    case "play":
      return `/processes/${encodeURIComponent(route.processId)}/play`;
    case "templates":
      return "/templates";
  }
}

/**
 * The role each route's screen needs. Area entry admits either role (see
 * `shell/areas.ts`), so this is the second, narrower gate: an actor holding
 * only `system:templates` reaches the templates screen and nothing else.
 *
 * Homed here rather than in `root.tsx` so it stays readable without React —
 * `root.tsx` pulls in every screen and the area stylesheet. The same placement
 * the admin area's map takes, and for the same reason. The server's
 * `requireRole` on every studio route stays the enforcement; this is display
 * logic.
 */
export const ROUTE_ROLE: Record<Route["name"], string> = {
  processes: "system:developer",
  edit: "system:developer",
  versions: "system:developer",
  migrate: "system:developer",
  tools: "system:developer",
  play: "system:developer",
  templates: "system:templates",
};
