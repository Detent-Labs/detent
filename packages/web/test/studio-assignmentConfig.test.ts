import { describe, expect, it } from "bun:test";
import { assignmentConfigGaps, assignmentConfigHolds } from "../src/areas/studio/draft/assignmentConfig.js";
import { checkPlace } from "../src/areas/studio/draft/checkSentence.js";
import { checkTarget } from "../src/areas/studio/draft/process-tabs.js";
import { groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import { issuesBySection } from "../src/areas/studio/panels/sectionIssues.js";
import { sectionsFor } from "../src/areas/studio/panels/sectionsFor.js";
import type { ConfigFieldDescriptor, RegistryInfo } from "../src/areas/studio/api/types.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** `studio-checks-rail`, "The studio checks a who-acts config". The fixture
 * holds what `GET /registry` answers for the built-in strategies, as
 * `test/http-studio.test.ts` pins it. */

const MANAGER = "org.manager-of-starter";
const GROUP = "org.group-members";
const PERSON = "org.actor-from-field";
const UNDESCRIBED = "acme.round-robin";

const SCHEMAS: Record<string, ConfigFieldDescriptor[]> = {
  [MANAGER]: [],
  [GROUP]: [{ key: "groupId", kind: "string", required: true }],
  [PERSON]: [{ key: "fieldId", kind: "string", required: true }],
  static: [{ key: "candidates", kind: "string-array", required: true }],
};
const CLOSED = [MANAGER, GROUP, PERSON];

const REGISTRY: RegistryInfo = {
  actionTypes: [],
  dataSourceTypes: [],
  assignmentStrategyTypes: [MANAGER, GROUP, PERSON, "static", UNDESCRIBED],
  actionSchemas: {},
  dataSourceSchemas: {},
  assignmentStrategySchemas: SCHEMAS,
  closedAssignmentStrategyTypes: CLOSED,
};

const gaps = (type: string, config: unknown) => assignmentConfigGaps({ type, config }, SCHEMAS, CLOSED);
const holds = (type: string, config: unknown) => assignmentConfigHolds({ type, config }, SCHEMAS, CLOSED);

const STEP_A = "step_00000000-0000-4000-8000-000000000001";
const STEP_B = "step_00000000-0000-4000-8000-000000000002";
const WAY = { id: "path_00000000-0000-4000-8000-000000000001", key: "go", label: "Go", to: STEP_B, trigger: "manual" };

const draft = (assignment: unknown, over: Record<string, unknown> = {}, endOver: Record<string, unknown> = {}): Draft =>
  ({
    key: "k",
    label: { en: "Process" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: STEP_A,
      steps: [
        { id: STEP_A, key: "a", label: { en: "Review" }, type: "task", paths: [WAY], assignment },
        { id: STEP_B, key: "b", label: { en: "End" }, type: "task", terminal: true, ...endOver },
      ],
    },
    ...over,
  }) as unknown as Draft;

const strategy = (type: string, config: unknown) => ({ strategy: { type, config } });
const CONFIG_LOC = "workflow.steps[0].assignment.strategy.config";
const configRowsUnder = (body: Draft, registry: Parameters<typeof runValidation>[1]) =>
  runValidation(body, registry, {}, {}).issues.filter((i) => i.loc === CONFIG_LOC);
const configRows = (body: Draft) => configRowsUnder(body, REGISTRY);

describe("assignmentConfigGaps", () => {
  it("reads a stale key on a closed strategy", () => {
    expect(gaps(MANAGER, { fieldId: "x" })).toHaveLength(1);
  });

  it("reads an absent required key", () => {
    expect(gaps(GROUP, {})).toHaveLength(1);
  });

  it("reads a value of the wrong kind", () => {
    expect(gaps("static", { candidates: "requester" })).toHaveLength(1);
    expect(gaps("static", { candidates: ["requester", 5] })).toHaveLength(1);
    expect(gaps(GROUP, { groupId: 5 })).toHaveLength(1);
  });

  it("reads one gap for each thing wrong", () => {
    expect(gaps(GROUP, { fieldId: "x" })).toHaveLength(2);
  });

  it("keeps an open strategy's extra key", () => {
    expect(gaps("static", { candidates: [], extra: 1 })).toEqual([]);
  });

  it("reads an extra key as fine where the closed list is absent", () => {
    expect(assignmentConfigGaps({ type: GROUP, config: { groupId: "g", extra: 1 } }, SCHEMAS, undefined)).toEqual([]);
  });

  it("raises nothing for an undescribed strategy, whatever its config holds", () => {
    expect(gaps(UNDESCRIBED, { anything: 1 })).toEqual([]);
    expect(gaps(UNDESCRIBED, null)).toEqual([]);
    expect(gaps("constructor", {})).toEqual([]);
  });

  it("raises nothing while no description has loaded", () => {
    expect(assignmentConfigGaps({ type: GROUP, config: {} }, undefined, undefined)).toEqual([]);
    expect(assignmentConfigGaps(undefined, SCHEMAS, CLOSED)).toEqual([]);
  });

  it("accepts an empty list and an empty string, which it leaves to the server and the compile check", () => {
    expect(gaps("static", { candidates: [] })).toEqual([]);
    expect(gaps(GROUP, { groupId: "" })).toEqual([]);
  });

  it("reads a config that is not a plain object as one gap, without throwing", () => {
    for (const config of [null, undefined, "x", 5, ["x"]]) {
      expect(gaps("static", config)).toHaveLength(1);
    }
  });

  it("reads each kind a descriptor can state", () => {
    const fields: ConfigFieldDescriptor[] = [
      { key: "count", kind: "number", required: false },
      { key: "on", kind: "boolean", required: false },
      { key: "mode", kind: "enum", required: false, enumValues: ["a", "b"] },
      { key: "modes", kind: "string-array", required: false, enumValues: ["a", "b"] },
      { key: "name", kind: "string", required: false, default: "x" },
    ];
    const read = (config: Record<string, unknown>) => assignmentConfigGaps({ type: "t", config }, { t: fields }, []);

    expect(read({})).toEqual([]);
    expect(read({ count: 1, on: false, mode: "a", modes: ["b"], name: "n" })).toEqual([]);
    expect(read({ count: "1" })).toHaveLength(1);
    expect(read({ on: "true" })).toHaveLength(1);
    expect(read({ mode: "c" })).toHaveLength(1);
    expect(read({ modes: ["c"] })).toHaveLength(1);
    expect(read({ name: null })).toHaveLength(1);
  });
});

describe("assignmentConfigHolds", () => {
  it("passes an undescribed strategy, whatever its config holds", () => {
    expect(holds(UNDESCRIBED, null)).toBe(true);
    expect(holds(UNDESCRIBED, { anything: 1 })).toBe(true);
    expect(assignmentConfigHolds({ type: GROUP }, undefined, undefined)).toBe(true);
  });

  it("fails a config that is not a plain object under a description, without throwing", () => {
    for (const config of [null, undefined, "x", ["x"]]) {
      expect(holds("static", config)).toBe(false);
      expect(holds(MANAGER, config)).toBe(false);
    }
  });

  it("fails on a gap", () => {
    expect(holds(GROUP, {})).toBe(false);
    expect(holds(MANAGER, { fieldId: "x" })).toBe(false);
  });

  it("fails an empty required value, which raises no gap", () => {
    expect(holds("static", { candidates: [] })).toBe(false);
    expect(holds(GROUP, { groupId: "" })).toBe(false);
  });

  it("passes an empty optional value", () => {
    const schemas = { t: [{ key: "note", kind: "string", required: false }] } satisfies Record<string, ConfigFieldDescriptor[]>;

    expect(assignmentConfigHolds({ type: "t", config: { note: "" } }, schemas, [])).toBe(true);
  });

  it("passes a held config", () => {
    expect(holds(GROUP, { groupId: "g" })).toBe(true);
    expect(holds("static", { candidates: ["requester"] })).toBe(true);
    expect(holds(MANAGER, {})).toBe(true);
  });
});

describe("runValidation raises a who-acts gap", () => {
  it("raises a stale key as one registry issue on the step", () => {
    const result = runValidation(draft(strategy(MANAGER, { fieldId: "x" })), REGISTRY, {}, {});
    const issues = result.issues.filter((i) => i.loc === CONFIG_LOC);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ source: "registry", entityType: "step", entityId: STEP_A });
    expect(issues[0]!.sentence).toBe("The settings for who acts on “Review” do not pass. Under Who acts, correct them.");
  });

  it("reads the place, the section and the Fix through the real readers", () => {
    const body = draft(strategy(GROUP, {}));
    const issues = configRows(body);
    const issue = issues[0]!;
    const step = body.workflow!.steps![0] as DraftStep;

    expect(issues).toHaveLength(1);
    expect(checkPlace(body, issue)).toBe("assignment");
    expect(issuesBySection(step, issues, sectionsFor("participant")).get("assignment")).toEqual(issues);
    expect(checkTarget(issue, body)).toEqual({ tab: "steps", stepId: STEP_A, section: "assignment", focusId: "step-section-assignment" });
  });

  it("raises a value of the wrong kind", () => {
    expect(configRows(draft(strategy("static", { candidates: "requester" })))).toHaveLength(1);
  });

  it("raises nothing for an open strategy's extra key", () => {
    expect(configRows(draft(strategy("static", { candidates: ["requester"], extra: 1 })))).toEqual([]);
  });

  it("raises nothing for an undescribed strategy", () => {
    const { issues } = runValidation(draft(strategy(UNDESCRIBED, { anything: 1 })), REGISTRY, {}, {});

    expect(issues).toEqual([]);
  });

  it("raises nothing for an emptied list, which a publish accepts", () => {
    expect(runValidation(draft(strategy("static", { candidates: [] })), REGISTRY, {}, {}).issues).toEqual([]);
  });

  it("waits for the registry", () => {
    expect(configRowsUnder(draft(strategy(MANAGER, { fieldId: "x" })), undefined)).toEqual([]);
  });

  it("reads an absent description as none", () => {
    const description = { actionTypes: [], assignmentStrategyTypes: [MANAGER], dataSourceTypes: [] };

    expect(configRowsUnder(draft(strategy(MANAGER, { fieldId: "x" })), description)).toEqual([]);
  });

  it("waits for a compiling draft, and shows the structural issue alone", () => {
    const other = { assignment: strategy(GROUP, { groupId: "group_elsewhere" }) };
    const result = runValidation(draft(strategy(MANAGER, { fieldId: "x" }), {}, other), REGISTRY, {}, {});

    expect(result.issues.map((i) => i.source)).toEqual(["structural"]);
    expect(result.issues[0]!.loc).toContain("steps[1]");
  });

  it("leaves the config dimension and the rail's held-back flag alone", () => {
    const result = runValidation(draft(strategy(MANAGER, { fieldId: "x" })), REGISTRY, {}, {});
    const registryGroup = groupChecksBySource(result).find((g) => g.source === "registry")!;

    expect(result.dimensions.registryConfig).toBe("not-run");
    expect(registryGroup.registryConfigHeldBack).toBe(true);
    expect(registryGroup.heldBack).toBe(false);
    expect(registryGroup.issues).toHaveLength(1);
  });

  it("does not flag a step twice with the compile check's group rule", () => {
    const result = runValidation(draft(strategy(GROUP, { groupId: "group_elsewhere" })), REGISTRY, {}, {});

    expect(result.issues.map((i) => i.source)).toEqual(["structural"]);
  });
});
