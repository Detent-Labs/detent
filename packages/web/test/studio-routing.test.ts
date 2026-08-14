import { describe, it, expect } from "bun:test";
import { matchRoute, routePath, ROUTE_ROLE, PANEL_VIEWS, type Route } from "../src/areas/studio/routing.js";
import { mayEnter } from "../src/shell/areas.js";

const DEVELOPER_ROLE = "system:developer";
const AUTHOR_ROLE = "system:author";
const TEMPLATES_ROLE = "system:templates";

/** The four screens both authoring roles reach. */
const AUTHORING_ROUTES = ["processes", "edit", "versions", "play"] as const;
/** The two the map keeps behind the developer role alone. */
const DEVELOPER_ONLY_ROUTES = ["migrate", "tools"] as const;

const reaches = (name: Route["name"], roles: string[]) => ROUTE_ROLE[name].some((role) => roles.includes(role));

const EVERY_ROUTE: Route[] = [
  { name: "processes" },
  { name: "edit", processId: "proc_1" },
  { name: "edit", processId: "proc_1", formStepId: "step_1" },
  { name: "edit", processId: "proc_1", panel: "fields" },
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

describe("the panels screen's panel sub-state of the edit route", () => {
  it("round-trips /processes/:id/edit/panels/:view, per view", () => {
    for (const panel of PANEL_VIEWS) {
      const route: Route = { name: "edit", processId: "proc_1", panel };
      expect(routePath(route)).toBe(`/processes/proc_1/edit/panels/${panel}`);
      expect(matchRoute(routePath(route))).toEqual(route);
    }
  });

  it("falls back to the plain edit route on an unrecognized view", () => {
    // A typo lands on the canvas, not on a dead end. The top-level table
    // answers an unrecognized path with the process list; this is that rule
    // one level down.
    expect(matchRoute("/processes/proc_1/edit/panels/nonsense")).toEqual({ name: "edit", processId: "proc_1" });
  });

  it("stays distinct from the plain edit path and from a form path", () => {
    const plain = matchRoute("/processes/proc_1/edit");
    const withPanel = matchRoute("/processes/proc_1/edit/panels/fields");
    const withForm = matchRoute("/processes/proc_1/edit/form/step_1");
    expect(withPanel).toEqual({ name: "edit", processId: "proc_1", panel: "fields" });
    expect(withPanel).not.toEqual(plain);
    expect(withPanel).not.toEqual(withForm);
  });

  it("prefers the form path when both fields are set, so one path is emitted", () => {
    const route: Route = { name: "edit", processId: "proc_1", formStepId: "step_1", panel: "fields" };
    expect(routePath(route)).toBe("/processes/proc_1/edit/form/step_1");
  });
});

describe("the studio area's per-screen role gate", () => {
  it("names a role for every route, so no screen is ungated by omission", () => {
    for (const route of EVERY_ROUTE) expect(ROUTE_ROLE[route.name].length).toBeGreaterThan(0);
  });

  it("admits both authoring roles to the four authoring screens", () => {
    for (const name of AUTHORING_ROUTES) {
      expect(reaches(name, [DEVELOPER_ROLE])).toBe(true);
      expect(reaches(name, [AUTHOR_ROLE])).toBe(true);
    }
  });

  it("keeps migration planning and Tools behind the developer role alone", () => {
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

  // The gate this change exists for: an author authors, and does not migrate.
  it("reaches neither migration planning nor Tools for an actor holding only the author role", () => {
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
