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

  it("resolves a versions route, decoding the process id", () => {
    expect(matchRoute("/processes/proc_abc%20123/versions")).toEqual({ name: "versions", processId: "proc_abc 123" });
  });

  it("resolves a migrate route, decoding the process id and carrying the raw from/to segments", () => {
    expect(matchRoute("/processes/proc_abc%20123/migrate/1/2")).toEqual({
      name: "migrate",
      processId: "proc_abc 123",
      from: "1",
      to: "2",
    });
  });

  it("falls back to the process list for an unrecognized path", () => {
    expect(matchRoute("/nowhere")).toEqual({ name: "processes" });
  });
});

describe("routePath", () => {
  it("round-trips every route through matchRoute", () => {
    const routes = [
      { name: "processes" as const },
      { name: "login" as const },
      { name: "edit" as const, processId: "proc_1" },
      { name: "versions" as const, processId: "proc_1" },
      { name: "migrate" as const, processId: "proc_1", from: "1", to: "2" },
    ];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("encodes the process id in an edit route's path", () => {
    expect(routePath({ name: "edit", processId: "proc abc" })).toBe("/processes/proc%20abc/edit");
  });

  it("encodes the process id in a versions route's path", () => {
    expect(routePath({ name: "versions", processId: "proc abc" })).toBe("/processes/proc%20abc/versions");
  });

  it("builds a migrate route's path from processId, from, and to", () => {
    expect(routePath({ name: "migrate", processId: "proc abc", from: "1", to: "2" })).toBe("/processes/proc%20abc/migrate/1/2");
  });
});
