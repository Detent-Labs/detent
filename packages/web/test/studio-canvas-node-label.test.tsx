import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import { NODE_HEIGHT } from "../src/areas/studio/canvas/geometry.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The one text line a canvas node draws: the resolved label. Read off the
 * markup `CanvasView` renders, the way
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
  /** The label line's own baseline, as the markup carries it. */
  labelY: string | undefined;
  /** Every `<text>` the node body draws, so a second line shows up as a
   * second entry rather than going unread. */
  texts: string[];
}

/** The one line each node draws, in node order. A node group is the only
 * element opening with `data-step-id`, and the split runs each chunk from one
 * node's open tag to the next one's, so a match inside a chunk belongs to that
 * node. */
function nodeLines(html: string): NodeLines[] {
  return html
    .split(/(?=<g data-step-id=")/)
    .slice(1)
    .map((chunk) => {
      // `class` renders last, so one match carries the label's attributes and
      // its content together and the two cannot come from different elements.
      const labelText = /<text([^>]*)class="nodeLabel">([^<]*)</.exec(chunk);
      return {
        stepId: /<g data-step-id="([^"]*)"/.exec(chunk)?.[1] ?? "",
        label: labelText?.[2],
        labelY: labelText ? /\by="([^"]*)"/.exec(labelText[1])?.[1] : undefined,
        texts: [...chunk.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]),
      };
    });
}

const ENGLISH = nodeLines(renderCanvas("en"));
const GERMAN = nodeLines(renderCanvas("de"));

describe("the canvas node's one text line", () => {
  it("prints a step's label", () => {
    expect(ENGLISH.length).toBe(2);
    expect(ENGLISH[0].stepId).toBe("step_capture");
    expect(ENGLISH[0].label).toBe("Capture the request");
  });

  // The defect: the operand order that read the key first, so every node on
  // the canvas printed "capture" over "capture" and the label never showed.
  it("reads the label line from the label, never from the key", () => {
    expect(ENGLISH[0].label).toBe("Capture the request");
    expect(ENGLISH[0].label).not.toBe("capture");
  });

  // Baseline 24 is where the label sat while a key line followed it. Nothing
  // follows it now, so the one line centres: half the node's height, plus the
  // ~4 units a 13px face carries below its own centre.
  it("centres the label line in the node", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      expect(node.labelY).toBe(String(NODE_HEIGHT / 2 + 4));
    }
  });

  // The key is a slug that references nothing, so the canvas does not spend a
  // line on it. It stays in the node's accessible name and in the inspector.
  it("draws no key line, on any node, in any locale", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      expect(node.texts).toEqual([node.label ?? ""]);
    }
    expect(ENGLISH[0].texts).not.toContain("capture");
  });

  // The same operand-order defect, seen from the other side: a key-first node
  // reads "capture" in every locale, and never changes with the content one.
  it("prints the German label at a German content locale", () => {
    expect(GERMAN.length).toBe(2);
    expect(GERMAN[0].label).toBe("Anfrage erfassen");
    expect(GERMAN[0].label).not.toBe("Capture the request");
  });

  // The fallback chain the key line's removal leaves untouched: a step whose
  // label resolves to nothing still reads as its key.
  it("prints the key on its one line when the label resolves empty", () => {
    expect(ENGLISH[1].stepId).toBe("step_archive");
    expect(ENGLISH[1].label).toBe("archive");
    expect(ENGLISH[1].texts).toEqual(["archive"]);
  });
});
