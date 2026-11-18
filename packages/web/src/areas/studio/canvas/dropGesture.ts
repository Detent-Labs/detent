import type { PathTrigger } from "workflow-engine/schema";
import { checkConnection, type ConnectionCandidate } from "./connection";
import { hitTestNode, type NodePosition, type Point } from "./geometry";

/** Why a step cannot take a new way out. `end` is a terminal source; `trigger`
 * carries the engine's trigger-consistency reason. Neither is display text:
 * `refusalSentence` turns one into the author's words. */
export type ConnectRefusal = { refusal: "end"; reason?: undefined } | { refusal: "trigger"; reason: string };

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

  const targetStepId = hitTestNode(point, nodes);
  if (targetStepId) return { kind: "connect-to-step", targetStepId, trigger: candidateTrigger };
  return { kind: "create-step-and-connect", point, trigger: candidateTrigger };
}
