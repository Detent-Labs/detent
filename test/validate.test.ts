import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { processVersion } from "../src/schema/definition.js";

const raw = JSON.parse(
  readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"),
);

const rejects = (mutate: (d: any) => void): boolean => {
  const bad = structuredClone(raw);
  mutate(bad);
  return !processVersion.safeParse(bad).success;
};

describe("expense-approval definition", () => {
  it("validates the example", () => {
    expect(processVersion.safeParse(raw).success).toBe(true);
  });

  it("rejects an unresolved path target", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].paths[0].to = "step_does_not_exist";
    })).toBe(true);
  });

  it("rejects an outcome on a non-terminal step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].outcome = "booked";
    })).toBe(true);
  });

  it("rejects mixed manual+automatic paths on one step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[1].paths.push({
        id: "path_bbbb2222-9999-4a1c-8e2f-000000000099",
        key: "auto",
        to: "step_aaaa1111-0003-4a1c-8e2f-000000000003",
        trigger: "automatic",
        guard: { lang: "cel", src: "true" },
      });
    })).toBe(true);
  });

  it("rejects automatic paths without unique priority", () => {
    expect(rejects((d) => {
      const book = d.definition.workflow.steps[2];
      book.paths[0].priority = 5;
      book.paths[1].priority = 5;
    })).toBe(true);
  });

  it("rejects a terminal outcome not in the contract", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[3].outcome = "not_declared";
    })).toBe(true);
  });

  it("rejects options and dataSource together on a field", () => {
    expect(rejects((d) => {
      d.definition.fields[3].dataSource = "ds_something";
    })).toBe(true);
  });

  it("rejects an id with the wrong prefix", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].id = "node_wrongprefix";
    })).toBe(true);
  });

  it("keeps validity after a label rename", () => {
    const rename = structuredClone(raw);
    rename.definition.workflow.steps[1].label = "Erste Pruefung";
    expect(processVersion.safeParse(rename).success).toBe(true);
  });

  // A second action reachable by the booking transition (step_book.onEntry
  // already maps field ...0004) mapping the same field is the last-writer hazard.
  const dupOutputAction = (field: string) => ({
    id: "action_dddddddd-0000-4a1c-8e2f-000000000009",
    type: "noop",
    config: {},
    output: { [field]: { lang: "cel", src: "result.status" } },
  });

  it("rejects two actions on one transition writing the same output field", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[2].onEntry.push(
        dupOutputAction("field_1a2b3c4d-0004-4a1c-8e2f-000000000004"),
      );
    })).toBe(true);
  });

  it("accepts two actions on one transition writing disjoint fields", () => {
    const ok = structuredClone(raw);
    ok.definition.workflow.steps[2].onEntry.push(
      dupOutputAction("field_1a2b3c4d-0001-4a1c-8e2f-000000000001"),
    );
    expect(processVersion.safeParse(ok).success).toBe(true);
  });

  it("rejects two onCancel actions writing the same output field", () => {
    expect(rejects((d) => {
      const f = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
      d.definition.workflow.steps[0].onCancel = [
        { id: "action_c1000000-0000-4a1c-8e2f-000000000001", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.x" } } },
        { id: "action_c2000000-0000-4a1c-8e2f-000000000002", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.y" } } },
      ];
    })).toBe(true);
  });
});
