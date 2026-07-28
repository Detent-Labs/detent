import { checkPathTriggerConsistency } from "workflow-engine/schema";
import type { PathTrigger } from "workflow-engine/schema";

export interface ConnectionCheck {
  ok: boolean;
  reason?: string;
}

/** A Draft path's `trigger` is optional (DraftOf widens every field), unlike
 * the engine schema's `Path` where it's required — this module reads
 * Draft-shaped paths, so it accepts that looser shape directly. */
export interface ConnectionCandidate {
  trigger?: PathTrigger;
  guard?: unknown;
  priority?: number;
}

/**
 * Inline pre-check for a drag-to-connect drop, before a path is created:
 * would appending a path of `candidateTrigger` to `existingPaths` violate
 * the all-manual-or-all-automatic / unique-priority rule? Wraps the same
 * `checkPathTriggerConsistency` the engine's publish-time refinement calls —
 * one rule, two call sites (design.md). A candidate existing path with no
 * trigger yet (a draft mid-edit) is excluded from the check rather than
 * treated as a violation — it isn't a real path until it has one.
 */
export function checkConnection(existingPaths: ConnectionCandidate[], candidateTrigger: PathTrigger): ConnectionCheck {
  const withTrigger = existingPaths.filter((p): p is ConnectionCandidate & { trigger: PathTrigger } => p.trigger !== undefined);
  const result = checkPathTriggerConsistency([...withTrigger, { trigger: candidateTrigger }]);
  return result.ok ? { ok: true } : { ok: false, reason: result.reasons[0] };
}
