import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { Path, Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { pathWithTrigger, triggerForNewPath } from "../src/areas/studio/draft/createPath.js";

/**
 * `studio-canvas`: "A new path takes the trigger its source step already
 * uses", and `studio-condition-builder`: choosing "a participant's choice"
 * keeps the guard and drops `priority`. Both rules are pure, so they are
 * tested here; the two call sites are pinned by a source scan below.
 */

type DraftStep = DraftOf<Step>;
type DraftPath = DraftOf<Path>;

function step(type: string, paths?: Array<Record<string, unknown>>): DraftStep {
  return { id: "step_a", key: "a", type, ...(paths ? { paths } : {}) } as unknown as DraftStep;
}

const GUARD = { lang: "cel" as const, src: "data.amount > 1000.0" };

describe("triggerForNewPath", () => {
  it("gives a subprocess step with no path an automatic path", () => {
    expect(triggerForNewPath(step("subprocess"))).toBe("automatic");
  });

  it("gives a subprocess step an automatic path, whatever paths it already holds", () => {
    expect(triggerForNewPath(step("subprocess", [{ id: "path_1", trigger: "manual" }]))).toBe("automatic");
  });

  it("follows the first path of a step whose paths are automatic", () => {
    expect(triggerForNewPath(step("task", [{ id: "path_1", trigger: "automatic" }]))).toBe("automatic");
  });

  it("follows the first path of a step whose paths are manual", () => {
    expect(triggerForNewPath(step("task", [{ id: "path_1", trigger: "manual" }]))).toBe("manual");
  });

  it("gives an ordinary step with no path a manual path", () => {
    expect(triggerForNewPath(step("task"))).toBe("manual");
    expect(triggerForNewPath(step("task", []))).toBe("manual");
  });
});

describe("pathWithTrigger", () => {
  const automatic = {
    id: "path_1",
    key: "approve",
    label: "Approve",
    to: "step_b",
    trigger: "automatic",
    priority: 1,
    guard: GUARD,
  } as unknown as DraftPath;

  it("keeps the guard and drops the priority key on a switch to manual", () => {
    const result = pathWithTrigger(automatic, "manual");

    expect(result.trigger).toBe("manual");
    expect(result.guard).toEqual(GUARD);
    expect("priority" in result).toBe(false);
  });

  it("changes the trigger alone on a switch to automatic", () => {
    const manual = { ...automatic, trigger: "manual" } as DraftPath;
    const result = pathWithTrigger(manual, "automatic");

    expect(result).toEqual({ ...manual, trigger: "automatic" });
  });

  it("leaves the path it was given as it was", () => {
    pathWithTrigger(automatic, "manual");

    expect(automatic.priority).toBe(1);
  });
});

describe("the two surfaces that create a path", () => {
  const read = (file: string) => readFileSync(new URL(`../src/areas/studio/${file}`, import.meta.url), "utf-8");

  it("both ask triggerForNewPath for the new path's trigger", () => {
    expect(read("panels/PathsPanel.tsx")).toContain("triggerForNewPath(sourceStep)");
    expect(read("canvas/CanvasView.tsx")).toContain("triggerForNewPath(sourceStep)");
  });

  it("leave no inline sibling rule on the canvas", () => {
    expect(read("canvas/CanvasView.tsx")).not.toMatch(/paths\[0\]\?\.trigger/);
  });

  it("switch a path's trigger through pathWithTrigger on the step page", () => {
    const source = read("panels/PathsPanel.tsx");

    expect(source).toContain('pathWithTrigger(path, "manual")');
    expect(source).toContain('pathWithTrigger(path, "automatic")');
  });
});
