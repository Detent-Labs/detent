import type { PathTrigger } from "workflow-engine/schema";
import type { PathDockingEnds } from "./layout";
import { checkConnection, type ConnectionCandidate } from "./connection";
import {
  dockingPointsOf,
  hitTestNode,
  inPressTarget,
  nearestDockingPoint,
  NODE_HEIGHT,
  NODE_WIDTH,
  PRESS_REACH_OUT,
  type DockingEnd,
  type DockingPoint,
  type NodePosition,
  type Point,
} from "./geometry";

/** Why a step cannot take a new way out. `end` is a terminal source; `trigger`
 * carries the engine's trigger-consistency reason. Neither is display text:
 * `refusalSentence` turns one into the author's words. */
export type ConnectRefusal = { refusal: "end"; reason?: undefined } | { refusal: "trigger"; reason: string };

/** Whether a point lies in a node's box grown by a press target's outward reach. */
function inGrownBox(point: Point, n: NodePosition): boolean {
  return (
    point.x >= n.x - PRESS_REACH_OUT &&
    point.x <= n.x + NODE_WIDTH + PRESS_REACH_OUT &&
    point.y >= n.y - PRESS_REACH_OUT &&
    point.y <= n.y + NODE_HEIGHT + PRESS_REACH_OUT
  );
}

/**
 * The step a connect release or the snap ring reads. A box grown by the press
 * target's outward reach counts, so a release on the outer half of a ringed
 * point still lands on its step. A point inside a node's own box takes that
 * node, and where only grown boxes overlap the later node wins, as `hitTestNode`
 * orders its own overlaps.
 */
export function hitTestGrownNode(point: Point, nodes: NodePosition[]): string | undefined {
  const inside = hitTestNode(point, nodes);
  if (inside) return inside;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (inGrownBox(point, n)) return n.id;
  }
  return undefined;
}

/**
 * The step and docking point a position drops on: the step `hitTestGrownNode`
 * reads and its nearest point. On the pressed step's own box the pressed point
 * is skipped, since two identical anchors have no route. `undefined` over empty
 * canvas. The snap ring and the connect release both read it.
 */
export function dropTargetOf(
  position: Point,
  nodes: NodePosition[],
  sourceStepId: string,
  pressed: DockingEnd,
): { stepId: string; point: DockingPoint } | undefined {
  const stepId = hitTestGrownNode(position, nodes);
  const node = stepId !== undefined ? nodes.find((n) => n.id === stepId) : undefined;
  if (stepId === undefined || !node) return undefined;
  return { stepId, point: nearestDockingPoint(node, position, { exclude: stepId === sourceStepId ? pressed : undefined }) };
}

/**
 * The docking point a press at `press` lands on: among the points whose press
 * target holds it, the nearest. `undefined` where no target holds it.
 */
