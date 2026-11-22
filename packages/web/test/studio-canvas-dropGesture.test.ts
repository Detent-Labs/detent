import { describe, expect, it } from "bun:test";
import {
  checkConnectSource,
  dropTargetOf,
  hitTestGrownNode,
  pressedDockingPoint,
  resolveEndDrop,
  endDropEntry,
  resolveConnectDrop,
  resolveDropGesture,
} from "../src/areas/studio/canvas/dropGesture.js";
import { triggerForNewPath } from "../src/areas/studio/draft/createPath.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";
import type { NodePosition } from "../src/areas/studio/canvas/geometry.js";

const nodes: NodePosition[] = [{ id: "step_b", x: 200, y: 100 }];

describe("resolveDropGesture", () => {
  it("resolves to connect-to-step when the drop point lands on an existing node", () => {
    const result = resolveDropGesture({ x: 210, y: 110 }, nodes, [], "manual");
    expect(result).toEqual({ kind: "connect-to-step", targetStepId: "step_b", trigger: "manual" });
  });

  it("resolves to create-step-and-connect when the drop point lands on empty canvas", () => {
    const result = resolveDropGesture({ x: 900, y: 900 }, nodes, [], "manual");
    expect(result).toEqual({ kind: "create-step-and-connect", point: { x: 900, y: 900 }, trigger: "manual" });
  });

  it("rejects a trigger-inconsistent candidate before it ever looks at the drop point", () => {
    const result = resolveDropGesture({ x: 900, y: 900 }, nodes, [{ trigger: "automatic", priority: 1 }], "manual");
    expect(result.kind).toBe("rejected");
  });

  it("a rejected candidate creates neither a step nor a path, even when dropped on an existing node", () => {
    const result = resolveDropGesture({ x: 210, y: 110 }, nodes, [{ trigger: "automatic", priority: 1 }], "manual");
    expect(result.kind).toBe("rejected");
  });

  it("carries the checkConnection reason through", () => {
    const result = resolveDropGesture({ x: 900, y: 900 }, nodes, [{ trigger: "manual" }], "automatic");
    expect(result).toEqual({
      kind: "rejected",
      refusal: "trigger",
      reason: "a step's paths must be all-manual or all-automatic, not mixed",
    });
  });

  it("rejects a terminal source dropped on an existing step", () => {
    const result = resolveDropGesture({ x: 210, y: 110 }, nodes, [], "manual", true);
    expect(result.kind).toBe("rejected");
  });

  it("rejects a terminal source dropped on empty canvas", () => {
    const result = resolveDropGesture({ x: 900, y: 900 }, nodes, [], "manual", true);
    expect(result.kind).toBe("rejected");
  });

  it("rejects a terminal source with the terminal reason, ahead of a checkConnection reason the same call would also produce", () => {
    const result = resolveDropGesture({ x: 900, y: 900 }, nodes, [{ trigger: "automatic", priority: 1 }], "manual", true);
    expect(result).toEqual({ kind: "rejected", refusal: "end" });
  });
});

describe("checkConnectSource", () => {
  it("refuses a terminal source as an end, whatever its paths say", () => {
    expect(checkConnectSource(true, [{ trigger: "automatic", priority: 1 }], "manual")).toEqual({ refusal: "end" });
  });

  it("refuses an inconsistent source with the engine's reason", () => {
    expect(checkConnectSource(false, [{ trigger: "automatic", priority: 1 }], "automatic")).toEqual({
      refusal: "trigger",
      reason: "automatic paths need a priority when a step has two or more",
    });
  });

  it("accepts a source the new way out keeps valid", () => {
    expect(checkConnectSource(false, [{ trigger: "manual" }], "manual")).toBeUndefined();
  });

  it("takes a subprocess source with an automatic way out", () => {
    const call = { id: "step_call", type: "subprocess", paths: [] } as unknown as DraftStep;
    const trigger = triggerForNewPath(call);
    expect(trigger).toBe("automatic");
    expect(checkConnectSource(false, [], trigger)).toBeUndefined();
  });

  it("is the check the drop runs first", () => {
    const refusal = checkConnectSource(false, [{ trigger: "manual" }], "automatic");
    expect(resolveDropGesture({ x: 210, y: 110 }, nodes, [{ trigger: "manual" }], "automatic")).toEqual({ kind: "rejected", ...refusal! });
  });
});

