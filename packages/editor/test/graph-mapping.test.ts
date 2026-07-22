import { describe, expect, it } from "bun:test";
import { draftToGraph } from "../src/graph/mapping";
import { mintId } from "../src/draft/ids";
import type { Draft } from "../src/draft/types";

describe("draftToGraph", () => {
  it("maps steps to nodes and paths to edges", () => {
    const stepA = mintId("step");
    const stepB = mintId("step");
    const pathId = mintId("path");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [
          { id: stepA, key: "start", label: { en: "Start" }, type: "task", paths: [{ id: pathId, key: "go", to: stepB, trigger: "manual" }] },
          { id: stepB, key: "end", label: { en: "End" }, type: "task", terminal: true },
        ],
      },
    };

    const graph = draftToGraph(draft, "en", "en");

    expect(graph.nodes.map((n) => n.id).sort()).toEqual([stepA, stepB].sort());
    expect(graph.nodes.find((n) => n.id === stepA)?.isInitial).toBe(true);
    expect(graph.nodes.find((n) => n.id === stepB)?.terminal).toBe(true);
    expect(graph.edges).toEqual([{ id: pathId, source: stepA, target: stepB, label: "go" }]);
  });

  it("skips a path whose target does not resolve to a node in the same draft", () => {
    const stepA = mintId("step");
    const pathId = mintId("path");
    const draft: Draft = {
      workflow: {
        steps: [
          {
            id: stepA,
            key: "start",
            label: { en: "Start" },
            type: "task",
            paths: [{ id: pathId, key: "go", to: "step_does_not_exist" as never, trigger: "manual" }],
          },
        ],
      },
    };

    const graph = draftToGraph(draft, "en", "en");

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("returns an empty graph for an empty draft", () => {
    const graph = draftToGraph({}, "en", "en");
    expect(graph).toEqual({ nodes: [], edges: [] });
  });

  it("resolves a node's label through the current content locale, falling back to the base locale", () => {
    const stepA = mintId("step");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [{ id: stepA, key: "", label: { en: "Review", de: "Prüfen" }, type: "task", terminal: true }],
      },
    };

    expect(draftToGraph(draft, "de", "en").nodes[0].label).toBe("Prüfen");
    expect(draftToGraph(draft, "fr", "en").nodes[0].label).toBe("Review");
  });
});
