import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasView } from "../src/areas/studio/canvas/CanvasView.js";
import { NODE_SIZE, routePath, routeThroughWaypoints, type DockingEnd, type Point } from "../src/areas/studio/canvas/geometry.js";
import { drawnBox, type StepGroup } from "../src/areas/studio/canvas/groups.js";
import type { PathDockingEnds } from "../src/areas/studio/canvas/layout.js";
import { DraftProvider } from "../src/areas/studio/draft/store.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The `d` attribute of a drawn path, read off static markup. A press, a drag
 * and a hover need a browser (`e2e/`); the route a stored point draws does not.
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
      { id: "step_approve" as never, key: "approve", type: "task", label: { en: "Approve" } },
      { id: "step_archive" as never, key: "archive", type: "task", label: { en: "Archive" } },
    ],
  },
};

const REVIEW: Point = { x: 0, y: 0 };
const RIGHT_OF: Point = { x: 240, y: 0 };
const BELOW: Point = { x: 40, y: 200 };

function layoutWith(approve: Point): Record<string, unknown> {
  return { step_review: REVIEW, step_approve: approve, step_archive: { x: 480, y: 0 } };
}

function dOf(opts: {
  approve: Point;
  dockingPoints?: Record<string, PathDockingEnds>;
  waypoints?: Record<string, Point[]>;
  groups?: StepGroup[];
}): string {
  const html = renderToStaticMarkup(
    <DraftProvider initial={DRAFT} token="token">
      <CanvasView
        layout={layoutWith(opts.approve)}
        onMoveStep={() => {}}
        onMoveSteps={() => {}}
        onArrange={() => {}}
        selectedStepIds={[]}
        onSelectStep={() => {}}
        onSelectSteps={() => {}}
        edgeStyle="step"
        onEdgeStyleChange={() => {}}
        waypoints={opts.waypoints ?? {}}
        dockingPoints={opts.dockingPoints ?? {}}
        onWaypointsChange={() => {}}
        groups={opts.groups ?? []}
        onGroupsChange={() => {}}
      />
    </DraftProvider>,
  );
  const start = html.indexOf('data-path-id="path_a"');
  expect(start).toBeGreaterThan(-1);
  const match = /<path d="([^"]*)"/.exec(html.slice(start));
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

function expectedD(target: Point, ends: { source?: DockingEnd; target?: DockingEnd } = {}, waypoints: Point[] = []): string {
  return routePath(routeThroughWaypoints(REVIEW, target, waypoints, {}, ends).points, "step");
}

const RIGHT_MIDDLE: DockingEnd = { side: "right", at: 0 };
const LEFT_MIDDLE: DockingEnd = { side: "left", at: 0 };

describe("a path with no stored entry", () => {
  it("draws the route it drew before stored points existed", () => {
    expect(dOf({ approve: RIGHT_OF })).toBe(expectedD(RIGHT_OF));
    expect(dOf({ approve: BELOW })).toBe(expectedD(BELOW));
  });

  it("draws the same with an entry for another path", () => {
    const other = { path_other: { source: RIGHT_MIDDLE } };
    expect(dOf({ approve: BELOW, dockingPoints: other })).toBe(expectedD(BELOW));
  });
});

describe("a path end stays on its stored docking point", () => {
  const stored = { path_a: { source: RIGHT_MIDDLE, target: LEFT_MIDDLE } };

  it("leaves and arrives at the stored points at two positions of the target", () => {
    for (const approve of [RIGHT_OF, BELOW]) {
      const d = dOf({ approve, dockingPoints: stored });
      expect(d).toBe(expectedD(approve, stored.path_a));
      expect(d.startsWith(`M${NODE_SIZE.width},${NODE_SIZE.height / 2}`)).toBe(true);
      expect(d.endsWith(`${approve.x},${approve.y + NODE_SIZE.height / 2}`)).toBe(true);
    }
    // The stored points differ from the automatic route below the source.
    expect(dOf({ approve: BELOW, dockingPoints: stored })).not.toBe(expectedD(BELOW));
  });

  it("keeps both ends on their points when a waypoint bends the path above both", () => {
    const waypoint = { x: 120, y: -200 };
    const d = dOf({ approve: RIGHT_OF, dockingPoints: stored, waypoints: { path_a: [waypoint] } });
    expect(d).toBe(expectedD(RIGHT_OF, stored.path_a, [waypoint]));
    expect(d.startsWith(`M${NODE_SIZE.width},${NODE_SIZE.height / 2}`)).toBe(true);
    expect(d.endsWith(`${RIGHT_OF.x},${RIGHT_OF.y + NODE_SIZE.height / 2}`)).toBe(true);
  });
});

describe("a path on a collapsed group's box", () => {
  const members: StepGroup = { id: "group_x", stepIds: ["step_approve", "step_archive"], name: "X" };
  const stored = { path_a: { target: { side: "top" as const, at: 0 } } };

  it("takes the automatic side whatever its hidden member stores", () => {
    const collapsed = [{ ...members, collapsed: true }];
    const box = drawnBox(collapsed[0], { step_approve: RIGHT_OF, step_archive: { x: 480, y: 0 } });
    expect(box).toBeDefined();
    const at = { x: (box as { x: number }).x, y: (box as { y: number }).y };
    const automatic = routePath(routeThroughWaypoints(REVIEW, at, [], { target: NODE_SIZE }).points, "step");
    expect(dOf({ approve: RIGHT_OF, groups: collapsed, dockingPoints: stored })).toBe(automatic);
    expect(dOf({ approve: RIGHT_OF, groups: collapsed })).toBe(automatic);
  });

  it("returns to the stored point when the group expands", () => {
    const expanded = [{ ...members, collapsed: false }];
    const d = dOf({ approve: RIGHT_OF, groups: expanded, dockingPoints: stored });
    expect(d).toBe(expectedD(RIGHT_OF, stored.path_a));
    expect(d.endsWith(`${RIGHT_OF.x + NODE_SIZE.width / 2},${RIGHT_OF.y}`)).toBe(true);
  });
});
