/**
 * Which sections the configuration pane lists for a performed-by value
 * (`panels/sectionsFor.ts`), tested as a pure function — no DOM, no
 * rendering.
 */
import { describe, expect, it } from "bun:test";
import { sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";

describe("sectionsFor", () => {
  it("lists all six sections in runtime order for a participant step", () => {
    expect(sectionsFor("participant")).toEqual(["entry", "assignment", "form", "paths", "timers", "exit"]);
  });

  it("omits Paths and Timers on a terminal step, which has neither", () => {
    const sections = sectionsFor("terminal");
    expect(sections).not.toContain("paths");
    expect(sections).not.toContain("timers");
    expect(sections).toEqual(["entry", "assignment", "form", "exit"]);
  });

  it("omits Assignment and Form on a subprocess step, which has no participant form", () => {
    const sections = sectionsFor("subprocess");
    expect(sections).not.toContain("assignment");
    expect(sections).not.toContain("form");
    expect(sections).toEqual(["entry", "paths", "timers", "exit", "subprocess"]);
  });

  it("adds the Subprocess section after Exit", () => {
    const sections = sectionsFor("subprocess");
    expect(sections.indexOf("subprocess")).toBe(sections.indexOf("exit") + 1);
  });

  it("names Subprocess on no other performed-by value", () => {
    expect(sectionsFor("participant")).not.toContain("subprocess");
    expect(sectionsFor("terminal")).not.toContain("subprocess");
  });

  it("hands back a fresh array, so a caller cannot reach the module's own list", () => {
    const first = sectionsFor("participant");
    first.length = 0;
    expect(sectionsFor("participant")).toHaveLength(6);
  });
});
