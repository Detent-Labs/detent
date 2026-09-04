import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import { t } from "../src/areas/studio/catalog.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";

/**
 * What a screen reader and a keyboard find on the canvas, read off the markup
 * `CanvasView` renders. `packages/web` carries no DOM harness, so
 * `renderToStaticMarkup` is the whole observation surface: a role, a
 * `tabindex`, an `aria-label` and an attribute value are visible here, and a
 * focus move and a key press are not. Those stay in `docs/browser-checks.md`.
 *
 * The harness is `studio-fieldMatrixGrid-bulkBadges.test.tsx`'s: a `useDraft`
 * component inside `DraftProvider`, rendered to a string.
 */

const DRAFT: Draft = {
  baseLocale: "en",
  workflow: {
    initialStep: "step_capture" as never,
    steps: [
      {
        id: "step_capture" as never,
        key: "capture",
        type: "task",
        label: { en: "Capture the request" },
        paths: [{ id: "path_review" as never, to: "step_review" as never, trigger: "manual", label: "Send for review" }],
      },
      {
        id: "step_review" as never,
        key: "review",
        type: "task",
        label: { en: "Review the request" },
        paths: [
          // Automatic and guarded, which is the one shape that draws a guard
          // label.
          {
            id: "path_approve" as never,
            to: "step_approve" as never,
            trigger: "automatic",
            priority: 1,
            guard: { lang: "cel", src: "data.amount > 10" },
          },
          { id: "path_reject" as never, to: "step_reject" as never, trigger: "automatic", priority: 2 },
        ],
      },
      { id: "step_approve" as never, key: "approve", type: "task", label: { en: "Approve" } },
      { id: "step_archive" as never, key: "archive", type: "task", label: { en: "Archive" } },
      { id: "step_reject" as never, key: "reject", type: "task", label: { en: "Reject" }, terminal: true, outcome: "rejected" },
    ],
  },
};

/** Every step carries a position, so both groups below reach the two members
 * `groups.ts` wants before it draws a box at all. */
const LAYOUT: Record<string, unknown> = {
  step_capture: { x: 0, y: 0 },
  step_review: { x: 240, y: 0 },
  step_approve: { x: 520, y: 0 },
  step_archive: { x: 760, y: 0 },
  step_reject: { x: 520, y: 220 },
};

/** One expanded group and one collapsed group, two members apiece. A group of
 * fewer than two present members draws no box, and would leave every group
 * assertion below testing nothing. */
const GROUPS: StepGroup[] = [
  { id: "group_intake", stepIds: ["step_capture", "step_review"], name: "Intake" },
  { id: "group_outcome", stepIds: ["step_approve", "step_archive"], name: "Outcome", collapsed: true },
];

function renderCanvas(): string {
  return renderToStaticMarkup(
    <DraftProvider initial={DRAFT} token="token">
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
        groups={GROUPS}
        onGroupsChange={() => {}}
      />
    </DraftProvider>,
  );
}

interface Tag {
  name: string;
  open: boolean;
  selfClosing: boolean;
  text: string;
  start: number;
  end: number;
}

/** Every tag in the markup, in document order. React escapes `<`, `>` and `"`
 * inside an attribute value, so no quoted value holds a `>` and the scan needs
 * no quote tracking of its own. */
function tagsOf(html: string): Tag[] {
  const found: Tag[] = [];
  const pattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    found.push({
      name: match[2],
      open: match[1] !== "/",
      selfClosing: match[3].endsWith("/"),
      text: match[0],
      start: match.index,
      end: pattern.lastIndex,
    });
    match = pattern.exec(html);
  }
  return found;
}

interface Element {
  open: string;
  inner: string;
}

/** Every element whose open tag `matches`, with the markup it encloses.
 * Depth-aware over its own tag name, so a `<g>` inside a `<g>`, and the icon's
 * `<svg>` inside the canvas's own, both nest correctly. */
