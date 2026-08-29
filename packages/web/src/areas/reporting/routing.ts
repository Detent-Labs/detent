/**
 * Every view route carries the selected process, so the selection survives a
 * view switch by construction rather than by a state variable the router could
 * fall out of step with. A bare `/` is the picker.
 *
 * The report builder is a separate route family: it names no process filter
 * survival, since a saved report already carries its own process. `/reports`
 * lists them, `/reports/new` builds one from scratch, `/reports/:reportId`
 * reopens one for editing.
 */
export type Route =
  | { name: "picker" }
  | { name: "view"; view: ViewName; processId: string }
  | { name: "reports" }
  | { name: "newReport" }
  | { name: "report"; reportId: string };

export type ViewName = "cycle-time" | "bottleneck" | "sla";

const VIEWS: ViewName[] = ["cycle-time", "bottleneck", "sla"];

function isView(raw: string): raw is ViewName {
  return (VIEWS as string[]).includes(raw);
}

/** Pure — testable without a DOM. An unrecognized path falls back to the picker rather than a dead end. */
export function matchRoute(path: string): Route {
  if (path === "/reports") return { name: "reports" };
  if (path === "/reports/new") return { name: "newReport" };
  const reportMatch = /^\/reports\/([^/]+)$/.exec(path);
  if (reportMatch) return { name: "report", reportId: decodeURIComponent(reportMatch[1]!) };
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
    case "reports":
      return "/reports";
    case "newReport":
      return "/reports/new";
    case "report":
      return `/reports/${encodeURIComponent(route.reportId)}`;
  }
}
