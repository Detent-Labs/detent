/**
 * The claim controls a task screen offers, derived from the loaded view and
 * the authenticated actor. Pure — no request, no React — so the five states
 * are testable without a renderer, like `inboxLogic.ts` beside it.
 *
 * Presentation only. `claimStep` and `submitAndTransition` remain the
 * enforcement point: the HTTP API is reachable without this screen, so a
 * wrong answer here shows a wrong control, never grants a wrong action.
 */
import type { InstanceView } from "../api/types.js";

type Assignment = InstanceView["assignment"];

export type ClaimControls =
  /** The step declares no assignment. Nothing to claim, so no control at all. */
  | { state: "none" }
  | { state: "claimable" }
  | { state: "blocked-not-candidate" }
  | { state: "blocked-claimed-by-other" }
  | { state: "mine" };

/**
 * Mirrors the engine's `isEligibleCandidate` (`src/engine/transition.ts`):
 * a candidate list holds either an actor id or a role name, and either may
 * match. Repeated rather than imported because the engine package's
 * `exports` map does not publish `src/engine/transition.ts`, and widening it
 * for a presentation hint would enlarge the engine's published surface.
 */
export function isEligibleCandidate(actorId: string, actorRoles: readonly string[], candidates: readonly string[]): boolean {
  return candidates.includes(actorId) || actorRoles.some((r) => candidates.includes(r));
}

export function resolveClaimControls(
  status: InstanceView["status"],
  assignment: Assignment,
  actorId: string,
  actorRoles: readonly string[],
): ClaimControls {
  // Claim, release and delegate all refuse a non-running instance
  // (InstanceNotRunningError). Nothing forbids an assignment on a terminal
  // step, so a completed instance can still carry a claim — offering a
  // control for it would guarantee a failing request.
  if (status !== "running") return { state: "none" };
  if (!assignment) return { state: "none" };
  if (assignment.claimedBy === actorId) return { state: "mine" };
  if (assignment.claimedBy != null) return { state: "blocked-claimed-by-other" };
  if (!isEligibleCandidate(actorId, actorRoles, assignment.candidates)) return { state: "blocked-not-candidate" };
  return { state: "claimable" };
}

/**
 * Whether the path-submit buttons belong on screen. `mine` is the ordinary
 * claim gate. `none` is the exception: a step with no assignment has no claim
 * to gate on, and `submitAndTransition` takes the submission from the
 * instance starter or a holder of `system:admin`. Gating those buttons on a
 * claim there leaves the task unfinishable through the screen.
 */
export function maySubmit(controls: ClaimControls): boolean {
  return controls.state === "mine" || controls.state === "none";
}
