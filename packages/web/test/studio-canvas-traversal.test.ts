import { describe, expect, it } from "bun:test";
import { nextFocus, entryFocus, type ArrowKey, type Focus, type TraversalStep } from "../src/areas/studio/canvas/traversal.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";

const step = (id: string, paths: TraversalStep["paths"] = []): TraversalStep => ({ id, paths });
const group = (id: string, stepIds: string[], collapsed = false): StepGroup => ({ id, stepIds, name: id, collapsed });

/** a -> b -> c, manual throughout, c terminal. */
const chain: TraversalStep[] = [
  step("a", [{ id: "p_ab", to: "b", trigger: "manual" }]),
  step("b", [{ id: "p_bc", to: "c", trigger: "manual" }]),
  step("c"),
];

/** Two steps into one, so c carries an incoming fan of two. */
const converge: TraversalStep[] = [
  step("a", [{ id: "p_ac", to: "c", trigger: "manual" }]),
  step("b", [{ id: "p_bc", to: "c", trigger: "manual" }]),
  step("c"),
];

/** One fan out of a, into three targets. */
const fanOut = (paths: TraversalStep["paths"]): TraversalStep[] => [step("a", paths), step("b"), step("c"), step("d")];

/** Two collapsed groups with one path between them. Both ends hide, so only
 * the box at each end is drawn, and that path crosses from one to the other. */
const acrossBoxes: TraversalStep[] = [
  step("a", [{ id: "p_ab", to: "b", trigger: "manual" }]),
  step("b", [{ id: "p_bc", to: "c", trigger: "manual" }]),
  step("c", [{ id: "p_cd", to: "d", trigger: "manual" }]),
  step("d"),
];
const twoBoxes = [group("g1", ["a", "b"], true), group("g2", ["c", "d"], true)];

/** A focus, in one stable string. The key list fixes the order, so two focuses
 * naming the same place read the same however each was built. */
const label = (focus: Focus) => JSON.stringify(focus, ["kind", "stepId", "pathId", "from", "groupId"]);

/** Every focus an arrow sequence reaches from the entry point. A control the
 * canvas draws and this set omits is pointer-only. */
function reachableFrom(steps: TraversalStep[], groups: StepGroup[]): Set<string> {
  const keys: ArrowKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const seen = new Set<string>();
  const queue: Focus[] = [entryFocus(steps, groups)];
  for (let focus = queue.shift(); focus; focus = queue.shift()) {
    if (seen.has(label(focus))) continue;
    seen.add(label(focus));
    for (const key of keys) queue.push(nextFocus(focus, key, steps, groups));
  }
  return seen;
}

/** The fan a step walks, from its first path down to its last. */
function fanFrom(steps: TraversalStep[], stepId: string, groups: StepGroup[] = []): string[] {
  const ids: string[] = [];
  let focus = nextFocus({ kind: "step", stepId }, "ArrowRight", steps, groups);
  while (focus.kind === "path" && !ids.includes(focus.pathId)) {
    ids.push(focus.pathId);
    focus = nextFocus(focus, "ArrowDown", steps, groups);
  }
  return ids;
}

