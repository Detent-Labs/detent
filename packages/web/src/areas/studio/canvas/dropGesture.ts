import type { PathTrigger } from "workflow-engine/schema";
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
    if (
      point.x >= n.x - PRESS_REACH_OUT &&
      point.x <= n.x + NODE_WIDTH + PRESS_REACH_OUT &&
      point.y >= n.y - PRESS_REACH_OUT &&
      point.y <= n.y + NODE_HEIGHT + PRESS_REACH_OUT
    ) {
      return n.id;
    }
  }
  return undefined;
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
  const node = nodes.find((n) => n.id === result.targetStepId);
  if (!node) return { kind: "create-step-and-connect", point, trigger: result.trigger, source: pressed };
  const { side, at } = nearestDockingPoint(node, point, { exclude: result.targetStepId === sourceStepId ? pressed : undefined });
  return { ...result, source: pressed, target: { side, at } };
}
