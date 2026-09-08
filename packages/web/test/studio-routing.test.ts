import { describe, it, expect } from "bun:test";
import {
  matchRoute,
  routePath,
  ROUTE_ROLE,
  PANEL_VIEWS,
  PANEL_VIEW_TAB,
  PROCESS_TABS,
  type Route,
} from "../src/areas/studio/routing.js";
import { mayEnter } from "../src/shell/areas.js";

const DEVELOPER_ROLE = "system:developer";
const AUTHOR_ROLE = "system:author";
const TEMPLATES_ROLE = "system:templates";

/** The five screens both authoring roles reach. */
const AUTHORING_ROUTES = ["processes", "edit", "versions", "migrate", "play"] as const;
/** The one the map keeps behind the developer role alone. */
const DEVELOPER_ONLY_ROUTES = ["tools"] as const;

const reaches = (name: Route["name"], roles: string[]) => ROUTE_ROLE[name].some((role) => roles.includes(role));

const EVERY_ROUTE: Route[] = [
  { name: "processes" },
  { name: "edit", processId: "proc_1" },
  { name: "edit", processId: "proc_1", formStepId: "step_1" },
  { name: "edit", processId: "proc_1", tab: "fields" },
  { name: "edit", processId: "proc_1", stepId: "step_1" },
  { name: "versions", processId: "proc_1" },
  { name: "migrate", processId: "proc_1", from: "1", to: "2" },
  { name: "tools" },
  { name: "play", processId: "proc_1" },
  { name: "templates" },
];

