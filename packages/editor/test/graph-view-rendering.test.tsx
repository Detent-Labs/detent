import { describe, expect, it } from "bun:test";
import { createMermaidRenderer } from "mermaid-isomorphic";
import { generateMermaidDsl } from "../src/graph/mermaid";
import { draftToGraph } from "../src/graph/mapping";
import { mintId } from "../src/draft/ids";
import type { Draft } from "../src/draft/types";
import type { EditorIssue } from "../src/draft/issues";

/**
 * Renders the same DSL string `GraphView.tsx` generates and hands to
 * `mermaid.render()` in the browser — `mermaid-isomorphic` drives a real
 * headless Chromium under the hood (Mermaid's own layout needs real
 * `SVGTextElement.getBBox()` text measurement, which jsdom doesn't
 * implement), replacing the old `react-dom/server`-based static-markup
 * convention this test used under React Flow (editor-graph-mermaid
 * design.md).
 */
const renderMermaid = createMermaidRenderer();

async function renderDsl(dsl: string): Promise<string> {
  const [result] = await renderMermaid([dsl]);
  if (result.status !== "fulfilled") throw result.reason;
  return result.value.svg;
}

describe("generated graph diagram", () => {
  it("renders a directed edge with a visible (non-transparent) default arrowhead", async () => {
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
    const dsl = generateMermaidDsl(draftToGraph(draft, "en", "en"), []);

    const svg = await renderDsl(dsl);

    // A default (non-issue) edge points at Mermaid's shared marker, which
    // is colored via a `.marker{fill:#333333;stroke:#333333;}` CSS rule —
    // not an inline `fill:none`/`stroke:none` on the marker itself, the
    // exact regression class the React-Flow implementation once had
    // (editor-graph-arrowhead-fix). The SVG's `<style>` block does contain
    // unrelated `fill:none` rules elsewhere (e.g. `.flowchart-link`, an
    // edge *line* style, not the marker), so this asserts the specific
    // `.marker` rule paints a real color rather than a blanket string check.
    expect(svg).toContain('marker-end="url(#');
    expect(svg).toMatch(/\.marker\{fill:#[0-9a-fA-F]{3,6};stroke:#[0-9a-fA-F]{3,6};\}/);
  });

  it("colors an issue-flagged node's border red and shows a visible issue badge", async () => {
    const stepA = mintId("step");
    const draft: Draft = {
      workflow: { initialStep: stepA, steps: [{ id: stepA, key: "start", label: { en: "Start" }, type: "task", terminal: true }] },
    };
    const issues: EditorIssue[] = [{ entityType: "step", entityId: stepA, message: "bad step", source: "zod" }];
    const dsl = generateMermaidDsl(draftToGraph(draft, "en", "en"), issues);

    const svg = await renderDsl(dsl);

    expect(svg).toContain("⚠ 1");
    expect(svg).toContain("stroke:#c00 !important");
  });

  it("colors an issue-flagged edge's line and generates a matching colored arrowhead marker", async () => {
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
    const issues: EditorIssue[] = [{ entityType: "path", entityId: pathId, message: "bad guard", source: "cel" }];
    const dsl = generateMermaidDsl(draftToGraph(draft, "en", "en"), issues);

    const svg = await renderDsl(dsl);

    // Mermaid auto-generates a distinct, colored marker variant for a
    // `linkStyle`-colored edge (id suffix matches the color) and points
    // that edge's marker-end at it, rather than the shared default marker
    // — resolving editor-graph-mermaid design.md's open question: no
    // custom post-render marker patch is needed.
    expect(svg).toMatch(/stroke:#c00/);
    expect(svg).toMatch(/<marker[^>]*__c00"[^>]*>.*?fill="#c00"/s);
  });

  it("escapes a double-quoted label so it round-trips to a literal quote, not broken markup", async () => {
    const stepA = mintId("step");
    const draft: Draft = {
      workflow: { initialStep: stepA, steps: [{ id: stepA, key: "", label: { en: 'Say "hi"' }, type: "task", terminal: true }] },
    };
    const dsl = generateMermaidDsl(draftToGraph(draft, "en", "en"), []);

    const svg = await renderDsl(dsl);

    expect(svg).toContain('Say "hi"');
  });
});
