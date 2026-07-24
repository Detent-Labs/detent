import { describe, expect, it } from "bun:test";
import { generateMermaidDsl, mermaidNodeId } from "../src/graph/mermaid";
import { draftToGraph } from "../src/graph/mapping";
import { mintId } from "../src/draft/ids";
import type { Draft } from "../src/draft/types";
import type { EditorIssue } from "../src/draft/issues";

function graphFor(draft: Draft) {
  return draftToGraph(draft, "en", "en");
}

describe("generateMermaidDsl", () => {
  it("renders a plain graph as a flowchart with directed edges", () => {
    const stepA = mintId("step");
    const stepB = mintId("step");
    const pathId = mintId("path");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [
          { id: stepA, key: "", label: { en: "Start" }, type: "task", paths: [{ id: pathId, key: "go", to: stepB, trigger: "manual" }] },
          { id: stepB, key: "", label: { en: "End" }, type: "task", terminal: true },
        ],
      },
    };

    const dsl = generateMermaidDsl(graphFor(draft), []);

    expect(dsl).toStartWith("flowchart LR");
    expect(dsl).toContain(`${mermaidNodeId(stepA)}["Start (initial)"]`);
    expect(dsl).toContain(`${mermaidNodeId(stepB)}["End (terminal)"]`);
    expect(dsl).toContain(`${mermaidNodeId(stepA)} -->|"go"| ${mermaidNodeId(stepB)}`);
  });

  it("swaps hyphens for underscores in node ids, since UUID ids contain hyphens", () => {
    const stepA = mintId("step");
    expect(mermaidNodeId(stepA)).not.toContain("-");
  });

  it("styles an issue-flagged node with a red stroke and a visible badge", () => {
    const stepA = mintId("step");
    const draft: Draft = {
      workflow: { initialStep: stepA, steps: [{ id: stepA, key: "start", label: { en: "Start" }, type: "task", terminal: true }] },
    };
    const issues: EditorIssue[] = [{ entityType: "step", entityId: stepA, message: "bad step", source: "zod" }];

    const dsl = generateMermaidDsl(graphFor(draft), issues);

    expect(dsl).toContain("⚠ 1");
    expect(dsl).toContain(`style ${mermaidNodeId(stepA)} stroke:#c00,stroke-width:2px`);
  });

  it("styles an issue-flagged edge via its positional linkStyle index", () => {
    const stepA = mintId("step");
    const stepB = mintId("step");
    const stepC = mintId("step");
    const pathAB = mintId("path");
    const pathBC = mintId("path");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [
          { id: stepA, key: "a", label: { en: "A" }, type: "task", paths: [{ id: pathAB, key: "go", to: stepB, trigger: "manual" }] },
          { id: stepB, key: "b", label: { en: "B" }, type: "task", paths: [{ id: pathBC, key: "go2", to: stepC, trigger: "manual" }] },
          { id: stepC, key: "c", label: { en: "C" }, type: "task", terminal: true },
        ],
      },
    };
    const issues: EditorIssue[] = [{ entityType: "path", entityId: pathBC, message: "bad guard", source: "cel" }];

    const dsl = generateMermaidDsl(graphFor(draft), issues);

    // pathAB is edge index 0 (no issue), pathBC is edge index 1 (flagged)
    expect(dsl).toContain("linkStyle 1 stroke:#c00");
    expect(dsl).not.toContain("linkStyle 0");
  });

  it("distinguishes counter-edges between the same two steps", () => {
    const stepA = mintId("step");
    const stepB = mintId("step");
    const forward = mintId("path");
    const backward = mintId("path");
    const draft: Draft = {
      workflow: {
        initialStep: stepA,
        steps: [
          { id: stepA, key: "a", label: { en: "A" }, type: "task", paths: [{ id: forward, key: "fail", to: stepB, trigger: "automatic", priority: 1, guard: { lang: "cel", src: "true" } }] },
          { id: stepB, key: "b", label: { en: "B" }, type: "task", paths: [{ id: backward, key: "retry", to: stepA, trigger: "manual" }] },
        ],
      },
    };

    const dsl = generateMermaidDsl(graphFor(draft), []);

    expect(dsl).toContain(`${mermaidNodeId(stepA)} -->|"fail"| ${mermaidNodeId(stepB)}`);
    expect(dsl).toContain(`${mermaidNodeId(stepB)} -->|"retry"| ${mermaidNodeId(stepA)}`);
  });

  it("escapes double quotes in labels so they don't collide with Mermaid's own quoting", () => {
    const stepA = mintId("step");
    const draft: Draft = {
      workflow: { initialStep: stepA, steps: [{ id: stepA, key: "", label: { en: 'Say "hi"' }, type: "task", terminal: true }] },
    };

    const dsl = generateMermaidDsl(graphFor(draft), []);

    expect(dsl).toContain("Say &quot;hi&quot;");
    expect(dsl).not.toContain('Say "hi"');
  });
});
