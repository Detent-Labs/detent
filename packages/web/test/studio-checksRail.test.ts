import { describe, expect, it } from "bun:test";
import type { ActionId, ProcessBody } from "workflow-engine/schema";
import type { RegistryDescription } from "workflow-engine/engine/registry";
import { allChecksClear, groupChecksBySource, totalOpenIssueCount } from "../src/areas/studio/draft/checksRail.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

const DEFAULT_DIMENSIONS: ValidationResult["dimensions"] = {
  zod: "ran",
  duration: "ran",
  structural: "ran",
  actionType: "ran",
  assignmentType: "ran",
  dataSourceType: "ran",
  registryConfig: "not-run",
  cel: "ran",
};

function validation(
  overrides: Partial<Omit<ValidationResult, "dimensions">> & { dimensions?: Partial<ValidationResult["dimensions"]> },
): ValidationResult {
  const { dimensions, ...rest } = overrides;
  return {
    zodValid: true,
    issues: [],
    subprocessStepStatus: {},
    chainingSiteStatus: {},
    dimensions: { ...DEFAULT_DIMENSIONS, ...dimensions },
    ...rest,
  };
}

const EMPTY_REGISTRY: RegistryDescription = { actionTypes: [], assignmentStrategyTypes: [], dataSourceTypes: [] };

function baseDraft(): Draft {
  return {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }],
    },
  } as unknown as Draft;
}

function draftWithAction(actionType: string): Draft {
  const body = baseDraft();
  (body.workflow!.steps![0] as unknown as { onEntry?: unknown[] }).onEntry = [{ id: "action_x", type: actionType, config: {} }];
  return body;
}

function draftWithAssignment(strategyType: string): Draft {
  const body = baseDraft();
  (body.workflow!.steps![0] as unknown as { assignment?: unknown }).assignment = { strategy: { type: strategyType, config: {} } };
  return body;
}

function draftWithDataSource(dsType: string): Draft {
  const body = baseDraft();
  (body as unknown as { dataSources?: unknown[] }).dataSources = [{ id: "ds_x", key: "x", type: dsType, config: {} }];
  return body;
}

describe("groupChecksBySource", () => {
  it("groups issues by source", () => {
    const groups = groupChecksBySource(
      validation({
        issues: [
          { entityType: "step", entityId: "step_a", message: "m1", source: "structural", loc: "" },
          { entityType: "step", entityId: "step_a", message: "m2", source: "cel", loc: "" },
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
      validation({ zodValid: false, dimensions: { duration: "not-run", structural: "not-run" }, issues: [] }),
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
        dimensions: { duration: "ran", structural: "not-run" },
        issues: [{ entityType: "timer", entityId: "timer_x", message: "bad duration", source: "duration", loc: "" }],
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
        dimensions: { structural: "ran" },
        issues: [{ entityType: "field", entityId: "field_x", message: "bad key", source: "structural", loc: "" }],
      }),
    );
    expect(groups.find((g) => g.source === "structural")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "duration")!.heldBack).toBe(false);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
  });

  it("a fully valid draft holds nothing back, but still reports its two permanent held-back halves", () => {
    const groups = groupChecksBySource(validation({}));
    expect(groups.every((g) => !g.heldBack)).toBe(true);
    expect(groups.find((g) => g.source === "registry")!.registryConfigHeldBack).toBe(true);
    expect(groups.find((g) => g.source === "structural")!.unknownKeysHeldBack).toBe(true);
  });

  it("a structurally valid draft with no registry description loaded holds registry back, not cel", () => {
    const groups = groupChecksBySource(validation({ dimensions: { structural: "ran", actionType: "not-run" } }));
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
    expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(false);
  });

  it("registry un-holds-back once the registry description has resolved", () => {
    const groups = groupChecksBySource(validation({ dimensions: { structural: "ran", actionType: "ran" } }));
    expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(false);
  });
});

describe("allChecksClear", () => {
  it("is true when every group ran and holds no issue", () => {
    expect(allChecksClear(groupChecksBySource(validation({})))).toBe(true);
  });

  it("is false when a group is held back", () => {
    expect(
      allChecksClear(groupChecksBySource(validation({ zodValid: false, dimensions: { duration: "not-run", structural: "not-run" } }))),
    ).toBe(false);
  });

  it("is false when a group carries an open issue", () => {
    const groups = groupChecksBySource(
      validation({ issues: [{ entityType: "step", entityId: "s", message: "m", source: "cel", loc: "" }] }),
    );
    expect(allChecksClear(groups)).toBe(false);
  });
});