describe("hitTestGrownNode", () => {
  const two: NodePosition[] = [
    { id: "step_a", x: 0, y: 0 },
    { id: "step_b", x: 190, y: 0 },
  ];

  it("hits the node's own box", () => {
    expect(hitTestGrownNode({ x: 10, y: 10 }, two)).toBe("step_a");
  });

  it("hits a point up to 12 units outside the box, on every side", () => {
    expect(hitTestGrownNode({ x: -12, y: 30 }, two)).toBe("step_a");
    expect(hitTestGrownNode({ x: 90, y: -12 }, two)).toBe("step_a");
    expect(hitTestGrownNode({ x: 90, y: 72 }, two)).toBe("step_a");
    expect(hitTestGrownNode({ x: 372, y: 30 }, two)).toBe("step_b");
    expect(hitTestGrownNode({ x: 90, y: 73 }, two)).toBeUndefined();
    expect(hitTestGrownNode({ x: -13, y: 30 }, two)).toBeUndefined();
  });

  it("lets the box itself win where two grown boxes overlap", () => {
    // step_a grown reaches x 192 and step_b grown starts at x 178, so both cover 178 to 192.
    expect(hitTestGrownNode({ x: 179, y: 30 }, two)).toBe("step_a");
    expect(hitTestGrownNode({ x: 190, y: 30 }, two)).toBe("step_b");
  });

  it("takes the later node where two grown boxes overlap and neither box holds the point", () => {
    const apart: NodePosition[] = [
      { id: "step_a", x: 0, y: 0 },
      { id: "step_b", x: 195, y: 0 },
    ];
    expect(hitTestGrownNode({ x: 186, y: 30 }, apart)).toBe("step_b");
  });
});

describe("pressedDockingPoint", () => {
  const node = { x: 0, y: 0 };

  it("takes the point whose target holds a press 10 units outside a right-side point", () => {
    expect(pressedDockingPoint(node, { x: 190, y: 30 })).toMatchObject({ side: "right", at: 0 });
  });

  it("takes the nearer of two points where a press stands between them", () => {
    // 4 left of the top middle point (90, 0).
    expect(pressedDockingPoint(node, { x: 86, y: -5 })).toMatchObject({ side: "top", at: 0 });
    expect(pressedDockingPoint(node, { x: 76, y: -5 })).toMatchObject({ side: "top", at: -1 });
  });

  it("answers nothing for a press deeper than 6 units inside the border", () => {
    expect(pressedDockingPoint(node, { x: 90, y: 7 })).toBeUndefined();
    expect(pressedDockingPoint(node, { x: 90, y: 6 })).toMatchObject({ side: "top", at: 0 });
  });

  it("answers nothing for a press more than 12 units outside", () => {
    expect(pressedDockingPoint(node, { x: 90, y: -13 })).toBeUndefined();
  });
});

describe("resolveConnectDrop", () => {
  const nodes: NodePosition[] = [
    { id: "step_a", x: 0, y: 0 },
    { id: "step_b", x: 300, y: 0 },
  ];
  const pressed = { side: "bottom" as const, at: 0 };
  const base = { nodes, sourceStepId: "step_a", pressed, existingPaths: [], trigger: "manual" as const, sourceTerminal: false };

  it("stores the pressed point and the nearest point of the step under the release", () => {
    // Beside the first point on the left side of step_b: (300, 10).
    const result = resolveConnectDrop({ ...base, point: { x: 292, y: 12 } });
    expect(result).toEqual({
      kind: "connect-to-step",
      targetStepId: "step_b",
      trigger: "manual",
      source: pressed,
      target: { side: "left", at: -1 },
    });
  });

  it("counts a release on a press target outside the box as a release over the step", () => {
    const result = resolveConnectDrop({ ...base, point: { x: 289, y: 30 } });
    expect(result).toMatchObject({ kind: "connect-to-step", targetStepId: "step_b", target: { side: "left", at: 0 } });
  });

  it("stores the source point alone for a release over empty canvas", () => {
    const result = resolveConnectDrop({ ...base, point: { x: 900, y: 900 } });
    expect(result).toEqual({ kind: "create-step-and-connect", point: { x: 900, y: 900 }, trigger: "manual", source: pressed });
  });

  it("takes a point other than the pressed one for a release on the source step", () => {
    // Beside the pressed bottom-middle point (90, 60).
    const result = resolveConnectDrop({ ...base, point: { x: 91, y: 59 } });
    expect(result).toMatchObject({ kind: "connect-to-step", targetStepId: "step_a", source: pressed });
    if (result.kind !== "connect-to-step") return;
    expect(result.target).not.toEqual(pressed);
    expect(result.target).toEqual({ side: "bottom", at: 1 });
  });

  it("refuses a terminal source before it reads the release", () => {
    expect(resolveConnectDrop({ ...base, sourceTerminal: true, point: { x: 310, y: 30 } })).toEqual({ kind: "rejected", refusal: "end" });
  });

  it("refuses an inconsistent trigger before it reads the release", () => {
    const result = resolveConnectDrop({ ...base, existingPaths: [{ trigger: "automatic", priority: 1 }], point: { x: 900, y: 900 } });
    expect(result.kind).toBe("rejected");
  });
});

