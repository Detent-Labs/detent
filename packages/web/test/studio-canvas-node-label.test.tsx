import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The two text lines a canvas node draws: the resolved label, and the step's
 * key underneath it. Read off the markup `CanvasView` renders, the way
 * `studio-fieldMatrixGrid-bulkBadges.test.tsx` reads its grid.
 *
 * `DraftProvider` seeds the content locale from the draft's own `baseLocale`,
 * so a fixture chooses the rendering locale by setting that field.
 */

/** `capture` carries a label in two locales. `archive` carries an empty one,
 * which is what an author mid-edit leaves behind, so its label resolves to
 * nothing at all. */
function draftAt(baseLocale: string): Draft {
  return {
    baseLocale,
    workflow: {
      steps: [
        {
          id: "step_capture" as never,
          key: "capture",
          type: "task",
          label: { en: "Capture the request", de: "Anfrage erfassen" },
        },
        { id: "step_archive" as never, key: "archive", type: "task", label: {} },
      ],
    },
  };
}

const LAYOUT: Record<string, unknown> = {
  step_capture: { x: 0, y: 0 },
  step_archive: { x: 240, y: 0 },
};

function renderCanvas(baseLocale: string): string {
  return renderToStaticMarkup(
    <DraftProvider initial={draftAt(baseLocale)} token="token">
      <CanvasView
        layout={LAYOUT}
        onMoveStep={() => {}}
        onArrange={() => {}}
        selectedStepIds={[]}
        onSelectStep={() => {}}
        onSelectSteps={() => {}}
        edgeStyle="step"
        onEdgeStyleChange={() => {}}
        waypoints={{}}
        onWaypointsChange={() => {}}
        groups={[]}
        onGroupsChange={() => {}}
      />
    </DraftProvider>,
  );
}

interface NodeLines {
  stepId: string;
  label: string | undefined;
  key: string | undefined;
}

/** The two lines each node draws, in node order. A node group is the only
 * element opening with `data-step-id`, and the split runs each chunk from one
 * node's open tag to the next one's, so the first match of either class inside
 * a chunk belongs to that node. */
function nodeLines(html: string): NodeLines[] {
  return html
    .split(/(?=<g data-step-id=")/)
    .slice(1)
    .map((chunk) => ({
      stepId: /<g data-step-id="([^"]*)"/.exec(chunk)?.[1] ?? "",
      label: /class="canvas-node-label">([^<]*)</.exec(chunk)?.[1],
      key: /class="canvas-node-key">([^<]*)</.exec(chunk)?.[1],
    }));
}

const ENGLISH = nodeLines(renderCanvas("en"));
const GERMAN = nodeLines(renderCanvas("de"));

describe("the canvas node's two text lines", () => {
  it("prints a step's label and its key, each on its own line", () => {
    expect(ENGLISH.length).toBe(2);
    expect(ENGLISH[0]).toEqual({ stepId: "step_capture", label: "Capture the request", key: "capture" });
  });

  // The defect: the operand order that read the key first, so every node on
  // the canvas printed "capture" over "capture" and the label never showed.
  it("reads the label line from the label, never from the key", () => {
    expect(ENGLISH[0].label).toBe("Capture the request");
    expect(ENGLISH[0].label).not.toBe("capture");
  });

  // The defect: an unconditional key line, which printed the fallback value
  // twice the moment a label resolved to the key.
  it("never prints one string on both lines", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      if (node.key === undefined) continue;
      expect(node.label).not.toBe(node.key);
    }
  });

  // The same operand-order defect, seen from the other side: a key-first node
  // reads "capture" in every locale, and never changes with the content one.
  it("prints the German label at a German content locale", () => {
    expect(GERMAN.length).toBe(2);
    expect(GERMAN[0].label).toBe("Anfrage erfassen");
    expect(GERMAN[0].label).not.toBe("Capture the request");
    // The key is a slug, not display text, so it stays put under the locale.
    expect(GERMAN[0].key).toBe("capture");
  });

  // The defect: the key line drawn whatever the label line held, so a step
  // with no label yet printed its key on both lines.
  it("prints the key on the label line when the label resolves empty, and draws no key line", () => {
    expect(ENGLISH[1].stepId).toBe("step_archive");
    expect(ENGLISH[1].label).toBe("archive");
    expect(ENGLISH[1].key).toBeUndefined();
  });
});