describe("totalOpenIssueCount", () => {
  it("counts every open issue across groups", () => {
    // A "structural" issue is deliberately excluded here: heldBackFor keys
    // cel/registry's own held-back state off the structural group's own
    // issue count, so a structural-source entry would hold both back and
    // this fixture would no longer exercise a plain sum across groups.
    const groups = groupChecksBySource(
      validation({
        issues: [
          { entityType: "timer", entityId: "timer_a", message: "m1", source: "duration", loc: "" },
          { entityType: "step", entityId: "step_a", message: "m2", source: "cel", loc: "" },
          { entityType: "step", entityId: "step_a", message: "m3", source: "cel", loc: "" },
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
      validation({ zodValid: false, dimensions: { duration: "not-run", structural: "not-run" }, issues: [] }),
    );
    expect(totalOpenIssueCount(groups)).toEqual({ kind: "held-back" });
  });
});

describe("the view group", () => {
  it("holds back on a Zod-invalid draft, like every other group", () => {
    const groups = groupChecksBySource(validation({ zodValid: false, dimensions: { duration: "not-run", structural: "not-run" } }));
    const view = groups.find((g) => g.source === "view");
    expect(view?.heldBack).toBe(true);
  });

  it("runs on a Zod-valid draft that fails to compile, unlike CEL and registry", () => {
    const groups = groupChecksBySource(
      validation({
        zodValid: true,
        dimensions: { structural: "ran" },
        issues: [
          { entityType: "step", entityId: "s", message: "view finding", source: "view", loc: "" },
          { entityType: "field", entityId: "field_x", message: "bad key", source: "structural", loc: "" },
        ],
      }),
    );
    const view = groups.find((g) => g.source === "view");
    const cel = groups.find((g) => g.source === "cel");
    expect(view?.heldBack).toBe(false);
    expect(view?.issues).toHaveLength(1);
    expect(cel?.heldBack).toBe(true);
  });
});

// The tests below drive runValidation end to end (task 6.2 etc.: "at the
// ChecksRail/runValidation level"), not groupChecksBySource against a
// hand-built ValidationResult.

describe("a compiling draft resolves plugin types in all three registries", () => {
  it("6.2 an unregistered action type reaches the rail", () => {
    const result = runValidation(draftWithAction("custom.unregistered"), EMPTY_REGISTRY, {}, {});
    const groups = groupChecksBySource(result);
    const registryGroup = groups.find((g) => g.source === "registry")!;
    expect(registryGroup.heldBack).toBe(false);
    expect(registryGroup.issues.some((i) => i.message.includes("not registered"))).toBe(true);
  });

  it("6.3 an unregistered assignment strategy type reaches the rail", () => {
    const result = runValidation(draftWithAssignment("custom.unregistered"), EMPTY_REGISTRY, {}, {});
    const groups = groupChecksBySource(result);
    const registryGroup = groups.find((g) => g.source === "registry")!;
    expect(registryGroup.heldBack).toBe(false);
    expect(registryGroup.issues.some((i) => i.message.includes("not registered"))).toBe(true);
  });

  it("6.4 an unregistered data source type reaches the rail", () => {
    const result = runValidation(draftWithDataSource("custom.unregistered"), EMPTY_REGISTRY, {}, {});
    const groups = groupChecksBySource(result);
    const registryGroup = groups.find((g) => g.source === "registry")!;
    expect(registryGroup.heldBack).toBe(false);
    expect(registryGroup.issues.some((i) => i.message.includes("not registered"))).toBe(true);
  });
});

it("6.5 a bad process.start input mapping reaches the rail", () => {
  const body = baseDraft();
  (body.workflow!.steps![0] as unknown as { onEntry?: unknown[] }).onEntry = [
    {
      id: "action_chain",
      type: "process.start",
      config: { processId: "proc_target", inputMapping: { bad_field: { lang: "cel", src: "data.amount" } } },
    },
  ];
  const target = {
    key: "target",
    label: { en: "Target" },
    baseLocale: "en",
    fields: [],
    workflow: { initialStep: "step_t", steps: [{ id: "step_t", key: "t", label: { en: "T" }, type: "task", terminal: true }] },
  } as unknown as ProcessBody;

  const result = runValidation(body, undefined, {}, { ["action_chain" as ActionId]: target });
  const celIssue = result.issues.find((i) => i.source === "cel" && i.entityId === "action_chain");
  expect(celIssue).toBeDefined();
  expect(celIssue!.message).toContain("bad_field");
});

it("6.9 the collapsed summary's count includes a registry type-resolution issue, unaffected by the config-validation half's held-back state", () => {
  const result = runValidation(draftWithAction("custom.unregistered"), EMPTY_REGISTRY, {}, {});
  const groups = groupChecksBySource(result);
  const summary = totalOpenIssueCount(groups);
  expect(summary.kind).toBe("count");
  if (summary.kind === "count") expect(summary.count).toBeGreaterThan(0);
  expect(groups.find((g) => g.source === "registry")!.registryConfigHeldBack).toBe(true);
});

describe("6.12 an unwritten technical field reaches the view group even when structural compilation fails", () => {
  it("still reports a view issue alongside a real structural failure", () => {
    const body = baseDraft();
    (body.fields![0] as { technical?: boolean }).technical = true;
    (body.fields![0] as { key: string }).key = "bad-key";
    const result = runValidation(body, undefined, {}, {});
    expect(result.zodValid).toBe(true);
    expect(result.dimensions.structural).toBe("ran");
    expect(result.issues.some((i) => i.source === "structural")).toBe(true);
    const viewIssue = result.issues.find((i) => i.source === "view" && i.entityId === "field_amount");
    expect(viewIssue).toBeDefined();
  });
});

it("6.14 a process.start action with no matching loadedChainingTargets entry reads not-checked, with no clear-pass CEL entry", () => {
  const body = baseDraft();
  (body.workflow!.steps![0] as unknown as { onEntry?: unknown[] }).onEntry = [
    { id: "action_chain", type: "process.start", config: { processId: "proc_target", inputMapping: {} } },
  ];
  const result = runValidation(body, undefined, {}, {});
  expect(result.chainingSiteStatus["action_chain" as ActionId]).toBe("not-checked");
  expect(result.issues.some((i) => i.source === "cel" && i.entityId === "action_chain")).toBe(false);
});

describe("6.14a the registry group's type-resolution half vs registryConfigHeldBack", () => {
  it("holds back type resolution while the registry description has not resolved, independent of registryConfigHeldBack", () => {
    const result = runValidation(baseDraft(), undefined, {}, {});
    const groups = groupChecksBySource(result);
    const registryGroup = groups.find((g) => g.source === "registry")!;
    expect(registryGroup.heldBack).toBe(true);
    expect(registryGroup.registryConfigHeldBack).toBe(true);
  });

  it("clears the type-resolution half once the registry description resolves, while registryConfigHeldBack stays true", () => {
    const result = runValidation(baseDraft(), EMPTY_REGISTRY, {}, {});
    const groups = groupChecksBySource(result);
    const registryGroup = groups.find((g) => g.source === "registry")!;
    expect(registryGroup.heldBack).toBe(false);
    expect(registryGroup.registryConfigHeldBack).toBe(true);
  });
});

it("6.14b unknownKeysHeldBack reads true on a fully valid, compiling draft, and does not block the publish control", () => {
  const result = runValidation(baseDraft(), EMPTY_REGISTRY, {}, {});
  const groups = groupChecksBySource(result);
  const structuralGroup = groups.find((g) => g.source === "structural")!;
  expect(structuralGroup.unknownKeysHeldBack).toBe(true);
  expect(structuralGroup.heldBack).toBe(false);
  expect(structuralGroup.issues).toHaveLength(0);
  expect(allChecksClear(groups)).toBe(true);
});

it("6.14c a held-back registry config-validation half, with type resolution clear, does not block the publish control", () => {
  const result = runValidation(baseDraft(), EMPTY_REGISTRY, {}, {});
  const groups = groupChecksBySource(result);
  const registryGroup = groups.find((g) => g.source === "registry")!;
  expect(registryGroup.registryConfigHeldBack).toBe(true);
  expect(registryGroup.heldBack).toBe(false);
  expect(allChecksClear(groups)).toBe(true);
});

it("6.21 a Zod-valid, uncompilable draft holds back CEL and registry, distinguishing 'compiled cleanly' from 'ran and failed'", () => {
  const body = baseDraft();
  (body.fields![0] as { key: string }).key = "bad-key";
  const result = runValidation(body, EMPTY_REGISTRY, {}, {});
  expect(result.dimensions.structural).toBe("ran");
  const groups = groupChecksBySource(result);
  expect(groups.find((g) => g.source === "structural")!.heldBack).toBe(false);
  expect(groups.find((g) => g.source === "structural")!.issues.length).toBeGreaterThan(0);
  expect(groups.find((g) => g.source === "cel")!.heldBack).toBe(true);
  expect(groups.find((g) => g.source === "registry")!.heldBack).toBe(true);
});
