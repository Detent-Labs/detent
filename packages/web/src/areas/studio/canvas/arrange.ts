import dagre from "@dagrejs/dagre";
import { autoPlaceSteps, COLUMN_WIDTH, ROW_HEIGHT, type LayoutStep } from "./layout";
import { NODE_SIZE, type Point } from "./geometry";
import { drawnBox, groupOf, type Box, type StepGroup } from "./groups";

/** Every step's stored or rendered position, the same fallback
 * `CanvasView.tsx`'s own `positionOf` applies: an explicit `layout[stepId]`
 * where one is a real point, else `autoPlaceSteps`'s computed default. Group
 * sizing needs every member resolved to a real point, which `existingLayout`
 * alone cannot promise (design.md, Decision 3). */
function resolvePositions(
  steps: LayoutStep[],
  initialStepId: string | undefined,
  existingLayout: Record<string, unknown>,
): Record<string, Point> {
  const autoPlaced = autoPlaceSteps(steps, initialStepId, existingLayout);
  const resolved: Record<string, Point> = { ...autoPlaced };
  for (const s of steps) {
    if (!s.id) continue;
    const recorded = existingLayout[s.id];
    if (recorded && typeof (recorded as Point).x === "number" && typeof (recorded as Point).y === "number") {
      resolved[s.id] = recorded as Point;
    }
  }
  return resolved;
}

/** A dagre-returned point is a node's CENTER; this codebase's own `Point`
 * convention is top-left throughout (design.md, Context). */
function centerToTopLeft(center: Point, size: { width: number; height: number }): Point {
  return { x: center.x - size.width / 2, y: center.y - size.height / 2 };
}

/** The rank/lane gap for `dagre`'s own layout, derived from the existing
 * column and row pitch rather than a new constant: both are already the gap
 * `autoPlaceSteps`'s own pitch leaves around a node, and both are already
 * whole multiples of `GRID_STEP`. */
const RANK_SEP = COLUMN_WIDTH - NODE_SIZE.width;
const NODE_SEP = ROW_HEIGHT - NODE_SIZE.height;

/** Distinguishes a group's synthetic node id from a real step id. Every step
 * id carries a `step_` prefix, so this can never collide with one. */
const groupNodeId = (groupId: string): string => `g:${groupId}`;

/**
 * Computes a position for every step in `steps` at once, from the
 * workflow's own paths, through `dagre`'s layered algorithm. Unlike
 * `autoPlaceSteps`, this fills every step, not only one absent from
 * `existingLayout` (design.md, Decision 7).
 *
 * A group, collapsed or expanded, arranges as one rigid unit: it is fed to
 * `dagre` as a single synthetic node, sized by its current box, and every
 * member then moves by the same delta as the group's own box
 * (design.md, Decision 3).
 */
export function arrangeSteps(
  steps: LayoutStep[],
  groups: StepGroup[],
  initialStepId: string | undefined,
  existingLayout: Record<string, unknown>,
): Record<string, Point> {
  const resolved = resolvePositions(steps, initialStepId, existingLayout);
  const withId = steps.filter((s): s is LayoutStep & { id: string } => !!s.id);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: RANK_SEP, nodesep: NODE_SEP });
  g.setDefaultEdgeLabel(() => ({}));

  // A group with fewer than two present members draws nothing (groups.ts's
  // own rule), so its members arrange as ordinary, ungrouped steps.
  const groupBoxes = new Map<string, Box>();
  for (const group of groups) {
    const box = drawnBox(group, resolved);
    if (box) groupBoxes.set(group.id, box);
  }

  // Every step id's node key: its own id, or its group's synthetic id.
  const nodeKeyOf = new Map<string, string>();
  for (const s of withId) {
    const group = groupOf(s.id, groups);
    const box = group ? groupBoxes.get(group.id) : undefined;
    nodeKeyOf.set(s.id, box ? groupNodeId(group!.id) : s.id);
  }

  for (const s of withId) {
    const group = groupOf(s.id, groups);
    const box = group ? groupBoxes.get(group.id) : undefined;
    if (box) {
      if (!g.hasNode(groupNodeId(group!.id))) g.setNode(groupNodeId(group!.id), { width: box.width, height: box.height });
    } else {
      g.setNode(s.id, { width: NODE_SIZE.width, height: NODE_SIZE.height });
    }
  }

  for (const s of withId) {
    const from = nodeKeyOf.get(s.id);
    if (!from) continue;
    for (const path of s.paths ?? []) {
      const to = path.to ? nodeKeyOf.get(path.to) : undefined;
      if (!to || to === from) continue;
      g.setEdge(from, to);
    }
  }

  dagre.layout(g);

  const result: Record<string, Point> = {};

  for (const [groupId, box] of groupBoxes) {
    const node = g.node(groupNodeId(groupId));
    const newTopLeft = centerToTopLeft({ x: node.x, y: node.y }, box);
    const delta = { x: newTopLeft.x - box.x, y: newTopLeft.y - box.y };
    const group = groups.find((gr) => gr.id === groupId);
    for (const memberId of group?.stepIds ?? []) {
      const member = resolved[memberId];
      if (member) result[memberId] = { x: member.x + delta.x, y: member.y + delta.y };
    }
  }

  for (const s of withId) {
    if (result[s.id]) continue; // already placed as a group member
    const node = g.node(s.id);
    result[s.id] = centerToTopLeft({ x: node.x, y: node.y }, NODE_SIZE);
  }

  return result;
}

/**
 * Whether a draft holds anything an arrange could discard: an explicit
 * author action, and only that, writes either kind. A step still on the
 * auto-placed default carries no `layout[stepId]` entry, and a waypoint
 * reaches `layout.waypoints` on its own, with no step ever hand-placed
 * first (design.md, Decision 5).
 */
export function hasHandPlacedStep(steps: LayoutStep[], layout: Record<string, unknown>): boolean {
  const hasPlacedStep = steps.some((s) => s.id && layout[s.id] !== undefined);
  if (hasPlacedStep) return true;
  const waypoints = layout.waypoints;
  return !!waypoints && typeof waypoints === "object" && Object.keys(waypoints).length > 0;
}
