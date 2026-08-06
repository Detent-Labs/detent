import { describe, it, expect } from "bun:test";
import { matchRoute, routePath, type Route } from "../src/areas/reporting/routing.js";

const VIEWS: Route[] = [
  { name: "view", view: "cycle-time", processId: "proc_1" },
  { name: "view", view: "bottleneck", processId: "proc_1" },
  { name: "view", view: "sla", processId: "proc_1" },
];

describe("the reporting area's process-view routes", () => {
  it("matches each of the three views", () => {
    for (const route of VIEWS) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("round-trips every route through routePath", () => {
    for (const route of VIEWS) expect(matchRoute(routePath(route))).toEqual(route);
    expect(matchRoute(routePath({ name: "picker" }))).toEqual({ name: "picker" });
  });

  it("falls back to the picker for an unrecognized view", () => {
    expect(matchRoute("/processes/proc_1/nonsense")).toEqual({ name: "picker" });
  });

  it("leaves a deeper path on the picker fallback rather than half-matching", () => {
    expect(matchRoute("/processes/proc_1/sla/extra")).toEqual({ name: "picker" });
  });

  it("keeps the three views from colliding on their shared /processes/:id/ prefix", () => {
    expect(matchRoute("/processes/proc_1/cycle-time")).toEqual({ name: "view", view: "cycle-time", processId: "proc_1" });
    expect(matchRoute("/processes/proc_1/sla")).toEqual({ name: "view", view: "sla", processId: "proc_1" });
  });
});
