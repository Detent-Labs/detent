import { describe, expect, it } from "bun:test";
import { matchRoute, routePath } from "../src/routing.js";

describe("matchRoute", () => {
  it("resolves the instances route", () => {
    expect(matchRoute("/")).toEqual({ name: "instances" });
  });

  it("resolves the outbox route", () => {
    expect(matchRoute("/outbox")).toEqual({ name: "outbox" });
  });

  it("resolves the timers route", () => {
    expect(matchRoute("/timers")).toEqual({ name: "timers" });
  });

  it("resolves the login route", () => {
    expect(matchRoute("/login")).toEqual({ name: "login" });
  });

  it("resolves an instance route, decoding the instance id", () => {
    expect(matchRoute("/instances/inst_abc%20123")).toEqual({ name: "instance", instanceId: "inst_abc 123" });
  });

  it("falls back to the instances list for an unrecognized path", () => {
    expect(matchRoute("/nowhere")).toEqual({ name: "instances" });
  });
});

describe("routePath", () => {
  it("round-trips every route through matchRoute", () => {
    const routes = [
      { name: "instances" as const },
      { name: "outbox" as const },
      { name: "timers" as const },
      { name: "login" as const },
      { name: "instance" as const, instanceId: "inst_1" },
    ];
    for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
  });

  it("encodes the instance id in an instance route's path", () => {
    expect(routePath({ name: "instance", instanceId: "inst abc" })).toBe("/instances/inst%20abc");
  });
});