describe("dropTargetOf", () => {
  const nodes: NodePosition[] = [
    { id: "step_a", x: 0, y: 0 },
    { id: "step_b", x: 300, y: 0 },
  ];
  const pressed = { side: "bottom" as const, at: 0 };

  it("returns the step under the position and its nearest point", () => {
    expect(dropTargetOf({ x: 292, y: 12 }, nodes, "step_a", pressed)).toMatchObject({ stepId: "step_b", point: { side: "left", at: -1 } });
  });

  it("skips the pressed point on the source step", () => {
    const hit = dropTargetOf({ x: 91, y: 59 }, nodes, "step_a", pressed);
    expect(hit?.stepId).toBe("step_a");
    expect(hit?.point).toMatchObject({ side: "bottom", at: 1 });
  });

  it("returns nothing over empty canvas", () => {
    expect(dropTargetOf({ x: 900, y: 900 }, nodes, "step_a", pressed)).toBeUndefined();
  });
});

describe("resolveEndDrop", () => {
  // step_a spans x 0..180, y 0..60. step_b overlaps its grown box at x 186..366.
  const nodes: NodePosition[] = [
    { id: "step_a", x: 0, y: 0 },
    { id: "step_b", x: 186, y: 0 },
    { id: "step_far", x: 600, y: 0 },
  ];

  it("returns the nearest point of the end's own step for a release inside it", () => {
    // Left of the top middle (90, 0) by one step: (70, 0).
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 70, y: 4 } })).toEqual({ side: "top", at: -1 });
  });

  it("counts a release on a press target outside the box as a release on the step", () => {
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: -10, y: 30 } })).toEqual({ side: "left", at: 0 });
  });

  it("returns nothing for a release away from the step", () => {
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 300, y: 300 } })).toBeUndefined();
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: -13, y: 30 } })).toBeUndefined();
  });

  it("returns nothing for a release over another step, even inside the end's grown box", () => {
    // x 190 lies inside step_b's box and inside step_a's box grown by 12.
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 190, y: 30 } })).toBeUndefined();
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 650, y: 30 } })).toBeUndefined();
  });

  it("keeps a release between two grown boxes with the end's own step", () => {
    // x 183 lies in neither box and in both grown boxes.
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 183, y: 30 } })).toEqual({ side: "right", at: 0 });
  });

  it("skips the excluded point", () => {
    expect(resolveEndDrop({ stepId: "step_a", nodes, point: { x: 181, y: 31 }, exclude: { side: "right", at: 0 } })).toEqual({ side: "right", at: 1 });
  });

  it("returns nothing for a step it has no box for", () => {
    expect(resolveEndDrop({ stepId: "step_gone", nodes, point: { x: 10, y: 10 } })).toBeUndefined();
  });
});

describe("endDropEntry", () => {
  const left = { side: "left" as const, at: 0 };
  const top = { side: "top" as const, at: 0 };
  const right = { side: "right" as const, at: 0 };

  it("stores an unstored end released on its own automatic point", () => {
    expect(endDropEntry(undefined, "target", left)).toEqual({ target: left });
    expect(endDropEntry({ source: right }, "target", left)).toEqual({ source: right, target: left });
  });

  it("writes nothing for a release equal to the stored point, or for no release point", () => {
    expect(endDropEntry({ target: left }, "target", { ...left })).toBeUndefined();
    expect(endDropEntry({ target: left }, "target", undefined)).toBeUndefined();
  });

  it("replaces the dragged end and leaves the other end's value or absence alone", () => {
    expect(endDropEntry({ source: right, target: left }, "target", top)).toEqual({ source: right, target: top });
    expect(endDropEntry({ target: left }, "target", top)).toEqual({ target: top });
    expect(endDropEntry({ source: right }, "source", top)).toEqual({ source: top });
  });

  it("stores the other end's held point on a self path that stores none, so it stays where it was drawn", () => {
    // An unstored self path draws source right:0 and target left:0. Re-hanging the source keeps the target on left:0.
    expect(endDropEntry(undefined, "source", top, left)).toEqual({ source: top, target: left });
    expect(endDropEntry(undefined, "target", top, right)).toEqual({ source: right, target: top });
  });

  it("keeps a stored other end on a self path", () => {
    expect(endDropEntry({ target: right }, "source", top, left)).toEqual({ source: top, target: right });
  });
});
