/**
 * Transition executor: take one manual path. onExit(source) -> onPath ->
 * onEntry(target) ordering, transitionSeq as the optimistic-concurrency token,
 * one HistoryEntry appended per committed transition. Action dispatch is
 * deferred to the transactional-outbox change; the ordered visit exists here so
 * that change is a pure addition.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { buildGuardContext, evalGuard, type Actor } from "../cel/eval.js";
import type { ProcessBody, Instance, HistoryEntry, Action, Step, Path } from "../schema/definition.js";

export class GuardRefused extends Error {
  constructor(pathId: string) {
    super(`guard refused path: ${pathId}`);
    this.name = "GuardRefused";
  }
}

export class ConcurrencyConflict extends Error {
  constructor(instanceId: string, seq: number) {
    super(`concurrency conflict: instance ${instanceId} was not at transitionSeq ${seq}`);
    this.name = "ConcurrencyConflict";
  }
}

/** The actions a transition processes, in trigger order. */
export function orderedTriggerActions(source: Step, path: Path, target: Step): Action[] {
  return [...(source.onExit ?? []), ...(path.onPath ?? []), ...(target.onEntry ?? [])];
}

// ponytail: no-op until the transactional-outbox change fills it in.
function dispatch(_action: Action): void {}

/**
 * Execute a single manual transition and commit it atomically. Rejects if the
 * path is not on the current step, is not manual, or its guard is false. A
 * concurrent transition that already advanced the instance makes this one lose
 * (ConcurrencyConflict), leaving no partial write.
 */
export async function executeManualTransition(
  instance: Instance,
  pathId: string,
  body: ProcessBody,
  actor: Actor,
  db: SQL = sql,
): Promise<Instance> {
  const source = body.workflow.steps.find((s) => s.id === instance.currentStepId);
  if (!source) throw new Error(`current step not in body: ${instance.currentStepId}`);
  const path = (source.paths ?? []).find((p) => p.id === pathId);
  if (!path) throw new Error(`path not on current step: ${pathId}`);
  if (path.trigger !== "manual") throw new Error(`not a manual path: ${pathId}`);

  if (!evalGuard(path.guard, buildGuardContext(body, instance, actor))) throw new GuardRefused(pathId);

  const target = body.workflow.steps.find((s) => s.id === path.to);
  if (!target) throw new Error(`path target not in body: ${path.to}`);

  for (const a of orderedTriggerActions(source, path, target)) dispatch(a);

  const nextSeq = instance.transitionSeq + 1;
  const next: Instance = {
    ...instance,
    currentStepId: path.to,
    transitionSeq: nextSeq,
    status: target.terminal ? "completed" : instance.status,
  };
  const entry: HistoryEntry = {
    id: `hist_${crypto.randomUUID()}` as HistoryEntry["id"],
    instanceId: instance.instanceId,
    transitionSeq: nextSeq,
    version: instance.version,
    pathId: path.id,
    fromStepId: instance.currentStepId,
    toStepId: path.to,
    cause: "user",
    actorId: actor.id,
    at: new Date().toISOString(),
  };

  await db.begin(async (tx) => {
    const updated = (await tx`UPDATE instances
      SET body = ${JSON.stringify(next)}::jsonb, transition_seq = ${nextSeq}
      WHERE instance_id = ${instance.instanceId} AND transition_seq = ${instance.transitionSeq}
      RETURNING instance_id`) as unknown[];
    if (updated.length === 0) throw new ConcurrencyConflict(instance.instanceId, instance.transitionSeq);
    await tx`INSERT INTO history_entries (id, instance_id, transition_seq, entry)
      VALUES (${entry.id}, ${entry.instanceId}, ${entry.transitionSeq}, ${JSON.stringify(entry)}::jsonb)`;
  });

  return next;
}
