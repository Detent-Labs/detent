/**
 * `process.start` action handler: starts an independent instance of another
 * process, seeded from the acting instance's data. Unlike
 * `core.spawnSubprocess`, this is an ordinary, author-visible action — it
 * reads `ctx.db` per delivery (no closed-over database handle, per
 * `action-handlers`' own rule) and registers in the shared, stateless
 * registry alongside `http.request` and `notification.email`.
 *
 * The started instance carries no `parent` link and no return path: it is
 * fire-and-forget, not call-and-return. It records `chainedFrom` instead, a
 * reporting-only backlink nothing else reads.
 */

import type { SQL } from "bun";
import { z } from "zod";
import { createInstance, withTransaction, appendInstanceEvent, newInstanceEventId, makeAssignmentUnresolvedEvent } from "../engine/store.js";
import { resolveAutomatic } from "../engine/transition.js";
import { buildGuardContext, evalFieldMap, SYSTEM_ACTOR } from "../cel/eval.js";
import { createDefinitionStore } from "../engine/definitions.js";
import {
  instance as instanceSchema,
  fieldId,
  expression,
  processId as processIdSchema,
  type Instance,
  type InstanceEvent,
  type ProcessBody,
} from "../schema/definition.js";
import {
  createDefaultAssignmentRegistry,
  resolveStepAssignment,
  PROCESS_START_ACTION_TYPE,
  type HandlerContext,
  type HandlerDef,
} from "../engine/registry.js";

export { PROCESS_START_ACTION_TYPE };

export const processStartConfigSchema = z.object({
  processId: processIdSchema,
  inputMapping: z.record(fieldId, expression),
});

const parseInstance = (raw: unknown): Instance =>
  instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);

async function loadInstance(db: SQL, instanceId: string): Promise<Instance | undefined> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId} LIMIT 1`) as { body: unknown }[];
  return rows.length > 0 ? parseInstance(rows[0].body) : undefined;
}

async function processStartHandler(ctx: HandlerContext): Promise<unknown> {
  const config = processStartConfigSchema.parse(ctx.config);
  const startedId = `inst_${ctx.idempotencyKey}`;
  const { resolveBody, resolveLatest } = createDefinitionStore(ctx.db);

  let started: Instance;
  let startedBody: ProcessBody;

  // Redelivery check, mirroring makeSpawnHandler's own already-exists branch:
  // a second delivery must resolve the PINNED body this instance already
  // runs, never a fresh `resolveLatest` — a version published after the
  // first delivery must not retroactively change what it runs.
  const existing = await loadInstance(ctx.db, startedId);
  if (existing) {
    started = existing;
    const resolved = await resolveBody(existing.processId, existing.version);
    if (!resolved) {
      throw new Error(`process.start: started instance body unresolved: ${existing.processId}@${existing.version}`);
    }
    startedBody = resolved;
  } else {
    const target = await resolveLatest(config.processId);
    if (!target) throw new Error(`process.start: target unresolved: ${config.processId}`);
    startedBody = target.body;

    const acting = await loadInstance(ctx.db, ctx.instanceId);
    if (!acting) throw new Error(`process.start: acting instance unresolved: ${ctx.instanceId}`);
    const actingBody = await resolveBody(acting.processId, acting.version);
    if (!actingBody) {
      throw new Error(`process.start: acting instance body unresolved: ${acting.processId}@${acting.version}`);
    }

    // Seed the started instance from inputMapping (acting instance's context).
    // Total per entry, matching the subprocess inputMapping rule: a raising
    // entry is omitted, not fatal, and recorded on the ACTING instance, since
    // that instance's context is what the mapping evaluated.
    const { patch: seedData, drops } = evalFieldMap(config.inputMapping, buildGuardContext(actingBody, acting, SYSTEM_ACTOR));
    const droppedAt = new Date().toISOString();
    const dropEvents: InstanceEvent[] = drops.map((d) => ({
      id: newInstanceEventId(),
      instanceId: acting.instanceId,
      transitionSeq: acting.transitionSeq,
      version: acting.version,
      kind: "mapping.entry-dropped",
      payload: { fieldId: d.fieldId, direction: "input", reason: d.reason },
      at: droppedAt,
    }));

    // Creation is a step entry, so an assignment-bearing initial step carries
    // candidates. Resolved here, before the transaction below opens, the same
    // placement makeSpawnHandler uses and for the same reason: a resolver
    // must not run while a connection and a row lock are held.
    const assignmentRegistry = createDefaultAssignmentRegistry();
    const targetInitial = startedBody.workflow.steps.find((s) => s.id === startedBody.workflow.initialStep);
    const resolvedAssignment = targetInitial
      ? await resolveStepAssignment(
          targetInitial,
          assignmentRegistry,
          { id: startedId, startedBy: undefined, data: seedData as Instance["data"] },
          ctx.db,
        )
      : undefined;
    const startedEvents: InstanceEvent[] =
      resolvedAssignment?.unresolved && targetInitial
        ? [
            makeAssignmentUnresolvedEvent({
              instanceId: startedId as Instance["instanceId"],
              transitionSeq: 0,
              version: target.version,
              stepId: targetInitial.id,
              reason: resolvedAssignment.unresolved,
              at: droppedAt,
            }),
          ]
        : [];

    // The acting instance's drop events land in the same transaction as the
    // started instance's creation: withTransaction nests as a savepoint
    // inside createInstance's own transaction when `db` is already one, so
    // both commit or roll back together.
    started = await withTransaction(ctx.db, async (tx) => {
      const created = await createInstance(
        startedBody,
        {
          processId: config.processId,
          version: target.version,
          instanceId: startedId,
          data: seedData as Instance["data"],
          chainedFrom: acting.instanceId,
          assignment: resolvedAssignment?.assignment,
          events: startedEvents,
        },
        tx,
      );
      for (const event of dropEvents) await appendInstanceEvent(tx, event);
      return created;
    });
  }

  // Run the started instance to rest — it may immediately reach a terminal
  // step. Unconditional, on both branches above: a redelivery that finds the
  // instance already created still reaches this, completing a drive-to-rest a
  // prior delivery started but crashed before finishing.
  await resolveAutomatic(started, startedBody, SYSTEM_ACTOR, ctx.db, createDefaultAssignmentRegistry());
  return {};
}

export const processStartHandlerDef: HandlerDef = {
  handler: processStartHandler,
  configSchema: processStartConfigSchema,
};
