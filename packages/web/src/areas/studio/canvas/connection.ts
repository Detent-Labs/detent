import { checkPathTriggerConsistency } from "workflow-engine/schema";
import type { PathTrigger } from "workflow-engine/schema";
import { t } from "../catalog.js";
import { literalSentenceFor } from "../draft/checkSentence";
import type { DraftStep } from "../draft/createStep";
import type { Draft } from "../draft/types";
import type { ConnectRefusal } from "./dropGesture";

/** The one trigger reason whose checks rail sentence misfits a refusal: the
 * step it refuses is valid, so the canvas names what to do instead. */
const NO_ORDER = "automatic paths need a priority when a step has two or more";

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

/**
 * The author's words for a connect refusal, the drop's and the `C` key's alike.
 * An end reads the connect handle's own sentence. A missing order reads
 * `canvas.connectNeedsOrder`; every other reason the checks rail knows reads
 * the checks rail's sentence for `step`; anything else reads
 * `canvas.connectRefused`. `step` is a step of `body`; the sentence reads it by id.
 */
export function refusalSentence(refusal: ConnectRefusal, body: Draft, step: DraftStep): string {
  if (refusal.refusal === "end") return t("canvas.connectHandleEnd");
  const key = refusal.reason === NO_ORDER ? "canvas.connectNeedsOrder" : undefined;
  return literalSentenceFor(body, step, refusal.reason, key) ?? t("canvas.connectRefused");
}