function elementsOf(html: string, matches: (openTag: string) => boolean): Element[] {
  const tags = tagsOf(html);
  const found: Element[] = [];
  for (let i = 0; i < tags.length; i++) {
    const start = tags[i];
    if (!start.open || start.selfClosing || !matches(start.text)) continue;
    let depth = 1;
    let j = i + 1;
    while (j < tags.length && depth > 0) {
      const tag = tags[j];
      if (tag.name === start.name && !tag.selfClosing) depth += tag.open ? 1 : -1;
      j++;
    }
    found.push({ open: start.text, inner: html.slice(start.end, tags[j - 1].start) });
  }
  return found;
}

function attr(openTag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(openTag)?.[1];
}

/** Whether an open tag names an element of `tag` carrying `className` as one
 * whole class token. `canvas-node` must not match `canvas-node-rect`. */
function isTag(openTag: string, tag: string, className: string): boolean {
  if (!openTag.startsWith(`<${tag} `)) return false;
  return (attr(openTag, "class") ?? "").split(" ").includes(className);
}

const HTML = renderCanvas();

/** The canvas's own `<svg>`, and everything inside it. Every assertion below
 * reads one of the two: the toolbar's buttons are HTML siblings outside it. */
const CANVAS = elementsOf(HTML, (openTag) => isTag(openTag, "svg", "svg"))[0];

const NODES = elementsOf(CANVAS.inner, (openTag) => isTag(openTag, "g", "canvas-node"));
const EDGES = elementsOf(CANVAS.inner, (openTag) => isTag(openTag, "g", "edgeGroup"));
const DISCLOSURES = elementsOf(CANVAS.inner, (openTag) => isTag(openTag, "button", "groupDisclosure"));

