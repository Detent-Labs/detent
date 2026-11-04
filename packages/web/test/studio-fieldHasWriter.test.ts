import { describe, expect, it } from "bun:test";
import { fieldHasWriter } from "../src/areas/studio/draft/assignmentConfig.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/** `studio-step-page`, "Who acts warns about a field nothing writes". */

const FIELD = { id: "field_a", key: "a", type: "string", format: "person" };

const draft = (over: { field?: object; steps?: unknown[]; contract?: unknown } = {}): Draft =>
  ({
    fields: [{ ...FIELD, ...over.field }],
    workflow: { steps: over.steps ?? [{ id: "step_this" }, { id: "step_other" }] },
    ...(over.contract === undefined ? {} : { contract: over.contract }),
  }) as unknown as Draft;

const has = (d: Draft) => fieldHasWriter(d, "field_a", "step_this");

const onOther = (entry: object) => [{ id: "step_this" }, { id: "step_other", view: { fields: [{ ref: "field_a", ...entry }] } }];
const output = { type: "x", config: {}, output: { field_a: { lang: "cel", src: "result.a" } } };

describe("fieldHasWriter", () => {
  it("reads no writer on a new field", () => {
    expect(has(draft())).toBe(false);
  });

  it("counts an editable entry on another step", () => {
    expect(has(draft({ steps: onOther({}) }))).toBe(true);
  });

  it("counts an entry whose flags are expressions", () => {
    const expr = { lang: "cel", src: "true" };
    expect(has(draft({ steps: onOther({ visible: expr, readonly: expr }) }))).toBe(true);
  });

  it("ignores an entry on this step", () => {
    expect(has(draft({ steps: [{ id: "step_this", view: { fields: [{ ref: "field_a" }] } }] }))).toBe(false);
  });

  it("ignores a hidden entry on another step", () => {
    expect(has(draft({ steps: onOther({ visible: false }) }))).toBe(false);
  });

  it("ignores a read-only entry on another step", () => {
    expect(has(draft({ steps: onOther({ readonly: true }) }))).toBe(false);
  });

  it("ignores another field's entry and a note", () => {
    const view = { fields: [{ ref: "field_b" }, { kind: "note", text: { en: "n" } }] };
    expect(has(draft({ steps: [{ id: "step_this" }, { id: "step_other", view }] }))).toBe(false);
  });

  it("counts a literal default", () => {
    expect(has(draft({ field: { default: "alice" } }))).toBe(true);
  });

  it("counts an expression default", () => {
    expect(has(draft({ field: { default: { lang: "cel", src: "actor.id" } } }))).toBe(true);
  });

  it("finds a default on a nested field", () => {
    const d = {
      fields: [{ id: "field_g", key: "g", type: "group", fields: [{ ...FIELD, default: "alice" }] }],
      workflow: { steps: [{ id: "step_this" }] },
    } as unknown as Draft;
    expect(has(d)).toBe(true);
  });

  it("ignores an output on this step's onEntry", () => {
    expect(has(draft({ steps: [{ id: "step_this", onEntry: [output] }] }))).toBe(false);
  });

  it("counts an output on another step", () => {
    expect(has(draft({ steps: [{ id: "step_this" }, { id: "step_other", onExit: [output] }] }))).toBe(true);
  });

  it("counts a subprocess output mapping on another step", () => {
    const subprocess = { outputMapping: { field_a: { lang: "cel", src: "child.data.a" } } };
    expect(has(draft({ steps: [{ id: "step_this" }, { id: "step_other", subprocess }] }))).toBe(true);
  });

  it("counts a contract input", () => {
    expect(has(draft({ contract: { inputFields: ["field_a"] } }))).toBe(true);
  });
});
