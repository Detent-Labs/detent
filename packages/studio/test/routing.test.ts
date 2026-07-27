import { describe, expect, it } from "bun:test";
import { matchRoute, routePath } from "../src/routing.js";

describe("matchRoute", () => {
  it("resolves the processes route", () => {
    expect(matchRoute("/")).toEqual({ name: "processes" });
  });

  it("resolves the login route", () => {
    expect(matchRoute("/login")).toEqual({ name: "login" });
  });

  it("resolves an edit route, decoding the process id", () => {
    expect(matchRoute("/processes/proc_abc%20123/edit")).toEqual({ name: "edit", processId: "proc_abc 123" });
  });

  it("falls back to the process list for an unrecognized path", () => {
    expect(matchRoute("/nowhere")).toEqual({ name: "processes" });
  });
});

describe("routePath", () => {
  it("round-trips every route through matchRoute", () => {
    const routes = [{ name: "processes" as const }, { name: "login" as const }, { name: "edit" as const, processId: "proc_1" }];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("encodes the process id in an edit route's path", () => {
    expect(routePath({ name: "edit", processId: "proc abc" })).toBe("/processes/proc%20abc/edit");
  });
});
