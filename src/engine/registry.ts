/**
 * Handler registry: an in-process `type -> HandlerDef` map, threaded through the
 * outbox worker (injected like `db`), not a global. `deliver` resolves a handler
 * by the outbox row's `action.type`; an unregistered type dead-letters.
 */

import { z } from "zod";
import type { Action, FieldOption } from "../schema/definition.js";

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
 * The only supported assignment strategy: `Step.assignment.strategy.config`
 * is `{ candidates: string[] }`, resolved directly (no registry) by
 * `resolveStepAssignment` (transition.ts) and `createInstance` (store.ts).
 */
export const STATIC_ASSIGNMENT_STRATEGY_TYPE = "static";

/**
 * Data-source registry: a sibling to the action `Registry` above, deliberately
 * a plain parallel structure rather than a shared generic abstraction (the
 * action registry wasn't generic when it was the only one). Resolves a
 * `FieldDef.dataSource`'s `type` to a handler that produces the field's
 * runtime option list.
 */
export interface DataSourceContext {
  config: Record<string, unknown>;
}

/** `resolve` is async even for a pure config-echo handler, so a future I/O-backed type is a drop-in, not an interface change. */
export interface DataSourceHandlerDef {
  resolve: (ctx: DataSourceContext) => Promise<FieldOption[]>;
  configSchema?: z.ZodTypeAny;
}

export type DataSourceRegistry = Map<string, DataSourceHandlerDef>;

export function createDataSourceRegistry(): DataSourceRegistry {
  return new Map();
}

export function registerDataSource(reg: DataSourceRegistry, type: string, def: DataSourceHandlerDef): void {
  reg.set(type, def);
}

export function resolveDataSource(reg: DataSourceRegistry, type: string): DataSourceHandlerDef | undefined {
  return reg.get(type);
}
