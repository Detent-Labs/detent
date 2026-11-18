import { describe, expect, it } from "bun:test";
import { checkConnectSource, resolveDropGesture } from "../src/areas/studio/canvas/dropGesture.js";
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
