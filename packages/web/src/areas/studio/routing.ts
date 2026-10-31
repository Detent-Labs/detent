import { safeMatch } from "../../shell/safeMatch.js";

/** The six names the retired `edit/panels/:view` address carried, the
 * matcher's own vocabulary for that address. `PANEL_VIEW_TARGET` maps five
 * onto the place that holds them now; the matcher sends `changes` to the
 * Versions screen. */
export type PanelView = "fields" | "dataSources" | "contract" | "matrix" | "changes" | "paths";

export const PANEL_VIEWS: PanelView[] = ["fields", "dataSources", "contract", "matrix", "changes", "paths"];

/** The process surface's six tabs, in authoring order (`studio-process-tabs`).
 * The route type names them, so routing owns the list the same way it owns
 * `PanelView`. */
export type ProcessTab = "map" | "steps" | "fields" | "forms" | "checks" | "settings";

export const PROCESS_TABS: ProcessTab[] = ["map", "steps", "fields", "forms", "checks", "settings"];

/** The tab an address naming none opens, and the tab an unknown name falls
 * back to. */
export const DEFAULT_TAB: ProcessTab = "map";

const isProcessTab = (v: string): v is ProcessTab => (PROCESS_TABS as string[]).includes(v);

/** The Fields tab's views, in sub-row order. */
export type FieldsView = "catalog" | "matrix";
/** The Settings tab's views, in sub-row order. */
export type SettingsView = "process" | "sources" | "contract" | "access";
/** A view of a tab that carries a sub-row. */
export type TabView = FieldsView | SettingsView;

/** The Fields tab's views, in sub-row order. */
export const FIELDS_VIEWS: readonly FieldsView[] = ["catalog", "matrix"];
/** The Settings tab's views, in sub-row order. */
export const SETTINGS_VIEWS: readonly SettingsView[] = ["process", "sources", "contract", "access"];

/** Each tab's views, in sub-row order. A tab with no sub-row lists none. The
 * first entry is the view an address naming the tab alone opens. */
export const TAB_VIEWS: Record<ProcessTab, readonly TabView[]> = {
  map: [],
  steps: [],
  fields: FIELDS_VIEWS,
  forms: [],
  checks: [],
  settings: SETTINGS_VIEWS,
};

const tabHoldsView = (tab: ProcessTab, view: string): view is TabView => (TAB_VIEWS[tab] as readonly string[]).includes(view);

/** Where an address names a tab, and optionally one of its views. */
export interface TabTarget {
  tab: ProcessTab;
  view?: TabView;
}

/** Each tab literal an address may carry that names no tab, on the place
 * that holds its subject. The `changes` literal is absent: the change list
 * lives on the Versions screen, so the matcher sends it to the `versions`
 * route instead. */
export const RETIRED_TAB_TARGET: Record<"canvas" | "paths" | "matrix" | "dataSources" | "contract" | "access", TabTarget> = {
  canvas: { tab: "map" },
  paths: { tab: "steps" },
  matrix: { tab: "fields", view: "matrix" },
  dataSources: { tab: "settings", view: "sources" },
  contract: { tab: "settings", view: "contract" },
  access: { tab: "settings", view: "access" },
};

const isRetiredTab = (v: string): v is keyof typeof RETIRED_TAB_TARGET => Object.hasOwn(RETIRED_TAB_TARGET, v);

/** Each old `edit/panels/:view` name, on the place that holds it now. The
 * `changes` name is absent for the reason `RETIRED_TAB_TARGET` gives. */
export const PANEL_VIEW_TARGET: Record<Exclude<PanelView, "changes">, TabTarget> = {
  fields: { tab: "fields" },
  dataSources: { tab: "settings", view: "sources" },
  contract: { tab: "settings", view: "contract" },
  matrix: { tab: "fields", view: "matrix" },
  paths: { tab: "steps" },
};

const isPanelTarget = (v: string): v is keyof typeof PANEL_VIEW_TARGET => Object.hasOwn(PANEL_VIEW_TARGET, v);

export type Route =
  | { name: "processes" }
  | { name: "edit"; processId: string; formStepId?: string; tab?: ProcessTab; view?: TabView; stepId?: string }
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
export const matchRoute = safeMatch(matchPath, { name: "processes" });

/** The edit route on a tab target, with the view key absent rather than
 * `undefined` when the target names none, so a matched route equals its
 * literal. */
function editOn(processId: string, target: TabTarget): Route {
  return target.view === undefined
    ? { name: "edit", processId, tab: target.tab }
    : { name: "edit", processId, tab: target.tab, view: target.view };
}

function matchPath(path: string): Route {
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
  // The retired `edit/panels/:view` address, kept so an old link still lands.
  // `changes` opens the Versions screen, where the change list lives. An
  // unrecognized view falls through to the plain edit route, so a typo lands
  // on Map rather than a dead end.
  const editPanelMatch = /^\/processes\/([^/]+)\/edit\/panels\/([^/]+)$/.exec(path);
  if (editPanelMatch) {
    const processId = decodeURIComponent(editPanelMatch[1]!);
    const view = editPanelMatch[2]!;
    if (view === "changes") return { name: "versions", processId };
    if (isPanelTarget(view)) return editOn(processId, PANEL_VIEW_TARGET[view]);
    return { name: "edit", processId };
  }
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
  // A tab and one of its views. The form, panels and step addresses above
  // already took their own two-segment forms. A view the tab does not hold
  // drops, and the tab opens on its first view. An unrecognized tab falls
  // back to the plain edit route, which opens Map.
  const editViewMatch = /^\/processes\/([^/]+)\/edit\/([^/]+)\/([^/]+)$/.exec(path);
  if (editViewMatch) {
    const processId = decodeURIComponent(editViewMatch[1]!);
    const tab = editViewMatch[2]!;
    const view = editViewMatch[3]!;
    if (!isProcessTab(tab)) return { name: "edit", processId };
    return editOn(processId, tabHoldsView(tab, view) ? { tab, view } : { tab });
  }
  // The open tab, the sub-state every other one is ranked before: its tail is
  // one segment, so it cannot swallow a two-segment address. A retired tab
  // literal lands on the place that holds its subject now, and `changes` on
  // the Versions screen. An unrecognized name falls through to the plain edit
  // route, which opens Map.
  const editTabMatch = /^\/processes\/([^/]+)\/edit\/([^/]+)$/.exec(path);
  if (editTabMatch) {
    const processId = decodeURIComponent(editTabMatch[1]!);
    const tab = editTabMatch[2]!;
    if (isProcessTab(tab)) return { name: "edit", processId, tab };
    if (tab === "changes") return { name: "versions", processId };
    if (isRetiredTab(tab)) return editOn(processId, RETIRED_TAB_TARGET[tab]);
    return { name: "edit", processId };
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
      // Neither `tab` nor `view` needs encoding: each is one of a fixed set of
      // literals, not user input.
      // A view the tab does not hold drops, the same rule the matcher applies.
      if (route.tab && route.view && tabHoldsView(route.tab, route.view)) return `/processes/${encodeURIComponent(route.processId)}/edit/${route.tab}/${route.view}`;
      if (route.tab) return `/processes/${encodeURIComponent(route.processId)}/edit/${route.tab}`;
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
