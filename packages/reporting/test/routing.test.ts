/** Pure route matching — no DOM. Mirrors packages/admin/test/routing.test.ts. */
import { test, expect } from "bun:test";
import { matchRoute, routePath, type Route } from "../src/routing.js";

test("the root path is the process picker", () => {
  expect(matchRoute("/")).toEqual({ name: "picker" });
});

test("a view path carries both the process and the view", () => {
  expect(matchRoute("/processes/proc_expense/cycle-time")).toEqual({ name: "view", view: "cycle-time", processId: "proc_expense" });
  expect(matchRoute("/processes/proc_expense/bottleneck")).toEqual({ name: "view", view: "bottleneck", processId: "proc_expense" });
  expect(matchRoute("/processes/proc_expense/sla")).toEqual({ name: "view", view: "sla", processId: "proc_expense" });
});

test("an unknown view name falls back to the picker rather than a dead end", () => {
  expect(matchRoute("/processes/proc_expense/histogram")).toEqual({ name: "picker" });
});

test("an unrecognized path falls back to the picker", () => {
  expect(matchRoute("/nowhere")).toEqual({ name: "picker" });
});

test("a process id survives round-tripping through the path", () => {
  const route: Route = { name: "view", view: "sla", processId: "proc_a/b c" };
  expect(matchRoute(routePath(route))).toEqual(route);
});

test("every route round-trips", () => {
  const routes: Route[] = [
    { name: "picker" },
    { name: "login" },
    { name: "view", view: "cycle-time", processId: "proc_x" },
  ];
  for (const route of routes) expect(matchRoute(routePath(route))).toEqual(route);
});
