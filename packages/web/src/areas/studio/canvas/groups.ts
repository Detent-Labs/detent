import { NODE_SIZE, type Point, type Size } from "./geometry";

/**
 * A group of steps on the canvas. Presentation only: it lives in the draft's
 * opaque `layout` blob beside node positions, never in `ProcessBody`, so it
 * reaches neither `definitionHash` nor the engine.
 *
 * These rules live here rather than inside `CanvasView` for the reason
 * `selection.ts` and `geometry.ts` already do: the capability requires the
 * canvas's computations to be pure and testable without a DOM.
 */
export interface StepGroup {
  id: string;
  stepIds: string[];
  name: string;
  collapsed?: boolean;
}

export interface Box extends Point, Size {}

/** How far a group's box stands clear of its outermost members. */
export const GROUP_MARGIN = 20;

/**
 * The box around a group's members, plus a margin. A group with fewer than two
 * members present draws nothing: one step in a box is a box that says nothing,
 * and a step delete can leave a group at one.
 */
export function groupBox(group: StepGroup, positions: Record<string, Point>): Box | undefined {
  const members = group.stepIds.map((id) => positions[id]).filter((p): p is Point => !!p);
  if (members.length < 2) return undefined;
  const x = Math.min(...members.map((p) => p.x)) - GROUP_MARGIN;
  const y = Math.min(...members.map((p) => p.y)) - GROUP_MARGIN;
  return {
    x,
    y,
    width: Math.max(...members.map((p) => p.x)) + NODE_SIZE.width + GROUP_MARGIN - x,
    height: Math.max(...members.map((p) => p.y)) + NODE_SIZE.height + GROUP_MARGIN - y,
  };
}

/**
 * The box a group actually draws. A collapsed group draws at the node size, at
 * the corner its expanded box had, so it reads as one step in the row of steps.
 */
export function drawnBox(group: StepGroup, positions: Record<string, Point>): Box | undefined {
  const box = groupBox(group, positions);
  if (!box) return undefined;
  return group.collapsed ? { x: box.x, y: box.y, ...NODE_SIZE } : box;
}

/** Every step a collapsed group hides. A group that draws nothing hides nothing. */
export function hiddenStepIds(groups: StepGroup[], positions: Record<string, Point>): Set<string> {
  const hidden = new Set<string>();
  for (const group of groups) {
    if (!group.collapsed || !groupBox(group, positions)) continue;
    for (const id of group.stepIds) hidden.add(id);
  }
  return hidden;
}

/**
 * The box a path anchors on for one step: the collapsed group's own box when
 * the step sits inside one, and otherwise the step's node. A path into a
 * collapsed group therefore draws to the box rather than to a hidden member.
 */
export function anchorBoxFor(stepId: string, groups: StepGroup[], positions: Record<string, Point>): Box | undefined {
  for (const group of groups) {
    if (!group.collapsed || !group.stepIds.includes(stepId)) continue;
    const box = drawnBox(group, positions);
    if (box) return box;
  }
  const position = positions[stepId];
  return position ? { x: position.x, y: position.y, ...NODE_SIZE } : undefined;
}

/** The group holding a step, if one does. A step belongs to at most one. */
export function groupOf(stepId: string, groups: StepGroup[]): StepGroup | undefined {
  return groups.find((g) => g.stepIds.includes(stepId));
}

/**
 * Whether a selection may become a group. A step belongs to at most one group,
 * so a set holding a step any group already holds is refused. Fewer than two
 * steps is not a group either.
 */
export function canGroup(stepIds: string[], groups: StepGroup[]): boolean {
  return stepIds.length > 1 && stepIds.every((id) => groupOf(id, groups) === undefined);
}

/** The group whose members are exactly this selection, if one is. */
export function groupMatching(stepIds: string[], groups: StepGroup[]): StepGroup | undefined {
  const wanted = [...stepIds].sort().join(" ");
  return groups.find((g) => [...g.stepIds].sort().join(" ") === wanted);
}
