import { describe, expect, it } from "bun:test";
import { allChecksClear, groupChecksBySource, totalOpenIssueCount } from "../src/areas/studio/draft/checksRail.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";

function validation(overrides: Partial<ValidationResult>): ValidationResult {
  return {
    zodValid: true,
    issues: [],
    registryChecked: true,
    subprocessStepStatus: {},
    structurallyValid: true,
    structuralChecked: true,
    ...overrides,
  };
}

describe("groupChecksBySource", () => {
  it("groups issues by source", () => {
    const groups = groupChecksBySource(
      validation({
        issues: [
          { entityType: "step", entityId: "step_a", message: "m1", source: "structural" },
          { entityType: "step", entityId: "step_a", message: "m2", source: "cel" },
        ],
      }),
    );
    const structural = groups.find((g) => g.source === "structural")!;
    const cel = groups.find((g) => g.source === "cel")!;
    expect(structural.issues).toHaveLength(1);
    expect(cel.issues).toHaveLength(1);
    expect(groups.find((g) => g.source === "registry")!.issues).toHaveLength(0);
  });

  it("a Zod-invalid draft holds every group but zod back", () => {
    const groups = groupChecksBySource(
      validation({ zodValid: false, structurallyValid: false, structuralChecked: false, issues: [] }),
    );
    expect(groups.find((g) => g.source === "zod")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "structural")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "duration")!.heldBack).toBe(true);
  });

  it("a Zod-valid, duration-failing draft holds structural, CEL and registry back, but not duration", () => {
    const groups = groupChecksBySource(
      validation({
        zodValid: true,
        structurallyValid: false,
        structuralChecked: false,
        issues: [{ entityType: "timer", entityId: "timer_x", message: "bad duration", source: "duration" }],
      }),
    );
    expect(groups.find((g) => g.source === "duration")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "duration")!.issues).toHaveLength(1);
    expect(groups.find((g) => g.source === "structural")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
  });

  it("a Zod-valid, uncompilable draft holds back only CEL and registry", () => {
    const groups = groupChecksBySource(
      validation({
        zodValid: true,
        structurallyValid: false,
        structuralChecked: true,
        issues: [{ entityType: "field", entityId: "field_x", message: "bad key", source: "structural" }],
      }),
    );
    expect(groups.find((g) => g.source === "structural")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "duration")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
  });

  it("a fully valid draft holds nothing back", () => {
    const groups = groupChecksBySource(validation({}));
    expect(groups.every((g) => !g.heldBack)).toBe(true);
  });
});

describe("allChecksClear", () => {
  it("is true when every group ran and holds no issue", () => {
    expect(allChecksClear(groupChecksBySource(validation({})))).toBe(true);
  });

  it("is false when a group is held back", () => {
    expect(allChecksClear(groupChecksBySource(validation({ zodValid: false, structurallyValid: false, structuralChecked: false })))).toBe(false);
  });

  it("is false when a group carries an open issue", () => {
    const groups = groupChecksBySource(
      validation({ issues: [{ entityType: "step", entityId: "s", message: "m", source: "cel" }] }),
    );
    expect(allChecksClear(groups)).toBe(false);
  });
});

describe("totalOpenIssueCount", () => {
  it("counts every open issue across groups", () => {
    const groups = groupChecksBySource(
      validation({
        issues: [
          { entityType: "step", entityId: "step_a", message: "m1", source: "structural" },
          { entityType: "step", entityId: "step_a", message: "m2", source: "cel" },
          { entityType: "step", entityId: "step_a", message: "m3", source: "cel" },
        ],
      }),
    );
    expect(totalOpenIssueCount(groups)).toEqual({ kind: "count", count: 3 });
  });

  it("is clear when every group ran and holds no issue", () => {
    const groups = groupChecksBySource(validation({}));
    expect(totalOpenIssueCount(groups)).toEqual({ kind: "clear" });
  });

  it("is held-back when any group holds back, never a plain count of zero", () => {
    const groups = groupChecksBySource(
      validation({ zodValid: false, structurallyValid: false, structuralChecked: false, issues: [] }),
    );
    expect(totalOpenIssueCount(groups)).toEqual({ kind: "held-back" });
  });
});
