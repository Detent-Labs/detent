export type Route =
  | { name: "processes" }
  | { name: "edit"; processId: string }
  | { name: "versions"; processId: string }
  | { name: "migrate"; processId: string; from: string; to: string }
  | { name: "tools" }
  | { name: "play"; processId: string };

/**
 * Pure — testable without a DOM, and prefix-unaware: the shell strips `/studio`
 * before calling this and prepends it to what `routePath` returns, so the
 * migrate route below is matched against exactly the path it saw before the
 * consolidation. An unrecognized path falls back to the process list rather
 * than a dead end.
 */
export function matchRoute(path: string): Route {
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
