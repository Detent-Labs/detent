/**
 * Which sections the step page stands for a performed-by value, and which of
 * its two columns each one takes (`panels/sectionsFor.ts`), tested as pure
 * functions — no DOM, no rendering.
 */
import { describe, expect, it } from "bun:test";
import { sectionColumns, sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";

describe("sectionsFor", () => {
  it("stands the eight task sections for a step someone works", () => {
    const sections = sectionsFor("participant");

    expect(sections).toContain("paths");
    expect(sections).toContain("assignment");
    expect(sections).toContain("cancellable");
    expect(sections).toContain("entry");
    expect(sections).toContain("exit");
    expect(sections).toContain("timers");
    expect(sections).toContain("form");
    expect(sections).toContain("collaboration");
    expect(sections).toHaveLength(8);
  });

  it("names neither Which process it calls nor How the case ends on a task step", () => {
    expect(sectionsFor("participant")).not.toContain("subprocess");
    expect(sectionsFor("participant")).not.toContain("howItEnds");
  });

  it("gives an end step How the case ends, and no outgoing path", () => {
    const sections = sectionsFor("terminal");

    expect(sections).toContain("howItEnds");
    expect(sections).not.toContain("paths");
    expect(sections).not.toContain("exit");
    expect(sections).not.toContain("timers");
  });

  it("omits Assignment, Step form fields and Collaboration on a subprocess step, which has no participant form", () => {
    const sections = sectionsFor("subprocess");

    expect(sections).toContain("subprocess");
    expect(sections).not.toContain("assignment");
    expect(sections).not.toContain("form");
    expect(sections).not.toContain("collaboration");
  });

  it("hands back a fresh array, so a caller cannot reach the module's own list", () => {
    const first = sectionsFor("participant");
    first.length = 0;

    expect(sectionsFor("participant")).toHaveLength(8);
  });
});

describe("sectionColumns", () => {
  it("puts the routing and the actor in the leading column", () => {
    const { leading, trailing } = sectionColumns(sectionsFor("participant"));

    expect(leading).toEqual(["paths", "assignment", "cancellable"]);
    expect(trailing).toEqual(["entry", "exit", "timers", "form", "collaboration"]);
  });

  it("leads an end step with How the case ends", () => {
    const { leading, trailing } = sectionColumns(sectionsFor("terminal"));

    expect(leading).toEqual(["assignment", "howItEnds"]);
    expect(trailing).toEqual(["entry", "form", "collaboration"]);
  });

  it("leads a subprocess step with the process it calls", () => {
    const { leading, trailing } = sectionColumns(sectionsFor("subprocess"));

    expect(leading).toEqual(["paths", "cancellable", "subprocess"]);
    expect(trailing).toEqual(["entry", "exit", "timers"]);
  });

  it("places every section a kind stands, and no other", () => {
    for (const kind of ["participant", "subprocess", "terminal"] as const) {
      const sections = sectionsFor(kind);
      const { leading, trailing } = sectionColumns(sections);

      expect([...leading, ...trailing].sort()).toEqual([...sections].sort());
    }
  });
});
