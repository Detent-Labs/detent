/**
 * Handler registry: an in-process `type -> HandlerDef` map, threaded through the
 * outbox worker (injected like `db`), not a global. `deliver` resolves a handler
 * by the outbox row's `action.type`; an unregistered type dead-letters.
 */

import type { z } from "zod";
import type { Action } from "../schema/definition.js";

/** What a handler is invoked with. It MUST dedupe external effects on `idempotencyKey` (delivery is at-least-once). */
export interface HandlerContext {
  action: Action;
  config: Record<string, unknown>;
  idempotencyKey: string;
  instanceId: string;
}

/** A registered handler plus its plugin JSON Schemas (config in, result out). */
export interface HandlerDef {
  handler: (ctx: HandlerContext) => Promise<unknown>;
  configSchema?: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
}

/**
 * Engine-owned action types (reserved `core.` prefix, rejected in authored
 * bodies). Enqueued by the step-entry paths (planStepEntry on a transition,
 * createInstance at a subprocess initial step) and handled by the internal
 * handlers registered in subprocess.ts. Homed in this leaf module — it imports
 * only zod types and the schema — so store.ts and transition.ts can both name
 * them without an import cycle; transition.ts re-exports them.
 */
export const SPAWN_ACTION_TYPE = "core.spawnSubprocess";
export const RETURN_ACTION_TYPE = "core.returnSubprocess";

export type Registry = Map<string, HandlerDef>;

export function createRegistry(): Registry {
  return new Map();
}

export function register(reg: Registry, type: string, def: HandlerDef): void {
  reg.set(type, def);
}

export function resolve(reg: Registry, type: string): HandlerDef | undefined {
  return reg.get(type);
}