export function pressedDockingPoint(node: Point, press: Point): DockingPoint | undefined {
  let best: DockingPoint | undefined;
  let bestDistance = Infinity;
  for (const p of dockingPointsOf(node)) {
    if (!inPressTarget(p, press)) continue;
    const d = Math.hypot(p.point.x - press.x, p.point.y - press.y);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

export type DropGestureResult =
  | { kind: "connect-to-step"; targetStepId: string; trigger: PathTrigger }
  | { kind: "create-step-and-connect"; point: Point; trigger: PathTrigger }
  | ({ kind: "rejected" } & ConnectRefusal);

/**
 * Whether a step can take a new way out of `trigger`, wherever it would lead.
 * A terminal source is refused first: it's invalid whatever its paths say.
 * Otherwise `checkConnection` answers. The connect drop and the `C` key both
 * call it, so the two refuse the same sources.
 */
export function checkConnectSource(
  sourceTerminal: boolean,
  existingPaths: ConnectionCandidate[],
  trigger: PathTrigger,
): ConnectRefusal | undefined {
  if (sourceTerminal) return { refusal: "end" };
  const check = checkConnection(existingPaths, trigger);
  if (check.ok) return undefined;
  return { refusal: "trigger", reason: check.reason ?? "" };
}

/**
 * What a connect-handle release resolves to (studio-canvas: "Dragging to a
 * step creates a path; dragging to empty canvas creates a step and a
 * path"). Reuses `hitTestNode` (no new threshold, design.md) and
 * `checkConnectSource` (the same check either branch runs, and the `C` key's),
 * so the gestures can never diverge in what they allow.
 *
 * The source check runs before the hit test decides which branch applies:
 * a rejected candidate creates neither a step nor a path, whichever branch
 * it would otherwise have taken.
 */
export function resolveDropGesture(
  point: Point,
  nodes: NodePosition[],
  existingPaths: ConnectionCandidate[],
  candidateTrigger: PathTrigger,
  sourceTerminal: boolean = false,
): DropGestureResult {
  const refused = checkConnectSource(sourceTerminal, existingPaths, candidateTrigger);
  if (refused) return { kind: "rejected", ...refused };

  const targetStepId = hitTestGrownNode(point, nodes);
  if (targetStepId) return { kind: "connect-to-step", targetStepId, trigger: candidateTrigger };
  return { kind: "create-step-and-connect", point, trigger: candidateTrigger };
}

/** What a connect release stores: the pressed point as the source end, and the
 * nearest point of the step under the release as the target end. A release
 * over empty canvas stores the source end alone. */
export type ConnectDropResult =
  | { kind: "connect-to-step"; targetStepId: string; trigger: PathTrigger; source: DockingEnd; target: DockingEnd }
  | { kind: "create-step-and-connect"; point: Point; trigger: PathTrigger; source: DockingEnd }
  | ({ kind: "rejected" } & ConnectRefusal);

/**
 * `resolveDropGesture` plus the docking points the release stores. A release
 * on the source step takes the nearest point other than the pressed one, since
 * two identical anchors have no route.
 */
export function resolveConnectDrop(input: {
  point: Point;
  nodes: NodePosition[];
  sourceStepId: string;
  pressed: DockingEnd;
  existingPaths: ConnectionCandidate[];
  trigger: PathTrigger;
  sourceTerminal: boolean;
}): ConnectDropResult {
  const { point, nodes, sourceStepId, pressed } = input;
  const result = resolveDropGesture(point, nodes, input.existingPaths, input.trigger, input.sourceTerminal);
  if (result.kind === "rejected") return result;
  if (result.kind === "create-step-and-connect") return { ...result, source: pressed };
  const drop = dropTargetOf(point, nodes, sourceStepId, pressed);
  // Unreachable for non-overlapping boxes: the grown-box hit that made this a step drop also finds it here.
  if (!drop) return { kind: "create-step-and-connect", point, trigger: result.trigger, source: pressed };
  return { ...result, source: pressed, target: { side: drop.point.side, at: drop.point.at } };
}

/**
 * Where an end handle's release hangs its end: the nearest docking point of the
 * end's own step, or `undefined` for a release that changes nothing. A release
 * counts on the step's box or the box grown by a press target's outward reach.
 * A release inside another step's box counts for nothing, even where that box
 * overlaps the grown one. `exclude` skips one point, for the other end of a path
 * that starts and ends on one step.
 */
export function resolveEndDrop(input: {
  stepId: string;
  nodes: NodePosition[];
  point: Point;
  exclude?: DockingEnd;
}): DockingEnd | undefined {
  const { stepId, nodes, point, exclude } = input;
  const own = nodes.find((n) => n.id === stepId);
  if (!own) return undefined;
  const inside = hitTestNode(point, nodes);
  if (inside !== undefined && inside !== stepId) return undefined;
  if (!inGrownBox(point, own)) return undefined;
  const { side, at } = nearestDockingPoint(own, point, { exclude });
  return { side, at };
}

/**
 * The layout entry a re-hang writes, or `undefined` where nothing changes. The
 * dragged end takes `next`. A release on the point the end already stores
 * changes nothing, while an unstored end stores its release even on its own
 * automatic point. The other end keeps what it stores, or its absence. On a path
 * that starts and ends on one step, `otherHeld` is the point the other end
 * draws on: an unstored other end stores it, since an end with one stored
 * neighbour on its own step no longer turns away on its own.
 */
export function endDropEntry(
  entry: PathDockingEnds | undefined,
  end: "source" | "target",
  next: DockingEnd | undefined,
  otherHeld?: DockingEnd,
): PathDockingEnds | undefined {
  if (!next) return undefined;
  const stored = entry?.[end];
  if (stored && stored.side === next.side && stored.at === next.at) return undefined;
  const other = end === "source" ? "target" : "source";
  const written: PathDockingEnds = { ...entry, [end]: next };
  if (otherHeld && !entry?.[other]) written[other] = otherHeld;
  return written;
}
