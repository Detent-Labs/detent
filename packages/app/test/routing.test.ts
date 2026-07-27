import { describe, expect, it } from "bun:test";
import { matchRoute, routePath } from "../src/routing.js";

describe("matchRoute", () => {
  it("resolves the inbox route", () => {
    expect(matchRoute("/")).toEqual({ name: "tasks" });
  });

  it("resolves the start route", () => {
    expect(matchRoute("/start")).toEqual({ name: "start" });
  });

  it("resolves the login route", () => {
    expect(matchRoute("/login")).toEqual({ name: "login" });
  });

  it("resolves a task route, decoding the instance id", () => {
    expect(matchRoute("/tasks/inst_abc%20123")).toEqual({ name: "task", instanceId: "inst_abc 123" });
  });

  it("falls back to the inbox for an unrecognized path", () => {
    expect(matchRoute("/nowhere")).toEqual({ name: "tasks" });
  });
});

describe("routePath", () => {
  it("round-trips every route through matchRoute", () => {
    const routes = [{ name: "tasks" as const }, { name: "start" as const }, { name: "login" as const }, { name: "task" as const, instanceId: "inst_1" }];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("encodes the instance id in a task route's path", () => {
    expect(routePath({ name: "task", instanceId: "inst abc" })).toBe("/tasks/inst%20abc");
  });
});
