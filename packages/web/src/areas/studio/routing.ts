/** The six process-wide views, in rail order. The panels screen re-exports
 * this as its own; routing owns it so the route type needs no import from a
 * component. */
export type PanelView = "fields" | "dataSources" | "contract" | "matrix" | "changes" | "paths";

export const PANEL_VIEWS: PanelView[] = ["fields", "dataSources", "contract", "matrix", "changes", "paths"];

const isPanelView = (v: string): v is PanelView => (PANEL_VIEWS as string[]).includes(v);

export type Route =
  | { name: "processes" }
  | { name: "edit"; processId: string; formStepId?: string; panel?: PanelView; stepId?: string }
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
  // Matched before the plain edit route: a form-editor path is a sub-state
  // of `edit`, carried as an optional field on the same route, not a
  // sibling top-level route (design.md's routing decision).
  const editFormMatch = /^\/processes\/([^/]+)\/edit\/form\/([^/]+)$/.exec(path);
  if (editFormMatch) {
    return {
      name: "edit",
      processId: decodeURIComponent(editFormMatch[1]!),
      formStepId: decodeURIComponent(editFormMatch[2]!),
    };
  }
  // The panels screen is the second sub-state of `edit`, on the same footing as
  // the form editor above. An unrecognized view falls through to the plain edit
  // route below, so a typo lands on the canvas rather than a dead end.
  const editPanelMatch = /^\/processes\/([^/]+)\/edit\/panels\/([^/]+)$/.exec(path);
  if (editPanelMatch && isPanelView(editPanelMatch[2]!)) {
    return {
      name: "edit",
      processId: decodeURIComponent(editPanelMatch[1]!),
      panel: editPanelMatch[2],
    };
  }
  if (editPanelMatch) return { name: "edit", processId: decodeURIComponent(editPanelMatch[1]!) };
  // The step target (`unified-shell`'s replace-mode navigation): a third
  // sub-state of `edit`, at its own path segment ranked after the two above.
  // A malformed tail — no id, or more than one segment — falls back to the
  // plain edit route rather than half-matching or falling through to the
  // process list, the same leniency `editPanelMatch` already gives an
  // unrecognized `:view`.
  const editStepPrefix = /^\/processes\/([^/]+)\/edit\/step(\/.*)?$/.exec(path);
  if (editStepPrefix) {
    const tail = /^\/([^/]+)$/.exec(editStepPrefix[2] ?? "");
    if (tail) return { name: "edit", processId: decodeURIComponent(editStepPrefix[1]!), stepId: decodeURIComponent(tail[1]!) };
    return { name: "edit", processId: decodeURIComponent(editStepPrefix[1]!) };
  }
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
      if (route.formStepId)
        return `/processes/${encodeURIComponent(route.processId)}/edit/form/${encodeURIComponent(route.formStepId)}`;
      // `panel` needs no encoding: it is one of six literals, not user input.
      if (route.panel) return `/processes/${encodeURIComponent(route.processId)}/edit/panels/${route.panel}`;
      if (route.stepId) return `/processes/${encodeURIComponent(route.processId)}/edit/step/${encodeURIComponent(route.stepId)}`;
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
 * The roles each route's screen admits — any one of them reaches it. Area
 * entry admits any of three (see `shell/areas.ts`), so this is the second,
 * narrower gate: an actor holding only `system:templates` reaches the
 * templates screen and nothing else, and an actor holding only
 * `system:author` reaches the five authoring screens but not Tools.
 *
 * A set per screen, unlike the admin area's one string per screen. Admin's two
 * roles partition its screens cleanly; the two authoring roles here do not,
 * since both reach the same five screens.
 *
 * Homed here rather than in `root.tsx` so it stays readable without React —
 * `root.tsx` pulls in every screen and the area stylesheet. The same placement
 * the admin area's map takes, and for the same reason. The server's role check
 * on every studio route stays the enforcement; this is display logic.
 */
const AUTHORING = ["system:developer", "system:author"] as const;

export const ROUTE_ROLE: Record<Route["name"], readonly string[]> = {
  processes: AUTHORING,
  edit: AUTHORING,
  versions: AUTHORING,
  // Reaching this route no longer implies permission to plan a migration for
  // the process in view: `can(actor, "migrate", processId, db)` (see
  // `authorization`) decides that, both server-side and, via the draft's
  // `canPlanMigration`, in what the Versions screen offers.
  migrate: AUTHORING,
  play: AUTHORING,
  // Developer-only: Tools reads the running deployment's registry, a global
  // operation no scoped grant names a process for.
  tools: ["system:developer"],
  templates: ["system:templates"],
};
