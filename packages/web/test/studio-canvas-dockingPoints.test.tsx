import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import type { StepGroup } from "../src/areas/studio/canvas/groups.js";
import { t } from "../src/areas/studio/catalog.js";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import type { PathDockingEnds } from "../src/areas/studio/canvas/layout.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * What a step's docking points draw, read off static markup. A hover, a press
 * and a drag need a browser (the e2e flow for docking points).
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

function render(
  selected: string[],
  groups: StepGroup[] = [],
  opts: { draft?: Draft; dockingPoints?: Record<string, PathDockingEnds>; selectedPathId?: string } = {},
): string {
  const html = renderToStaticMarkup(
    <DraftProvider initial={opts.draft ?? DRAFT} token="token">
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
        dockingPoints={opts.dockingPoints ?? {}}
        selectedPathId={opts.selectedPathId}
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

/** The class string of the dot a point draws. Compiled classes hash, so tests
 * compare these between elements and never name one. */
function dotClassOf(set: string, key: string): string {
  const circle = /<circle [^>]*>/.exec(pointOf(set, key))?.[0] ?? "";
  const cls = /class="([^"]*)"/.exec(circle)?.[1];
  expect(cls).toBeString();
  return cls as string;
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

  it("draws a held point's dot in a form that differs from a free point's", () => {
    expect(dotClassOf(set, "left:0")).toBe(dotClassOf(set, "right:0"));
    expect(dotClassOf(set, "left:0")).not.toBe(dotClassOf(set, "top:0"));
    expect(dotClassOf(set, "top:0")).toBe(dotClassOf(set, "bottom:3"));
  });

  it("draws a free point alike on every task step", () => {
    const other = setOf(render(["step_review"]), "step_review");
    expect(dotClassOf(other, "top:0")).toBe(dotClassOf(set, "top:0"));
  });

  it("hides the set from the accessibility tree", () => {
    expect(set).toMatch(/^data-docking-step-id="step_approve" aria-hidden="true"/);
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

describe("an end step's dots", () => {
  const html = render(["step_done", "step_approve"]);
  const end = setOf(html, "step_done");
  const task = setOf(html, "step_approve");

  it("share one form, which differs from the free and the held form", () => {
    const keys = [...end.matchAll(/data-docking-point="([^"]*)"/g)].map((m) => m[1]);
    expect(keys.length).toBe(20);
    const forms = new Set(keys.map((k) => dotClassOf(end, k)));
    expect(forms.size).toBe(1);
    const [form] = [...forms];
    expect(form).not.toBe(dotClassOf(task, "top:0"));
    expect(form).not.toBe(dotClassOf(task, "right:0"));
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

describe("one point holding an incoming end and an outgoing end", () => {
  // path_a arrives at step_approve's top middle (330, 0); path_b leaves from it.
  const top = { side: "top" as const, at: 0 };
  const html = render(["step_approve"], [], { dockingPoints: { path_a: { target: top }, path_b: { source: top } } });
  const pathD = (id: string) => new RegExp(`data-path-id="${id}"[\\s\\S]*?<path d="([^"]*)"`).exec(html)?.[1] ?? "";

  it("routes both paths to that point's coordinates", () => {
    expect(pathD("path_a")).toMatch(/330,0$/);
    expect(pathD("path_b")).toMatch(/^M330,0/);
  });

  it("draws the point in the held form, alike for both ends", () => {
    const set = setOf(html, "step_approve");
    expect(pointOf(set, "top:0")).toContain('data-docking-held="true"');
    expect(dotClassOf(set, "top:0")).not.toBe(dotClassOf(set, "top:1"));
    expect(count(set, 'data-docking-held="true"')).toBe(1);
  });
});

describe("a selected path's end handles", () => {
  const html = render(["step_approve"], [], { selectedPathId: "path_a" });
  const handles = html.match(/<g [^>]*data-end-handle="[^"]*"[^>]*>[\s\S]*?<\/g>/g) ?? [];

  it("draws one handle at each end of the selected path and none on an unselected path", () => {
    expect(handles.length).toBe(2);
    expect(count(html, 'data-end-handle="source"')).toBe(1);
    expect(count(html, 'data-end-handle="target"')).toBe(1);
    for (const h of handles) expect(h).toContain('data-path-id="path_a"');
    expect(render(["step_approve"])).not.toContain("data-end-handle");
    const other = render(["step_approve"], [], { selectedPathId: "path_b" });
    expect(count(other, "data-end-handle=")).toBe(2);
    expect(other).not.toContain('data-end-handle="source" data-path-id="path_a"');
  });

  it("sits each handle on the path's drawn anchor, with a dot of radius 5 and a press target of radius 12", () => {
    // path_a leaves the right middle of step_review (180, 30) and arrives at the left middle of step_approve (240, 30).
    const source = handles.find((h) => h.includes('data-end-handle="source"')) ?? "";
    const target = handles.find((h) => h.includes('data-end-handle="target"')) ?? "";
    expect(source).toContain('cx="180" cy="30" r="5"');
    expect(source).toContain('cx="180" cy="30" r="12"');
    expect(target).toContain('cx="240" cy="30" r="5"');
    expect(target).toContain('cx="240" cy="30" r="12"');
  });

  it("gives each handle the pan exclusion and the tooltip", () => {
    for (const h of handles) {
      expect(h).toMatch(/^<g [^>]*class="[^"]*\bpanzoom-exclude\b/);
      expect(h).toContain("<title>Drag to another point on this step.</title>");
    }
    expect(t("canvas.endHandle")).toBe("Drag to another point on this step.");
  });

  it("draws the handles after every docking point and before the disclosures", () => {
    const groups: StepGroup[] = [{ id: "group_x", stepIds: ["step_review", "step_approve"], name: "X" }];
    const grouped = render(["step_approve"], groups, { selectedPathId: "path_a" });
    expect(grouped.indexOf("data-end-handle")).toBeGreaterThan(grouped.lastIndexOf("data-docking-point="));
    expect(grouped.indexOf("groupDisclosure")).toBeGreaterThan(grouped.lastIndexOf("data-end-handle="));
  });

  it("draws no handle on an end that sits on a collapsed group's box", () => {
    const collapsed: StepGroup[] = [{ id: "group_x", stepIds: ["step_approve", "step_done"], name: "X", collapsed: true }];
    const grouped = render([], collapsed, { selectedPathId: "path_a" });
    expect(count(grouped, "data-end-handle=")).toBe(1);
    expect(grouped).toContain('data-end-handle="source"');
  });
});

describe("a path from a step to itself", () => {
  const selfDraft: Draft = {
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
          paths: [{ id: "path_self" as never, to: "step_review" as never, trigger: "manual", label: "Again" }],
        },
      ],
    },
  };
  const ends = { path_self: { source: { side: "right" as const, at: 0 }, target: { side: "top" as const, at: 0 } } };
  const html = render([], [], { draft: selfDraft, dockingPoints: ends, selectedPathId: "path_self" });

  it("draws both end handles, on the two points it holds", () => {
    expect(html).toContain('data-end-handle="source"');
    expect(html).toContain('data-end-handle="target"');
    expect(html).toContain('cx="180" cy="30" r="5"');
    expect(html).toContain('cx="90" cy="0" r="5"');
  });
});
