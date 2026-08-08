import { describe, expect, it } from "bun:test";
import { matchRoute, routePath } from "../src/areas/app/routing.js";
import { matchShell, areaHref, PROFILE_PATH } from "../src/shell/routing.js";

describe("matchRoute", () => {
  it("resolves the inbox route", () => {
    expect(matchRoute("/")).toEqual({ name: "tasks" });
  });

  it("resolves the start route", () => {
    expect(matchRoute("/start")).toEqual({ name: "start" });
  });

  it("resolves a task route, decoding the instance id", () => {
    expect(matchRoute("/tasks/inst_abc%20123")).toEqual({ name: "task", instanceId: "inst_abc 123" });
  });

  it("falls back to the inbox for an unrecognized path", () => {
    expect(matchRoute("/nowhere")).toEqual({ name: "tasks" });
  });

  it("falls back to the inbox for a path deeper than the task route, rather than half-matching", () => {
    expect(matchRoute("/tasks/a/b")).toEqual({ name: "tasks" });
  });
});

describe("routePath", () => {
  it("round-trips every route through matchRoute", () => {
    const routes = [{ name: "tasks" as const }, { name: "start" as const }, { name: "task" as const, instanceId: "inst_1" }];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("encodes the instance id in a task route's path", () => {
    expect(routePath({ name: "task", instanceId: "inst abc" })).toBe("/tasks/inst%20abc");
  });
});

// The shell's half: it owns the prefix, so an area's pair above never sees one.
describe("matchShell", () => {
  it("resolves the root, the login screen and an unknown prefix distinctly", () => {
    expect(matchShell("/")).toEqual({ kind: "root" });
    expect(matchShell("/login")).toEqual({ kind: "login" });
    expect(matchShell("/nowhere")).toEqual({ kind: "unknown" });
  });

  it("splits the area off and hands the remainder to the area", () => {
    expect(matchShell("/app/tasks/inst_1")).toEqual({ kind: "area", area: "app", path: "/tasks/inst_1" });
  });

  it("gives an area's own root the local path /", () => {
    expect(matchShell("/app")).toEqual({ kind: "area", area: "app", path: "/" });
  });

  it("resolves the profile page from its whole first segment", () => {
    expect(matchShell(PROFILE_PATH)).toEqual({ kind: "profile" });
  });

  it("leaves a path deeper than /profile unknown, rather than half-matching the segment", () => {
    // The profile page hands no remainder to anybody, so `/profile/settings`
    // names nothing and takes the same redirect an unknown prefix does.
    expect(matchShell("/profile/settings")).toEqual({ kind: "unknown" });
  });
});

describe("areaHref", () => {
  it("produces the bare prefix for an area's own root, with no trailing slash", () => {
    expect(areaHref("app", "/")).toBe("/app");
  });

  it("round-trips every app route through the prefix", () => {
    const routes = [{ name: "tasks" as const }, { name: "start" as const }, { name: "task" as const, instanceId: "inst_1" }];
    for (const route of routes) {
      const here = matchShell(areaHref("app", routePath(route)));
      expect(here.kind).toBe("area");
      if (here.kind === "area") expect(matchRoute(here.path)).toEqual(route);
    }
  });
});
