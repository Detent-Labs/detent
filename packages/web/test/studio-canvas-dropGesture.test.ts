import { describe, expect, it } from "bun:test";
import { resolveDropGesture } from "../src/areas/studio/canvas/dropGesture.js";
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
    expect(result).toEqual({ kind: "rejected", reason: "a terminal step has no outgoing paths" });
  });
});
