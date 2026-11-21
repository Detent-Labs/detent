import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";
import { t } from "../src/areas/studio/catalog.js";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * What a step's docking points draw, read off static markup. A hover, a press
 * and a drag need a browser (`e2e/canvas-docking-points.e2e.ts`).
 */

const DRAFT: Draft = {
  baseLocale: "en",
  fields: [],
  workflow: {
    initialStep: "step_review" as never,
    steps: [
      {
        id: "step_review" as never,
        key: "review",
        type: "task",
        label: { en: "Review" },
        paths: [{ id: "path_a" as never, to: "step_approve" as never, trigger: "manual", label: "Approve" }],
      },
      {
        id: "step_approve" as never,
        key: "approve",
        type: "task",
        label: { en: "Approve" },
        paths: [{ id: "path_b" as never, to: "step_done" as never, trigger: "manual", label: "Finish" }],
      },
      { id: "step_done" as never, key: "done", type: "task", label: { en: "Done" }, terminal: true, outcome: "done" },
    ],
  },
};

const LAYOUT: Record<string, unknown> = {
  step_review: { x: 0, y: 0 },
  step_approve: { x: 240, y: 0 },
  step_done: { x: 480, y: 0 },
};

function render(selected: string[], groups: StepGroup[] = []): string {
  const html = renderToStaticMarkup(
    <DraftProvider initial={DRAFT} token="token">
      <CanvasView
        layout={LAYOUT}
        onMoveStep={() => {}}
        onMoveSteps={() => {}}
        onArrange={() => {}}
        selectedStepIds={selected}
        onSelectStep={() => {}}
        onSelectSteps={() => {}}
        edgeStyle="step"
        onEdgeStyleChange={() => {}}
        waypoints={{}}
        dockingPoints={{}}
        onDockingPointsChange={() => {}}
        onWaypointsChange={() => {}}
        groups={groups}
        onGroupsChange={() => {}}
      />
    </DraftProvider>,
  );
  return html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
}

/** The markup of one step's docking set, or "" where none draws. */
function setOf(html: string, stepId: string): string {
  const open = html.indexOf(`data-docking-step-id="${stepId}"`);
  if (open === -1) return "";
  const next = html.indexOf("data-docking-step-id=", open + 1);
  return html.slice(open, next === -1 ? undefined : next);
}

function pointOf(set: string, key: string): string {
  const open = set.indexOf(`data-docking-point="${key}"`);
  expect(open).toBeGreaterThan(-1);
  const close = set.indexOf("</g>", open);
  return set.slice(open, close);
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("a resting canvas", () => {
  it("draws no docking point and no connect handle", () => {
    const html = render([]);
    expect(html).not.toContain("data-docking-step-id");
    expect(html).not.toContain("data-docking-point");
    expect(html).not.toContain("data-connect-step-id");
  });
});

describe("a selected step", () => {
  const html = render(["step_approve"]);
  const set = setOf(html, "step_approve");

  it("draws its twenty points and none on another step", () => {
    expect(count(set, "data-docking-point=")).toBe(20);
    expect(setOf(html, "step_review")).toBe("");
    expect(setOf(html, "step_done")).toBe("");
  });

  it("draws three points on each level side and seven on each upright one", () => {
    for (const side of ["left", "right"]) expect(count(set, `data-docking-point="${side}:`)).toBe(3);
    for (const side of ["top", "bottom"]) expect(count(set, `data-docking-point="${side}:`)).toBe(7);
  });

  it("puts the middle point at the side's midpoint", () => {
    // step_approve stands at (240, 0): its right middle is (420, 30) and its top middle (330, 0).
    expect(pointOf(set, "right:0")).toContain('cx="420" cy="30" r="3.5"');
    expect(pointOf(set, "top:0")).toContain('cx="330" cy="0" r="3.5"');
  });

  it("draws every point's group as a pan exclusion", () => {
    const groups = set.match(/<g [^>]*data-docking-point="[^"]*"[^>]*>/g) ?? [];
    expect(groups.length).toBe(20);
    for (const open of groups) expect(open).toMatch(/class="[^"]*\bpanzoom-exclude\b/);
  });

  it("draws a point a path end sits on as held, and any other as free", () => {
    // path_a arrives at the left middle, path_b leaves the right middle.
    expect(pointOf(set, "left:0")).toContain('data-docking-held="true"');
    expect(pointOf(set, "right:0")).toContain('data-docking-held="true"');
    expect(pointOf(set, "top:0")).toContain('data-docking-held="false"');
    expect(count(set, 'data-docking-held="true"')).toBe(2);
  });

  it("draws no connect handle at the right middle", () => {
    expect(html).not.toContain("data-connect-step-id");
    expect(html).not.toContain('r="7"');
  });

  it("covers each point with a press target 12 units outward and 6 inward", () => {
    // Right middle (420, 30): outward is +x. Top middle (330, 0): outward is -y.
    expect(pointOf(set, "right:0")).toContain('x="414" y="20" width="18" height="20"');
    expect(pointOf(set, "top:0")).toContain('x="320" y="-12" width="20" height="18"');
    expect(pointOf(set, "left:0")).toContain('x="228" y="20" width="18" height="20"');
    expect(pointOf(set, "bottom:0")).toContain('x="320" y="54" width="20" height="18"');
  });

  it("titles each point with the gesture", () => {
    expect(pointOf(set, "top:1")).toContain(`<title>${t("canvas.connectHandle")}</title>`);
  });
});

describe("an end step's points", () => {
  const set = setOf(render(["step_done"]), "step_done");

  it("draw dashed, whether or not a path ends on them, and carry the end's tooltip", () => {
    expect(count(set, "data-docking-point=")).toBe(20);
    expect(count(set, 'data-docking-end="true"')).toBe(20);
    expect(pointOf(set, "left:0")).toContain(`<title>${t("canvas.connectHandleEnd")}</title>`);
  });
});

describe("a collapsed group's box", () => {
  const groups: StepGroup[] = [{ id: "group_x", stepIds: ["step_approve", "step_done"], name: "X", collapsed: true }];

  it("draws no point, for a hidden member that is selected", () => {
    expect(render(["step_approve"], groups)).not.toContain("data-docking-point");
  });
});

describe("the draw order", () => {
  it("draws the points after every sentence and node, before the disclosures", () => {
    const groups: StepGroup[] = [{ id: "group_x", stepIds: ["step_review", "step_approve"], name: "X" }];
    const html = render(["step_review"], groups);
    expect(html.indexOf("data-docking-step-id")).toBeGreaterThan(html.lastIndexOf("data-step-id="));
    expect(html.indexOf("groupDisclosure")).toBeGreaterThan(html.lastIndexOf("data-docking-point="));
  });
});
