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
});
