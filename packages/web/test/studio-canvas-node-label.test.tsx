import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import { NODE_HEIGHT, NODE_WIDTH } from "../src/areas/studio/canvas/geometry.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The one text a canvas node draws: the resolved label. Read off the
 * markup `CanvasView` renders, the way
 * `studio-fieldMatrixGrid-bulkBadges.test.tsx` reads its grid.
 *
 * `DraftProvider` seeds the content locale from the draft's own `baseLocale`,
 * so a fixture chooses the rendering locale by setting that field.
 */

/** `capture` carries a label in two locales. `archive` carries an empty one,
 * which is what an author mid-edit leaves behind, so its label resolves to
 * nothing at all. `handover` carries the label that overran its node before
 * the clamp landed. */
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
        {
          id: "step_handover" as never,
          key: "handover",
          type: "task",
          label: { en: "Confirm Completion to Opteon", de: "Abschluss an Opteon bestätigen" },
        },
      ],
    },
  };
}

const LAYOUT: Record<string, unknown> = {
  step_capture: { x: 0, y: 0 },
  step_archive: { x: 240, y: 0 },
  step_handover: { x: 480, y: 0 },
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

interface NodeParts {
  stepId: string;
  /** The inner `<div>`'s own text: the node body's whole label. */
  label: string | undefined;
  /** How many label elements the node draws. A key line would be a second. */
  labelCount: number;
  /** The outer `<div>`'s open tag, carrying `aria-hidden` and `title`. */
  box: string | undefined;
  /** Every `<text>` the node draws. The body draws none, since the label is
   * HTML now; only a stamp can still add one. */
  texts: string[];
  /** The node rect's own size, which no label length moves. */
  size: { width: string | undefined; height: string | undefined };
}

function attr(openTag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(openTag)?.[1];
}

/** What each node draws, in node order. A node group is the only element
 * opening with `data-step-id`, and the split runs each chunk from one node's
 * open tag to the next one's, so a match inside a chunk belongs to that
 * node. */
function nodeParts(html: string): NodeParts[] {
  return html
    .split(/(?=<g data-step-id=")/)
    .slice(1)
    .map((chunk) => {
      // The spread renders before the explicit props, so `class` opens each
      // `<div>`. The inner one carries nothing else, which is what closes its
      // match on `>` and keeps the two apart.
      const rect = /<rect width="([^"]*)" height="([^"]*)"/.exec(chunk);
      return {
        stepId: /<g data-step-id="([^"]*)"/.exec(chunk)?.[1] ?? "",
        label: /<div class="nodeLabel">([^<]*)</.exec(chunk)?.[1],
        labelCount: [...chunk.matchAll(/<div class="nodeLabel">/g)].length,
        box: /<div class="nodeLabelBox"[^>]*>/.exec(chunk)?.[0],
        texts: [...chunk.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]),
        size: { width: rect?.[1], height: rect?.[2] },
      };
    });
}

const ENGLISH = nodeParts(renderCanvas("en"));
const GERMAN = nodeParts(renderCanvas("de"));

describe("the canvas node's label", () => {
  it("prints a step's label", () => {
    expect(ENGLISH.length).toBe(3);
    expect(ENGLISH[0].stepId).toBe("step_capture");
    expect(ENGLISH[0].label).toBe("Capture the request");
  });

  // The defect: the operand order that read the key first, so every node on
  // the canvas printed "capture" over "capture" and the label never showed.
  it("reads the label from the label, never from the key", () => {
    expect(ENGLISH[0].label).toBe("Capture the request");
    expect(ENGLISH[0].label).not.toBe("capture");
  });

  // The key is a slug that references nothing, so the canvas does not spend a
  // second element on it. It stays in the node's accessible name and in the
  // inspector. A step whose label resolves empty is the one case where the
  // key reaches the body, through the fallback the last case here pins.
  it("draws one label element per node, and no key beside it", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      expect(node.labelCount).toBe(1);
    }
    expect(ENGLISH[0].label).not.toBe("capture");
  });

  // The label was an SVG `<text>` at a fixed baseline, which neither wraps nor
  // truncates. It is HTML now, so the node body draws no `<text>` at all. The
  // three fixture steps carry no stamp, which is the only `<text>` left.
  it("draws no `<text>` in the node body", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      expect(node.texts).toEqual([]);
    }
  });

  // The same operand-order defect, seen from the other side: a key-first node
  // reads "capture" in every locale, and never changes with the content one.
  it("prints the German label at a German content locale", () => {
    expect(GERMAN.length).toBe(3);
    expect(GERMAN[0].label).toBe("Anfrage erfassen");
    expect(GERMAN[0].label).not.toBe("Capture the request");
  });

  // The fallback chain the key line's removal left untouched: a step whose
  // label resolves to nothing still reads as its key.
  it("prints the key when the label resolves empty", () => {
    expect(ENGLISH[1].stepId).toBe("step_archive");
    expect(ENGLISH[1].label).toBe("archive");
  });
});