describe("the canvas node's accessibility markup", () => {
  // The defect: a step node drawn as a bare `<g>`, carrying no role, no name
  // and no tab stop, so a screen reader read nothing and Tab walked past it.
  it("draws every step node as a named button, not a bare group", () => {
    // capture and review inside the expanded box, reject outside it. approve
    // and archive hide inside the collapsed one.
    expect(NODES.length).toBe(3);
    for (const node of NODES) {
      expect(attr(node.open, "role")).toBe("button");
      expect(attr(node.open, "tabindex")).toMatch(/^(0|-1)$/);
      expect(attr(node.open, "aria-label")).toBeString();
      expect(attr(node.open, "aria-label")).not.toBe("");
    }
  });

  // The defect: an `<svg>` carrying neither role nor name. `application` is
  // what lets an arrow key reach the canvas's own handler rather than a screen
  // reader's browse mode, and a nameless canvas announces as "graphic".
  it("names the canvas svg and gives it a role", () => {
    expect(attr(CANVAS.open, "role")).toBe("application");
    expect(attr(CANVAS.open, "aria-label")).toBe(t("canvas.svgLabel"));
  });

  // The defect: the node rectangle's `rx="2"`. The design language draws
  // square corners, and one rounded rect reads as a different component.
  it("draws every node rect with square corners", () => {
    for (const node of NODES) {
      const rects = elementsOf(node.inner, (openTag) => openTag.startsWith("<rect"));
      expect(rects.length).toBeGreaterThan(0);
      for (const rect of rects) expect(attr(rect.open, "rx")).toBe("0");
    }
  });

  // The defect: the nameless edge `<g>`, which no keyboard could reach and a
  // screen reader announced as nothing at all.
  it("draws every path as a named button", () => {
    expect(EDGES.length).toBe(3);
    for (const edge of EDGES) {
      expect(attr(edge.open, "role")).toBe("button");
      expect(attr(edge.open, "tabindex")).toMatch(/^(0|-1)$/);
      expect(attr(edge.open, "aria-label")).toBeString();
      expect(attr(edge.open, "aria-label")).not.toBe("");
    }
  });

  // The defect: the guard label left in the accessibility tree, announcing a
  // second time everything the path itself now carries.
  it("hides every guard label from the accessibility tree", () => {
    const labels = elementsOf(CANVAS.inner, (openTag) => isTag(openTag, "div", "edgeGuardLabel"));
    expect(labels.length).toBe(1);
    for (const label of labels) expect(attr(label.open, "aria-hidden")).toBe("true");
  });

  // The defect: a disclosure reporting one state in both, so the author never
  // heard whether the group was open or shut.
  it("reports a collapsed group as collapsed and an expanded one as expanded", () => {
    const collapsed = DISCLOSURES.find((d) => attr(d.open, "data-group-id") === "group_outcome");
    const expanded = DISCLOSURES.find((d) => attr(d.open, "data-group-id") === "group_intake");
    expect(attr(collapsed?.open ?? "", "aria-expanded")).toBe("false");
    expect(attr(expanded?.open ?? "", "aria-expanded")).toBe("true");
  });

  // The defect: a hidden member drawn anyway, which puts a node the author
  // folded away back under the collapsed box.
  it("renders no member node for a collapsed group", () => {
    expect(NODES.map((node) => attr(node.open, "data-step-id"))).toEqual(["step_capture", "step_review", "step_reject"]);
    const members = elementsOf(CANVAS.inner, (openTag) => attr(openTag, "id") === "canvas-group-members-group_outcome");
    expect(members.length).toBe(1);
    expect(members[0].inner).toBe("");
  });

  // The defect class: a second focusable HTML control smuggled into a
  // `<foreignObject>` — the guard label turned into a button, say — which
  // would sit in the tab order the roving `tabindex` is meant to own. The
  // inline rename input is the only other focusable HTML the canvas ever
  // draws, and it exists only while a rename is open, which static markup
  // cannot reach; `docs/browser-checks.md` covers that one.
  it("holds no focusable HTML inside the canvas beyond the disclosure buttons", () => {
    const focusable = tagsOf(CANVAS.inner).filter(
      (tag) => tag.open && ["a", "button", "input", "select", "textarea"].includes(tag.name),
    );
    expect(focusable.map((tag) => tag.name)).toEqual(["button", "button"]);
    expect(focusable.every((tag) => (attr(tag.text, "class") ?? "").split(" ").includes("groupDisclosure"))).toBe(true);
  });

  // The defect class: a disclosure inside its group's own `<g>`, where the
  // box's drag handlers take the press meant for the button.
  it("sizes each disclosure's foreignObject at 28 by 28, outside every group", () => {
    const holders = elementsOf(CANVAS.inner, (openTag) => openTag.startsWith("<foreignObject")).filter((holder) =>
      holder.inner.includes("groupDisclosure"),
    );
    expect(holders.length).toBe(2);
    for (const holder of holders) {
      expect(attr(holder.open, "width")).toBe("28");
      expect(attr(holder.open, "height")).toBe("28");
    }
    const boxes = elementsOf(CANVAS.inner, (openTag) => isTag(openTag, "g", "group"));
    expect(boxes.length).toBe(2);
    for (const box of boxes) expect(box.inner).not.toContain("groupDisclosure");
  });

  // The defect class: two tab stops inside one roving group, which puts the
  // canvas into the page's tab order twice.
  it("carries exactly one tab stop inside the canvas on first render", () => {
    expect((CANVAS.inner.match(/tabindex="0"/g) ?? []).length).toBe(1);
    const stop = NODES.find((node) => attr(node.open, "tabindex") === "0");
    expect(attr(stop?.open ?? "", "data-step-id")).toBe("step_capture");
  });

  // The defect class: a disclosure drawn as an SVG shape with a click handler,
  // which answers no Enter and takes no focus.
  it("draws each disclosure as a real button inside a foreignObject", () => {
    expect(DISCLOSURES.length).toBe(2);
    for (const disclosure of DISCLOSURES) expect(attr(disclosure.open, "type")).toBe("button");
    const holders = elementsOf(CANVAS.inner, (openTag) => openTag.startsWith("<foreignObject"));
    expect(holders.filter((holder) => holder.inner.includes("groupDisclosure")).length).toBe(DISCLOSURES.length);
  });

  // The defect class: an `aria-controls` pointing at an element the markup
  // does not hold, which a collapsed group would produce the moment its
  // members `<g>` rendered only while expanded.
  it("points each disclosure's aria-controls at a group element the markup holds", () => {
    expect(DISCLOSURES.length).toBe(2);
    for (const disclosure of DISCLOSURES) {
      const controls = attr(disclosure.open, "aria-controls");
      expect(controls).toBeString();
      expect(elementsOf(CANVAS.inner, (openTag) => openTag.startsWith("<g") && attr(openTag, "id") === controls).length).toBe(1);
    }
  });
});
