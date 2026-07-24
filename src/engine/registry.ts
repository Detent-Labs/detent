/**
 * Handler registry: an in-process `type -> HandlerDef` map, threaded through the
 * outbox worker (injected like `db`), not a global. `deliver` resolves a handler
 * by the outbox row's `action.type`; an unregistered type dead-letters.
 */

import { z } from "zod";
import type { Action } from "../schema/definition.js";

/** What a handler is invoked with. It MUST dedupe external effects on `idempotencyKey` (delivery is at-least-once). */
export interface HandlerContext {
  action: Action;
  config: Record<string, unknown>;
  idempotencyKey: string;
  instanceId: string;
}

/** A registered handler plus its plugin config JSON Schema. */
export interface HandlerDef {
  handler: (ctx: HandlerContext) => Promise<unknown>;
  configSchema?: z.ZodTypeAny;
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

/**
 * A registered assignment strategy: resolves a step's `assignment.strategy.config`
 * into a flat candidate list. Unlike an action handler, `resolve` is synchronous
 * and pure — it runs inside `planStepEntry` (no I/O), not the async outbox, because
 * candidates must exist atomically the instant a step becomes current.
 */
export interface AssignmentStrategyDef {
  resolve: (config: Record<string, unknown>, context: Record<string, unknown>) => string[];
  configSchema?: z.ZodTypeAny;
}

export type AssignmentRegistry = Map<string, AssignmentStrategyDef>;

export function createAssignmentRegistry(): AssignmentRegistry {
  return new Map();
}

export function registerAssignmentStrategy(reg: AssignmentRegistry, type: string, def: AssignmentStrategyDef): void {
  reg.set(type, def);
}

export function resolveAssignmentStrategy(reg: AssignmentRegistry, type: string): AssignmentStrategyDef | undefined {
  return reg.get(type);
}

/** The built-in static strategy: a flat, authored candidate list, no CEL, no lookup. */
export const STATIC_ASSIGNMENT_STRATEGY_TYPE = "static";

export const staticAssignmentStrategy: AssignmentStrategyDef = {
  resolve: (config) => (config.candidates as string[] | undefined) ?? [],
  configSchema: z.object({ candidates: z.array(z.string()) }),
};

/** A registry pre-populated with the one built-in strategy. */
export function createDefaultAssignmentRegistry(): AssignmentRegistry {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, STATIC_ASSIGNMENT_STRATEGY_TYPE, staticAssignmentStrategy);
  return reg;
}
