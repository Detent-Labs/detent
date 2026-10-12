import { describe, expect, it } from "bun:test";
import type { FieldId } from "workflow-engine/schema";
import { countKeyReaders } from "../src/areas/studio/draft/key-readers";
import type { Draft } from "../src/areas/studio/draft/types";

/** The expressions that read `data.<key>`, anywhere in the draft. One
 * expression counts once. Nothing is skipped: the field's own rule counts, and
 * so does a `process.start` mapping value inside a plugin `config`. Each case
 * builds only the parts of a draft it reads. */

const cel = (src: string) => ({ lang: "cel" as const, src });

const draftOf = (body: Record<string, unknown>): Draft => body as unknown as Draft;

const step = (stepId: string, parts: Record<string, unknown> = {}) => ({
  id: stepId,
  key: stepId,
  label: { en: stepId },
  type: "task",
  ...parts,
});

const stepsOf = (...steps: ReturnType<typeof step>[]) => ({ workflow: { initialStep: steps[0]?.id, steps } });

const guarded = (pathId: string, src: string) => ({ id: pathId, key: pathId, label: pathId, to: "step_a", trigger: "automatic", guard: cel(src) });

const amount = (extra: Record<string, unknown> = {}) => ({ id: "fld_amount" as FieldId, key: "amount", label: { en: "Amount" }, type: "number", ...extra });

describe("countKeyReaders", () => {
  it("counts a path guard that reads the key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1000.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts a visible flag on a view entry", () => {
    const draft = draftOf({
      fields: [amount()],
      ...stepsOf(step("step_a", { view: { fields: [{ ref: "fld_amount", visible: cel("data.amount > 0.0") }] } })),
    });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts the field's own validation rule", () => {
    const draft = draftOf({ fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })] });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts a process.start mapping value inside an action config", () => {
    const action = { id: "act_start", type: "process.start", config: { inputMapping: { fld_child: cel("data.amount") } } };
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { onEntry: [action] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts one expression once, however often it reads the key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1.0 && data.amount < 9.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("counts each expression that reads the key", () => {
    const draft = draftOf({
      fields: [amount({ validation: { rule: cel("data.amount > 0.0") } })],
      ...stepsOf(
        step("step_a", {
          paths: [guarded("path_a", "data.amount > 1000.0")],
          view: { fields: [{ ref: "fld_amount", visible: cel("data.amount > 0.0") }] },
        }),
      ),
    });

    expect(countKeyReaders(draft, "amount")).toBe(3);
  });

  it("does not count a string literal that holds the path", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.name == 'data.amount'")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("does not count an expression that reads another key with the same prefix", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount_total > 1.0")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("counts source that fails to parse by its text", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount >")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(1);
  });

  it("does not count bad source that lacks the path", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.other >")] })) });

    expect(countKeyReaders(draft, "amount")).toBe(0);
  });

  it("answers 0 for the empty key", () => {
    const draft = draftOf({ fields: [amount()], ...stepsOf(step("step_a", { paths: [guarded("path_a", "data.amount > 1.0")] })) });

    expect(countKeyReaders(draft, "")).toBe(0);
  });

  it("answers 0 for a draft with no expressions", () => {
    expect(countKeyReaders(draftOf({ fields: [amount()] }), "amount")).toBe(0);
  });
});