describe("the studio area's templates route", () => {
  it("matches the templates path", () => {
    expect(matchRoute("/templates")).toEqual({ name: "templates" });
  });

  it("round-trips every route", () => {
    for (const route of EVERY_ROUTE) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("leaves a deeper path on the process list fallback rather than half-matching", () => {
    expect(matchRoute("/templates/approval")).toEqual({ name: "processes" });
  });

  it("keeps the /processes/:id/... routes from colliding on their shared prefix", () => {
    expect(matchRoute("/processes/proc_1/edit")).toEqual({ name: "edit", processId: "proc_1" });
    expect(matchRoute("/processes/proc_1/versions")).toEqual({ name: "versions", processId: "proc_1" });
    expect(matchRoute("/processes/proc_1/play")).toEqual({ name: "play", processId: "proc_1" });
  });
});

describe("the form editor's formStepId sub-state of the edit route", () => {
  it("round-trips /processes/:id/edit/form/:stepId", () => {
    const route: Route = { name: "edit", processId: "proc_1", formStepId: "step_1" };
    expect(routePath(route)).toBe("/processes/proc_1/edit/form/step_1");
    expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("stays distinct from the plain edit path", () => {
    const plain = matchRoute("/processes/proc_1/edit");
    const withForm = matchRoute("/processes/proc_1/edit/form/step_1");
    expect(plain).toEqual({ name: "edit", processId: "proc_1" });
    expect(withForm).toEqual({ name: "edit", processId: "proc_1", formStepId: "step_1" });
    expect(withForm).not.toEqual(plain);
  });
});

describe("the open tab's sub-state of the edit route", () => {
  it("round-trips /processes/:id/edit/:tab, per tab", () => {
    for (const tab of PROCESS_TABS) {
      const route: Route = { name: "edit", processId: "proc_1", tab };
      expect(routePath(route)).toBe(`/processes/proc_1/edit/${tab}`);
      expect(matchRoute(routePath(route))).toEqual(route);
    }
  });

  it("holds ten tabs, in authoring order", () => {
    expect(PROCESS_TABS).toEqual([
      "canvas",
      "steps",
      "fields",
      "dataSources",
      "paths",
      "forms",
      "matrix",
      "contract",
      "changes",
      "checks",
    ]);
  });

  it("falls back to the plain edit route on an unrecognized tab name", () => {
    // A typo lands on the canvas, not on a dead end. The top-level table
    // answers an unrecognized path with the process list; this is that rule
    // one level down.
    expect(matchRoute("/processes/proc_1/edit/nonsense")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("opens the canvas for an address naming no tab", () => {
    expect(matchRoute("/processes/proc_1/edit")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("stays distinct from the plain edit path and from a form path", () => {
    const plain = matchRoute("/processes/proc_1/edit");
    const withTab = matchRoute("/processes/proc_1/edit/fields");
    const withForm = matchRoute("/processes/proc_1/edit/form/step_1");
    expect(withTab).toEqual({ name: "edit", processId: "proc_1", tab: "fields" });
    expect(withTab).not.toEqual(plain);
    expect(withTab).not.toEqual(withForm);
  });

  it("prefers the form path when both fields are set, so one path is emitted", () => {
    const route: Route = { name: "edit", processId: "proc_1", formStepId: "step_1", tab: "fields" };
    expect(routePath(route)).toBe("/processes/proc_1/edit/form/step_1");
  });
});

describe("the retired panels address", () => {
  it("maps each old view name onto the tab that holds it now", () => {
    for (const view of PANEL_VIEWS) {
      expect(matchRoute(`/processes/proc_1/edit/panels/${view}`)).toEqual({
        name: "edit",
        processId: "proc_1",
        tab: PANEL_VIEW_TAB[view],
      });
    }
  });

  it("names a tab the row actually holds, for every one of the six", () => {
    for (const view of PANEL_VIEWS) expect(PROCESS_TABS).toContain(PANEL_VIEW_TAB[view]);
  });

  it("falls back to the plain edit route on an unrecognized view", () => {
    expect(matchRoute("/processes/proc_1/edit/panels/nonsense")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("emits no panels path any more, so nothing writes the retired address", () => {
    expect(routePath({ name: "edit", processId: "proc_1", tab: "fields" })).not.toContain("/panels/");
  });
});

describe("the step target's sub-state of the edit route", () => {
  it("round-trips /processes/:id/edit/step/:stepId", () => {
    const route: Route = { name: "edit", processId: "proc_1", stepId: "step_1" };
    expect(routePath(route)).toBe("/processes/proc_1/edit/step/step_1");
    expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("falls back to the plain edit route rather than half-matching, with no id", () => {
    expect(matchRoute("/processes/proc_1/edit/step")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("falls back to the plain edit route rather than half-matching, with a deeper path", () => {
    expect(matchRoute("/processes/proc_1/edit/step/a/b")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("stays distinct from the form-editor and tab sub-states, with no collision between the three", () => {
    const plain = matchRoute("/processes/proc_1/edit");
    const withForm = matchRoute("/processes/proc_1/edit/form/step_1");
    const withTab = matchRoute("/processes/proc_1/edit/fields");
    const withStep = matchRoute("/processes/proc_1/edit/step/step_1");
    expect(withStep).toEqual({ name: "edit", processId: "proc_1", stepId: "step_1" });
    expect(withStep).not.toEqual(plain);
    expect(withStep).not.toEqual(withForm);
    expect(withStep).not.toEqual(withTab);
  });
});

describe("the studio area's per-screen role gate", () => {
  it("names a role for every route, so no screen is ungated by omission", () => {
    for (const route of EVERY_ROUTE) expect(ROUTE_ROLE[route.name].length).toBeGreaterThan(0);
  });

  it("admits both authoring roles to the five authoring screens", () => {
    for (const name of AUTHORING_ROUTES) {
      expect(reaches(name, [DEVELOPER_ROLE])).toBe(true);
      expect(reaches(name, [AUTHOR_ROLE])).toBe(true);
    }
  });

  it("keeps Tools behind the developer role alone", () => {
    for (const name of DEVELOPER_ONLY_ROUTES) {
      expect(ROUTE_ROLE[name]).toEqual([DEVELOPER_ROLE]);
    }
  });

  it("puts the templates screen behind the templates role alone", () => {
    expect(ROUTE_ROLE.templates).toEqual([TEMPLATES_ROLE]);
  });

  // The gate stage 27d added: widening area entry must not widen the screens
  // inside it.
  it("reaches no authoring screen for an actor holding only the templates role", () => {
    for (const route of EVERY_ROUTE.filter((r) => r.name !== "templates")) {
      expect(reaches(route.name, [TEMPLATES_ROLE])).toBe(false);
    }
    expect(reaches("templates", [TEMPLATES_ROLE])).toBe(true);
  });

  it("reaches no templates screen for an actor holding only the developer role", () => {
    expect(reaches("templates", [DEVELOPER_ROLE])).toBe(false);
  });

  // A scoped `migrate` grant, not this map, decides whether an author's
  // actual migration-plan call succeeds for a given process (authorization).
  it("reaches no Tools screen for an actor holding only the author role", () => {
    for (const name of DEVELOPER_ONLY_ROUTES) {
      expect(reaches(name, [AUTHOR_ROLE])).toBe(false);
    }
    expect(reaches("templates", [AUTHOR_ROLE])).toBe(false);
  });

  it("keeps every screen the developer role reached before", () => {
    for (const route of EVERY_ROUTE.filter((r) => r.name !== "templates")) {
      expect(reaches(route.name, [DEVELOPER_ROLE])).toBe(true);
    }
  });
});

describe("studio area entry", () => {
  it("admits any of the three studio roles", () => {
    expect(mayEnter("studio", [DEVELOPER_ROLE])).toBe(true);
    expect(mayEnter("studio", [AUTHOR_ROLE])).toBe(true);
    expect(mayEnter("studio", [TEMPLATES_ROLE])).toBe(true);
  });

  it("refuses an actor holding none of them", () => {
    expect(mayEnter("studio", [])).toBe(false);
    expect(mayEnter("studio", ["system:admin"])).toBe(false);
  });

  /**
   * The stranded-default case `root.tsx` redirects away from: `matchRoute`
   * falls back to the process list, which the map denies a curator, so entry
   * alone would land them on a refusal.
   */
  it("falls back to a route the curator's own role does not open", () => {
    const fallback = matchRoute("/");
    expect(fallback).toEqual({ name: "processes" });
    expect(reaches(fallback.name, [TEMPLATES_ROLE])).toBe(false);
  });

  /** An author needs no such redirect: the map admits them to the default. */
  it("falls back to a route the author's own role does open", () => {
    expect(reaches(matchRoute("/").name, [AUTHOR_ROLE])).toBe(true);
  });
});