describe("canvas traversal: stepping through the graph", () => {
  it("reaches a step's outgoing path, then that path's target", () => {
    const path = nextFocus({ kind: "step", stepId: "a" }, "ArrowRight", chain, []);
    expect(path).toEqual({ kind: "path", pathId: "p_ab", from: "source" });
    expect(nextFocus(path, "ArrowRight", chain, [])).toEqual({ kind: "step", stepId: "b" });
  });

  it("reaches a step's incoming path, then that path's source", () => {
    const path = nextFocus({ kind: "step", stepId: "c" }, "ArrowLeft", chain, []);
    expect(path).toEqual({ kind: "path", pathId: "p_bc", from: "target" });
    expect(nextFocus(path, "ArrowLeft", chain, [])).toEqual({ kind: "step", stepId: "b" });
  });

  it("reaches a step carrying no path at all, down and back up", () => {
    expect(nextFocus({ kind: "step", stepId: "b" }, "ArrowDown", chain, [])).toEqual({ kind: "step", stepId: "c" });
    expect(nextFocus({ kind: "step", stepId: "c" }, "ArrowUp", chain, [])).toEqual({ kind: "step", stepId: "b" });
  });

  it("stays put on a terminal step", () => {
    expect(nextFocus({ kind: "step", stepId: "c" }, "ArrowRight", chain, [])).toEqual({ kind: "step", stepId: "c" });
  });

  it("stays put on the initial step", () => {
    expect(nextFocus({ kind: "step", stepId: "a" }, "ArrowLeft", chain, [])).toEqual({ kind: "step", stepId: "a" });
  });

  it("reaches every later step with down where the draft repeats a step id", () => {
    // A second entry naming an id holds no place of its own. Holding one
    // walks down from the first entry instead, and the order cycles.
    const repeated: TraversalStep[] = [step("a"), step("b"), step("a"), step("c")];
    expect(nextFocus({ kind: "step", stepId: "a" }, "ArrowDown", repeated, [])).toEqual({ kind: "step", stepId: "b" });
    expect(nextFocus({ kind: "step", stepId: "b" }, "ArrowDown", repeated, [])).toEqual({ kind: "step", stepId: "c" });
  });

  it("stays put below the last step", () => {
    expect(nextFocus({ kind: "step", stepId: "c" }, "ArrowDown", chain, [])).toEqual({ kind: "step", stepId: "c" });
  });

  it("stays put below the last path in a fan", () => {
    const steps = fanOut([
      { id: "p_one", to: "b", trigger: "manual" },
      { id: "p_two", to: "c", trigger: "manual" },
      { id: "p_three", to: "d", trigger: "manual" },
    ]);
    const last = { kind: "path", pathId: "p_three", from: "source" } as const;
    expect(nextFocus(last, "ArrowDown", steps, [])).toEqual(last);
  });

  it("walks the target's incoming set from a path entered through its target", () => {
    const first = { kind: "path", pathId: "p_ac", from: "target" } as const;
    expect(nextFocus(first, "ArrowDown", converge, [])).toEqual({ kind: "path", pathId: "p_bc", from: "target" });
  });

  it("takes the entry point on any arrow from the root, initial step and all", () => {
    // `c` is last in `steps` order, so a call that lost the initial step would
    // answer with `a` and this would go red.
    const keys: ArrowKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    for (const key of keys) {
      expect(nextFocus({ kind: "root" }, key, chain, [], "c")).toEqual({ kind: "step", stepId: "c" });
      expect(nextFocus({ kind: "root" }, key, chain, [])).toEqual({ kind: "step", stepId: "a" });
    }
  });
});

