import { describe, it, expect } from "bun:test";
import { matchRoute, routePath, ROUTE_ROLE, type Route } from "../src/areas/admin/routing.js";

describe("the admin area's data list routes", () => {
  it("matches the overview and the detail path", () => {
    expect(matchRoute("/data-lists")).toEqual({ name: "dataLists" });
    expect(matchRoute("/data-lists/cost_centres")).toEqual({ name: "dataList", listKey: "cost_centres" });
  });

  it("decodes a list key carrying a reserved character", () => {
    expect(matchRoute("/data-lists/cost%20centres")).toEqual({ name: "dataList", listKey: "cost centres" });
  });

  it("round-trips both routes", () => {
    const routes: Route[] = [{ name: "dataLists" }, { name: "dataList", listKey: "cost centres" }];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("leaves a deeper path on the instances fallback rather than half-matching", () => {
    expect(matchRoute("/data-lists/a/b")).toEqual({ name: "instances" });
  });
});

describe("the admin area's per-screen role gate", () => {
  const ROUTES: Route[] = [
    { name: "instances" },
    { name: "instance", instanceId: "inst_1" },
    { name: "outbox" },
    { name: "timers" },
    { name: "users" },
    { name: "migrations" },
    { name: "dataLists" },
    { name: "dataList", listKey: "cost_centres" },
  ];

  it("names a role for every route, so no screen renders ungated", () => {
    for (const route of ROUTES) expect(ROUTE_ROLE[route.name]).toBeTruthy();
    expect(Object.keys(ROUTE_ROLE).sort()).toEqual(ROUTES.map((r) => r.name).sort());
  });

  it("keeps the operations screens behind system:admin", () => {
    const operations = ["instances", "instance", "outbox", "timers", "users", "migrations"] as const;
    for (const name of operations) expect(ROUTE_ROLE[name]).toBe("system:admin");
  });

  it("puts the data list screens behind system:datalists, not system:admin", () => {
    // The maintainers of a value list must not need the power to cancel instances.
    expect(ROUTE_ROLE.dataLists).toBe("system:datalists");
    expect(ROUTE_ROLE.dataList).toBe("system:datalists");
  });

  it("shows a maintainer their screens and no operations screen", () => {
    const roles = ["system:datalists"];
    const reachable = ROUTES.filter((r) => roles.includes(ROUTE_ROLE[r.name])).map((r) => r.name);
    expect(reachable).toEqual(["dataLists", "dataList"]);
  });

  it("shows an operator the operations screens and no data list screen", () => {
    const roles = ["system:admin"];
    const reachable = ROUTES.filter((r) => roles.includes(ROUTE_ROLE[r.name])).map((r) => r.name);
    expect(reachable).toEqual(["instances", "instance", "outbox", "timers", "users", "migrations"]);
  });
});
