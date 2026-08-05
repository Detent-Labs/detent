import { describe, it, expect } from "bun:test";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "../src/areas/studio/routing.js";
import { mayEnter } from "../src/shell/areas.js";

const DEVELOPER_ROLE = "system:developer";
const TEMPLATES_ROLE = "system:templates";

const EVERY_ROUTE: Route[] = [
  { name: "processes" },
  { name: "edit", processId: "proc_1" },
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
});

describe("the studio area's per-screen role gate", () => {
  it("names a role for every route, so no screen is ungated by omission", () => {
    for (const route of EVERY_ROUTE) expect(ROUTE_ROLE[route.name]).toBeTruthy();
  });

  it("puts the six authoring screens behind the developer role", () => {
    for (const route of EVERY_ROUTE.filter((r) => r.name !== "templates")) {
      expect(ROUTE_ROLE[route.name]).toBe(DEVELOPER_ROLE);
    }
  });

  it("puts the templates screen behind the templates role alone", () => {
    expect(ROUTE_ROLE.templates).toBe(TEMPLATES_ROLE);
  });

  // The gate this change exists to keep: widening area entry must not widen the
  // screens inside it.
  it("reaches no authoring screen for an actor holding only the templates role", () => {
    const roles = [TEMPLATES_ROLE];
    for (const route of EVERY_ROUTE.filter((r) => r.name !== "templates")) {
      expect(roles.includes(ROUTE_ROLE[route.name]!)).toBe(false);
    }
    expect(roles.includes(ROUTE_ROLE.templates)).toBe(true);
  });

  it("reaches no templates screen for an actor holding only the developer role", () => {
    expect([DEVELOPER_ROLE].includes(ROUTE_ROLE.templates)).toBe(false);
  });
});

describe("studio area entry", () => {
  it("admits either studio role", () => {
    expect(mayEnter("studio", [DEVELOPER_ROLE])).toBe(true);
    expect(mayEnter("studio", [TEMPLATES_ROLE])).toBe(true);
  });

  it("refuses an actor holding neither", () => {
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
    expect(ROUTE_ROLE[fallback.name]).toBe(DEVELOPER_ROLE);
  });
});