describe("canvas traversal: fan order", () => {
  it("walks an all-automatic fan of distinct priorities in priority order", () => {
    const steps = fanOut([
      { id: "p_third", to: "d", trigger: "automatic", priority: 3 },
      { id: "p_first", to: "b", trigger: "automatic", priority: 1 },
      { id: "p_second", to: "c", trigger: "automatic", priority: 2 },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_first", "p_second", "p_third"]);
  });

  it("walks a manual fan in array order", () => {
    const steps = fanOut([
      { id: "p_one", to: "b", trigger: "manual" },
      { id: "p_two", to: "c", trigger: "manual" },
      { id: "p_three", to: "d", trigger: "manual" },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_one", "p_two", "p_three"]);
  });

  it("walks a fan missing one priority in array order", () => {
    const steps = fanOut([
      { id: "p_two", to: "b", trigger: "automatic", priority: 2 },
      { id: "p_one", to: "c", trigger: "automatic", priority: 1 },
      { id: "p_none", to: "d", trigger: "automatic" },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_two", "p_one", "p_none"]);
  });

  it("walks a fan repeating one priority in array order", () => {
    const steps = fanOut([
      { id: "p_two", to: "b", trigger: "automatic", priority: 2 },
      { id: "p_one", to: "c", trigger: "automatic", priority: 1 },
      { id: "p_one_again", to: "d", trigger: "automatic", priority: 1 },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_two", "p_one", "p_one_again"]);
  });

  it("walks a fan of one manual and one automatic path in array order", () => {
    const steps = fanOut([
      { id: "p_manual", to: "b", trigger: "manual", priority: 2 },
      { id: "p_automatic", to: "c", trigger: "automatic", priority: 1 },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_manual", "p_automatic"]);
  });

  it("keeps a path carrying no trigger in its array place", () => {
    const steps = fanOut([
      { id: "p_two", to: "b", trigger: "automatic", priority: 2 },
      { id: "p_bare", to: "c" },
      { id: "p_one", to: "d", trigger: "automatic", priority: 1 },
    ]);
    expect(fanFrom(steps, "a")).toEqual(["p_two", "p_bare", "p_one"]);
  });
});

describe("canvas traversal: reachability", () => {
  it("holds no place for a step with no id, and none for a path with no id", () => {
    const gaps: TraversalStep[] = [
      { id: "a", paths: [{ id: "p_ab", to: "b", trigger: "manual" }, { to: "c", trigger: "manual" }] },
      { paths: [{ id: "p_lost", to: "c", trigger: "manual" }] },
      step("b"),
      step("c"),
    ];
    expect(nextFocus({ kind: "step", stepId: "a" }, "ArrowDown", gaps, [])).toEqual({ kind: "step", stepId: "b" });
    expect(fanFrom(gaps, "a")).toEqual(["p_ab"]);
  });

  it("drops every path on a step with no id, whatever that path carries", () => {
    const orphan: TraversalStep[] = [
      { paths: [{ id: "p_orphan", to: "b", trigger: "automatic", priority: 1 }] },
      step("b"),
    ];
    const focus = { kind: "path", pathId: "p_orphan", from: "source" } as const;
    expect(nextFocus(focus, "ArrowRight", orphan, [])).toEqual(focus);
    expect(nextFocus({ kind: "step", stepId: "b" }, "ArrowLeft", orphan, [])).toEqual({ kind: "step", stepId: "b" });
  });

  it("drops a path whose target names no step", () => {
    const dangling: TraversalStep[] = [step("a", [{ id: "p_ax", to: "ghost", trigger: "manual" }]), step("b")];
    expect(nextFocus({ kind: "step", stepId: "a" }, "ArrowRight", dangling, [])).toEqual({ kind: "step", stepId: "a" });
  });

  it("drops a path with both ends inside one collapsed group", () => {
    const focus = { kind: "path", pathId: "p_bc", from: "source" } as const;
    expect(nextFocus(focus, "ArrowRight", chain, [group("g1", ["b", "c"], true)])).toEqual(focus);
    expect(nextFocus(focus, "ArrowRight", chain, [group("g1", ["b", "c"])])).toEqual({ kind: "step", stepId: "c" });
  });

  it("returns a collapsed group's box for a path whose target hides inside it", () => {
    const boxed = [group("g1", ["b", "c"], true)];
    const path = nextFocus({ kind: "step", stepId: "a" }, "ArrowRight", chain, boxed);
    expect(path).toEqual({ kind: "path", pathId: "p_ab", from: "source" });
    expect(nextFocus(path, "ArrowRight", chain, boxed)).toEqual({ kind: "group", groupId: "g1" });
  });

  it("hides nothing for a collapsed group naming one resolvable step", () => {
    const oneMember = [group("g1", ["b", "gone"], true)];
    const focus = { kind: "path", pathId: "p_ab", from: "source" } as const;
    expect(nextFocus(focus, "ArrowRight", chain, oneMember)).toEqual({ kind: "step", stepId: "b" });
    expect(entryFocus(chain, oneMember, "b")).toEqual({ kind: "step", stepId: "b" });
  });

  it("reaches the path leaving a collapsed box on right, then the far box", () => {
    const focus = { kind: "group", groupId: "g1" } as const;
    const path = nextFocus(focus, "ArrowRight", acrossBoxes, twoBoxes);
    expect(path).toEqual({ kind: "path", pathId: "p_bc", from: "source" });
    expect(nextFocus(path, "ArrowRight", acrossBoxes, twoBoxes)).toEqual({ kind: "group", groupId: "g2" });
  });

  it("reaches the path entering a collapsed box on left", () => {
    const focus = { kind: "group", groupId: "g2" } as const;
    expect(nextFocus(focus, "ArrowLeft", acrossBoxes, twoBoxes)).toEqual({ kind: "path", pathId: "p_bc", from: "target" });
  });

  it("reaches a path between two collapsed groups from the entry point", () => {
    // The canvas draws that path, names it and gives it a roving stop, so an
    // arrow sequence has to arrive at it. Neither end step is focusable.
    expect(reachableFrom(acrossBoxes, twoBoxes)).toContain(label({ kind: "path", pathId: "p_bc", from: "source" }));
  });

  it("stays put on left and right from a box no path crosses, while up and down still move", () => {
    // A step follows the box in the step order, so a box that answered left or
    // right with a neighbour would answer with that step.
    const steps: TraversalStep[] = [step("a"), step("b"), step("c")];
    const boxed = [group("g1", ["a", "b"], true)];
    const focus = { kind: "group", groupId: "g1" } as const;
    expect(nextFocus(focus, "ArrowLeft", steps, boxed)).toEqual(focus);
    expect(nextFocus(focus, "ArrowRight", steps, boxed)).toEqual(focus);
    expect(nextFocus(focus, "ArrowUp", steps, boxed)).toEqual(focus);
    expect(nextFocus(focus, "ArrowDown", steps, boxed)).toEqual({ kind: "step", stepId: "c" });
  });

  it("holds a place for an expanded group's box, before its first member", () => {
    // The box that draws no place takes no roving stop, so no key reaches its
    // disclosure at all. That is the WCAG 2.1.1 failure this rejects.
    const open = [group("g1", ["b", "c"])];
    const focus = { kind: "group", groupId: "g1" } as const;
    expect(nextFocus(focus, "ArrowDown", chain, open)).toEqual({ kind: "step", stepId: "b" });
    expect(nextFocus(focus, "ArrowUp", chain, open)).toEqual({ kind: "step", stepId: "a" });
    expect(nextFocus({ kind: "step", stepId: "a" }, "ArrowDown", chain, open)).toEqual(focus);
  });

  it("keeps a group focus reachable once that group expands", () => {
    // Enter on a collapsed box expands the group, and the focus stays on that
    // group. An order the expanded box is absent from answers every arrow with
    // the focus unchanged, which strands the author.
    const steps: TraversalStep[] = [...chain, step("d")];
    const focus = { kind: "group", groupId: "g1" } as const;
    expect(nextFocus(focus, "ArrowDown", steps, [group("g1", ["b", "c"], true)])).toEqual({ kind: "step", stepId: "d" });
    expect(nextFocus(focus, "ArrowDown", steps, [group("g1", ["b", "c"])])).toEqual({ kind: "step", stepId: "b" });
  });
});

describe("canvas traversal: the entry point", () => {
  it("enters at the first step where the draft names no initial one", () => {
    expect(entryFocus(chain, [])).toEqual({ kind: "step", stepId: "a" });
  });

  it("enters at a collapsed group's box where the initial step hides inside it", () => {
    expect(entryFocus(chain, [group("g1", ["b", "c"], true)], "b")).toEqual({ kind: "group", groupId: "g1" });
  });

  it("enters at the first group box where every step hides", () => {
    const hidden: TraversalStep[] = [step("b"), step("c")];
    expect(entryFocus(hidden, [group("g1", ["b", "c"], true)])).toEqual({ kind: "group", groupId: "g1" });
  });

  it("never enters at a step whose id is the empty string", () => {
    // The graph holds no empty id, so a focus naming one answers every key
    // with itself and no element takes the roving stop.
    const empty: TraversalStep[] = [step(""), step("b")];
    expect(entryFocus(empty, [])).toEqual({ kind: "step", stepId: "b" });
    expect(entryFocus([step("")], [])).toEqual({ kind: "root" });
  });

  it("enters at the root where the draft holds no reachable step at all", () => {
    const nothing: TraversalStep[] = [{}, { paths: [{ id: "p_lost", to: "x", trigger: "manual" }] }];
    expect(entryFocus(nothing, [])).toEqual({ kind: "root" });
  });
});
