/**
 * The dock's Paths-tab row derivation (`panels/pathRows.ts`), tested as a pure
 * function against literal fixtures — no DOM, no rendering.
 *
 * The guarded-manual-path cases exist because `definition.ts` puts `guard` on
 * every path beside `trigger`, not on `automatic` alone, and
 * `resolveAvailablePaths` evaluates a manual path's guard before offering it.
 * `PathsPanel` shows the guard editor for an automatic path only, and
 * switching a guarded path back to manual leaves its guard in the body, so a
 * real draft reaches this state.
 */
import { describe, expect, it } from "bun:test";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import { pathRows } from "../src/areas/studio/panels/pathRows.js";

type DraftStep = DraftOf<Step>;

/** Branded ids (`StepId`, `PathId`) are `string & $brand<...>`, so a literal
 * fixture cannot satisfy them directly. `studio-fieldMatrix.test.ts` sets the
 * convention: build the literal loosely, then cast once. */
function ds(entry: Record<string, unknown>): DraftStep {
  return entry as DraftStep;
}

function step(id: string, key: string, paths: Array<Record<string, unknown>> = []): DraftStep {
  return ds({ id, key, label: { en: key.replace(/_/g, " ") }, paths });
}

describe("dock path rows", () => {
  it("returns one row per path, in step order then path order", () => {
    const steps = [
      step("step_a", "submit", [
        { id: "path_1", to: "step_b", trigger: "manual" },
        { id: "path_2", to: "step_c", trigger: "manual" },
      ]),
      step("step_b", "review", [{ id: "path_3", to: "step_c", trigger: "manual" }]),
      step("step_c", "done"),
    ];
    expect(pathRows(steps).map((r) => r.pathId)).toEqual(["path_1", "path_2", "path_3"]);
  });

  it("names the step a path leaves and the step it enters", () => {
    const steps = [step("step_a", "submit", [{ id: "path_1", to: "step_b", trigger: "manual" }]), step("step_b", "review")];
    const [row] = pathRows(steps);
    expect(row?.sourceKey).toBe("submit");
    expect(row?.targetKey).toBe("review");
    expect(row?.sourceLabel).toEqual({ en: "submit" });
    expect(row?.targetLabel).toEqual({ en: "review" });
  });

  it("carries no priority and no guard for a guardless manual path", () => {
    const steps = [step("step_a", "submit", [{ id: "path_1", to: "step_b", trigger: "manual" }]), step("step_b", "review")];
    const [row] = pathRows(steps);
    expect(row?.trigger).toBe("manual");
    expect(row?.priority).toBeUndefined();
    expect(row?.guardSrc).toBeUndefined();
  });

  it("carries the guard of a MANUAL path, which the engine evaluates before offering it", () => {
    const steps = [
      step("step_a", "submit", [{ id: "path_1", to: "step_b", trigger: "manual", guard: { lang: "cel", src: "data.approved == true" } }]),
      step("step_b", "review"),
    ];
    const [row] = pathRows(steps);
    expect(row?.trigger).toBe("manual");
    expect(row?.guardSrc).toBe("data.approved == true");
  });

  it("carries the priority and guard of an automatic path", () => {
    const steps = [
      step("step_a", "route", [
        { id: "path_1", to: "step_b", trigger: "automatic", priority: 1, guard: { lang: "cel", src: "data.amount > 100" } },
        { id: "path_2", to: "step_c", trigger: "automatic", priority: 2 },
      ]),
      step("step_b", "senior"),
      step("step_c", "junior"),
    ];
    const rows = pathRows(steps);
    expect(rows[0]?.priority).toBe(1);
    expect(rows[0]?.guardSrc).toBe("data.amount > 100");
    expect(rows[1]?.priority).toBe(2);
    expect(rows[1]?.guardSrc).toBeUndefined();
  });

  it("leaves the target fields unset when `to` names no step in the draft", () => {
    const steps = [step("step_a", "submit", [{ id: "path_1", to: "step_gone", trigger: "manual" }])];
    const [row] = pathRows(steps);
    expect(row?.targetId).toBe("step_gone");
    expect(row?.targetKey).toBeUndefined();
    expect(row?.targetLabel).toBeUndefined();
  });

  it("returns no row for a draft holding no path, and none for no steps at all", () => {
    expect(pathRows([step("step_a", "only")] as DraftStep[])).toEqual([]);
    expect(pathRows([])).toEqual([]);
    expect(pathRows(undefined)).toEqual([]);
  });

  it("falls back to the step id when a step carries no key", () => {
    const steps = [ds({ id: "step_a", paths: [{ id: "path_1", to: "step_b", trigger: "manual" }] }), ds({ id: "step_b" })];
    const [row] = pathRows(steps);
    expect(row?.sourceKey).toBe("step_a");
    expect(row?.targetKey).toBe("step_b");
  });
});
