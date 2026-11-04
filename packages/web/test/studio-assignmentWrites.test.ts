import { describe, expect, it } from "bun:test";
import {
  addPersonField,
  changeStrategy,
  clearAssignment,
  pickGroup,
  pickPersonField,
  strategyWriteRoute,
} from "../src/areas/studio/draft/assignmentWrites.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

const group = (id: string) => ({ type: "org.group-members", config: { groupId: id } });
const draft = (over: Partial<Draft> = {}, steps?: unknown[]): Draft =>
  ({
    workflow: {
      steps: steps ?? [
        { id: "step_a", assignment: { strategy: group("g_old") } },
        { id: "step_b" },
      ],
    },
    ...over,
  }) as unknown as Draft;
const stepA = (d: Draft) => d.workflow!.steps![0]!;

describe("assignmentWrites", () => {
  it("pickGroup writes both lists", () => {
    const d = draft({}, [{ id: "step_a" }]);
    pickGroup(d, "step_a", "g_it");
    expect(stepA(d).assignment?.strategy?.config).toEqual({ groupId: "g_it" });
    expect(d.allowedGroups).toEqual(["g_it"]);
  });
  it("keeps an already-listed entry once", () => {
    const d = draft({ allowedGroups: ["g_it"] }, [{ id: "step_a" }]);
    pickGroup(d, "step_a", "g_it");
    expect(d.allowedGroups).toEqual(["g_it"]);
  });
  it("an unread entry leaves when another group is picked", () => {
    const d = draft({ allowedGroups: ["g_old"] });
    pickGroup(d, "step_a", "g_new");
    expect(d.allowedGroups).toEqual(["g_new"]);
  });
  it("a second step keeps the entry", () => {
    const d = draft({ allowedGroups: ["g_old"] }, [
      { id: "step_a", assignment: { strategy: group("g_old") } },
      { id: "step_b", assignment: { strategy: group("g_old") } },
    ]);
    pickGroup(d, "step_a", "g_new");
    expect(d.allowedGroups).toEqual(["g_old", "g_new"]);
  });
  it("a nested bare person field keeps the entry", () => {
    const d = draft({
      allowedGroups: ["g_old"],
      fields: [{ id: "f_g", type: "group", fields: [{ id: "f_p", format: "person" }] }],
    } as unknown as Partial<Draft>);
    clearAssignment(d, "step_a");
    expect(stepA(d).assignment).toBeUndefined();
    expect(d.allowedGroups).toEqual(["g_old"]);
  });
  it("a person field with options is not bare", () => {
    const d = draft({
      allowedGroups: ["g_old"],
      fields: [{ id: "f_p", format: "person", options: [] }],
    } as unknown as Partial<Draft>);
    clearAssignment(d, "step_a");
    expect(d.allowedGroups).toBeUndefined();
  });
  it("an emptied list deletes the key", () => {
    const d = draft({ allowedGroups: ["g_old"] });
    changeStrategy(d, "step_a", { type: "org.starter-manager", config: {} });
    expect("allowedGroups" in d).toBe(false);
  });
  it("a switch away and back rewrites the entry", () => {
    const d = draft({ allowedGroups: ["g_old"] });
    changeStrategy(d, "step_a", { type: "org.starter-manager", config: {} });
    changeStrategy(d, "step_a", group("g_old") as never);
    expect(d.allowedGroups).toEqual(["g_old"]);
  });
  it("a re-pick of a held id missing from the list adds it", () => {
    const d = draft();
    pickGroup(d, "step_a", "g_old");
    expect(d.allowedGroups).toEqual(["g_old"]);
  });
  it("addPersonField writes the catalog and the strategy together", () => {
    const d = draft();
    addPersonField(d, "step_a", { id: "field_x", key: "x", type: "string", format: "person" } as never);
    expect(d.fields?.map((f) => f.id as string)).toEqual(["field_x"]);
    expect(stepA(d).assignment?.strategy).toEqual({ type: "org.actor-from-field", config: { fieldId: "field_x" } });
  });
  it("pickPersonField drops an unread old group", () => {
    const d = draft({ allowedGroups: ["g_old"] });
    pickPersonField(d, "step_a", "field_x");
    expect(d.allowedGroups).toBeUndefined();
  });
  it("clearAssignment removes the key", () => {
    const d = draft();
    clearAssignment(d, "step_a");
    expect("assignment" in stepA(d)).toBe(false);
  });
});

describe("strategyWriteRoute", () => {
  it("routes a config-only write straight to the step", () => {
    expect(strategyWriteRoute(group("g"), { type: "org.group-members", config: { groupId: "h" } })).toBe("direct");
  });
  it("routes a type change, also from undefined, through changeStrategy", () => {
    expect(strategyWriteRoute(group("g"), { type: "x", config: {} })).toBe("change");
    expect(strategyWriteRoute(undefined, { type: "x", config: {} })).toBe("change");
  });
});
