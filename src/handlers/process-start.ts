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

import { z } from "zod";
import { SYSTEM_ACTOR } from "../cel/eval.js";
import { loadInstance } from "../engine/store.js";
import { resolveAutomatic } from "../engine/transition.js";
import { createDefinitionStore } from "../engine/definitions.js";
import { createSeededInstance } from "../engine/seeded-create.js";
import {
  fieldId,
  expression,
  processId as processIdSchema,
  type Instance,
  type ProcessBody,
} from "../schema/definition.js";
import {
  createDefaultAssignmentRegistry,
  PROCESS_START_ACTION_TYPE,
  type HandlerContext,
  type HandlerDef,
} from "../engine/registry.js";

export { PROCESS_START_ACTION_TYPE };

export const processStartConfigSchema = z.object({
  processId: processIdSchema,
  inputMapping: z.record(fieldId, expression),
});

async function processStartHandler(ctx: HandlerContext): Promise<unknown> {
  const config = processStartConfigSchema.parse(ctx.config);
  const startedId = `inst_${ctx.idempotencyKey}`;
  const { resolveBody, resolveLatest } = createDefinitionStore(ctx.db);
  // One registry per delivery, shared by createSeededInstance and the
  // drive-to-rest below — the earlier second construction duplicated an
  // identical Map for no reason.
  const assignmentRegistry = createDefaultAssignmentRegistry();

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

    // Seed, resolve the initial step's assignment and create: the shared
    // seam with makeSpawnHandler. See seeded-create.ts.
    started = await createSeededInstance(ctx.db, {
      instanceId: startedId,
      processId: config.processId,
      version: target.version,
      body: startedBody,
      source: { instance: acting, body: actingBody },
      mapping: config.inputMapping,
      link: { chainedFrom: acting.instanceId },
      assignmentRegistry,
    });
  }

  // Run the started instance to rest — it may immediately reach a terminal
  // step. Unconditional, on both branches above: a redelivery that finds the
  // instance already created still reaches this, completing a drive-to-rest a
  // prior delivery started but crashed before finishing.
  await resolveAutomatic(started, startedBody, SYSTEM_ACTOR, ctx.db, assignmentRegistry);
  return {};
}

export const processStartHandlerDef: HandlerDef = {
  handler: processStartHandler,
  configSchema: processStartConfigSchema,
};
