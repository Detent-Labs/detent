import type { PathTrigger } from "workflow-engine/schema";
import { checkConnection, type ConnectionCandidate } from "./connection";
import { hitTestNode, type NodePosition, type Point } from "./geometry";

export type DropGestureResult =
  | { kind: "connect-to-step"; targetStepId: string; trigger: PathTrigger }
  | { kind: "create-step-and-connect"; point: Point; trigger: PathTrigger }
  | { kind: "rejected"; reason: string };

/**
 * What a connect-handle release resolves to (studio-canvas: "Dragging to a
 * step creates a path; dragging to empty canvas creates a step and a
 * path"). Reuses `hitTestNode` (no new threshold, design.md) and
 * `checkConnection` (the same trigger-consistency check either branch
 * runs), so the two gestures can never diverge in what they allow.
 *
 * A terminal source is rejected before either check runs: it's invalid no
 * matter where the drop lands (design.md).
 *
 * The trigger check runs before the hit test decides which branch applies:
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
  if (sourceTerminal) return { kind: "rejected", reason: "a terminal step has no outgoing paths" };

  const check = checkConnection(existingPaths, candidateTrigger);
  if (!check.ok) return { kind: "rejected", reason: check.reason ?? "invalid connection" };

  const targetStepId = hitTestNode(point, nodes);
  if (targetStepId) return { kind: "connect-to-step", targetStepId, trigger: candidateTrigger };
  return { kind: "create-step-and-connect", point, trigger: candidateTrigger };
}