describe("a label too long for its node", () => {
  // The defect: "Confirm Completion to Opteon" ran out past the node's right
  // border and painted over the connect handle. The clamp is CSS, so what the
  // markup can pin is the box it lives in and the text hover reads back.
  it("keeps the whole label in the box the clamp reads", () => {
    expect(ENGLISH[2].stepId).toBe("step_handover");
    expect(ENGLISH[2].label).toBe("Confirm Completion to Opteon");
  });

  // The title rides the measurement, so it is the browser that decides
  // whether a given node keeps it. Server markup carries no layout, so the
  // component opens `clipped` and every node renders one here. That default
  // is the assertion: the reverse would render SSR markup contradicting the
  // client, and flash a node with no tooltip. `docs/browser-checks.md` holds
  // the check that a label which fits drops it.
  it("carries the untruncated label as the box's title, before measurement", () => {
    expect(attr(ENGLISH[2].box ?? "", "title")).toBe("Confirm Completion to Opteon");
    expect(attr(ENGLISH[0].box ?? "", "title")).toBe("Capture the request");
    expect(attr(GERMAN[2].box ?? "", "title")).toBe("Abschluss an Opteon bestätigen");
  });

  // The node group above carries the role, the composed name and the tab
  // stop, so an exposed box would name the step a second time, unlabelled.
  it("leaves the box out of the accessibility tree", () => {
    for (const node of [...ENGLISH, ...GERMAN]) {
      expect(attr(node.box ?? "", "aria-hidden")).toBe("true");
    }
  });

  // The variant this change did not take: a node that grows to fit its label.
  // Every consumer of `NODE_SIZE` reads the two constants, so the collision
  // test, the edge anchors, auto-arrange and fit-to-screen stay untouched.
  it("leaves the node's own size alone", () => {
    for (const node of ENGLISH) {
      expect(node.size.width).toBe(String(NODE_WIDTH));
      expect(node.size.height).toBe(String(NODE_HEIGHT));
    }
  });
});

/**
 * What the clamp needs but static markup cannot show. Read off the source, the
 * way `studio-processSurface.test.tsx` and `studio-fieldMatrixEmptyAndGated`
 * read this same file for a declaration. The rendered result belongs to
 * `docs/browser-checks.md`; these three keep the declarations that produce it
 * from being dropped as dead weight.
 */
describe("the declarations the clamp rests on", () => {
  const source = readFileSync(new URL("../src/areas/studio/canvas/CanvasView.tsx", import.meta.url), "utf8");
  const styleBlock = (name: string): string => {
    const open = source.indexOf(`${name}: {`);
    return source.slice(open, source.indexOf("},", open));
  };

  // The defect: a German compound is one token. Without this it does not
  // break, so the block stays one line, never exceeds two, and gets cut
  // mid-glyph with no ellipsis. Measured live at 144 against a 246 scrollWidth.
  it("lets a single long token break, so the clamp reaches German", () => {
    expect(styleBlock("nodeLabel")).toContain('overflowWrap: "anywhere"');
  });

  // The defect: centring gives one line and two lines different first
  // baselines, about 9.75 apart, so a row of nodes loses its shared baseline.
  it("tops the label box rather than centring it", () => {
    expect(styleBlock("nodeLabelBox")).toContain('alignItems: "flex-start"');
    expect(styleBlock("nodeLabelBox")).toContain("paddingTop: 20");
  });

  // 20 of padding plus the clamp's own two lines must close inside the node.
  // A 13px face on this stack lays out at 19.5 per line.
  it("closes two clamped lines inside the node's height", () => {
    expect(20 + 2 * 19.5).toBeLessThanOrEqual(NODE_HEIGHT);
  });
});
