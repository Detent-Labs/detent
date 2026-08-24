/**
 * gate-required-readonly-reachability, task 1.1: the shared step-graph
 * dominance helper. Standalone unit tests over `computeDominatorSets`,
 * independent of `compileProcessBody` — the compile-side and studio-side
 * consumers get their own scenario coverage in their respective test files.
 */
import { describe, it, expect } from "bun:test";
import { computeDominatorSets, dominates, type StepGraphNode } from "../src/schema/step-graph.js";

const node = (id: string, ...to: string[]): StepGraphNode => ({ id, paths: to.map((t) => ({ to: t })) });

describe("step-graph: computeDominatorSets", () => {
  it("a linear chain: start dominates all three, middle dominates middle/end only, end dominates only itself", () => {
    const steps = [node("start", "middle"), node("middle", "end"), node("end")];
    const dom = computeDominatorSets(steps, "start");
    expect(dom.get("start")).toEqual(new Set(["start"]));
    expect(dom.get("middle")).toEqual(new Set(["start", "middle"]));
    expect(dom.get("end")).toEqual(new Set(["start", "middle", "end"]));
    expect(dominates(dom, "middle", "start")).toBe(false);
  });

  it("a diamond branch: A dominates D, neither B nor C does", () => {
    const steps = [node("A", "B", "C"), node("B", "D"), node("C", "D"), node("D")];
    const dom = computeDominatorSets(steps, "A");
    expect(dom.get("D")).toEqual(new Set(["A", "D"]));
    expect(dominates(dom, "B", "D")).toBe(false);
    expect(dominates(dom, "C", "D")).toBe(false);
    expect(dominates(dom, "A", "D")).toBe(true);
  });

  it("a cycle: a path back to an earlier step does not make the later step dominate the earlier one", () => {
    const steps = [node("start", "review"), node("review", "end", "start"), node("end")];
    const dom = computeDominatorSets(steps, "start");
    expect(dominates(dom, "review", "start")).toBe(false);
    expect(dom.get("start")).toEqual(new Set(["start"]));
  });

  it("an orphan step with no incoming edge: its Dom set is the full universal set", () => {
    const steps = [node("start", "end"), node("end"), node("orphan", "end")];
    const dom = computeDominatorSets(steps, "start");
    expect(dom.get("orphan")).toEqual(new Set(["start", "end", "orphan"]));
  });

  it("an initialStep id that resolves to no step: every step's Dom is the full universal set, no throw", () => {
    const steps = [node("a", "b"), node("b")];
    expect(() => computeDominatorSets(steps, "does_not_exist")).not.toThrow();
    const dom = computeDominatorSets(steps, "does_not_exist");
    expect(dom.get("a")).toEqual(new Set(["a", "b"]));
    expect(dom.get("b")).toEqual(new Set(["a", "b"]));

    const domUndefined = computeDominatorSets(steps, undefined);
    expect(domUndefined.get("a")).toEqual(new Set(["a", "b"]));
  });

  it("initialStep is excluded from the per-step recomputation loop, even across a 2-step cycle", () => {
    const steps = [node("A", "B"), node("B", "A")];
    const dom = computeDominatorSets(steps, "A");
    expect(dom.get("A")).toEqual(new Set(["A"]));
    expect(dom.get("B")).toEqual(new Set(["A", "B"]));
  });

  it("tolerates a step with no id and a path to an unresolved step, without throwing", () => {
    const steps: StepGraphNode[] = [{ paths: [{ to: "a" }] }, node("a", "missing")];
    expect(() => computeDominatorSets(steps, "a")).not.toThrow();
  });
});
