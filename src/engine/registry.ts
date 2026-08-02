/**
 * Handler registry: an in-process `type -> HandlerDef` map, threaded through the
 * outbox worker (injected like `db`), not a global. `deliver` resolves a handler
 * by the outbox row's `action.type`; an unregistered type dead-letters.
 */

import { z } from "zod";
import type { Action, FieldOption, Instance, Step } from "../schema/definition.js";

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
 * The strategy type an author gets by default, and the only entry the built-in
 * `createDefaultAssignmentRegistry` below registers. It resolves through the
 * `AssignmentRegistry` like any other type — no engine code branches on this
 * literal.
 */
export const STATIC_ASSIGNMENT_STRATEGY_TYPE = "static";

/**
 * Assignment-strategy registry: a third sibling to the action `Registry` and
 * the `DataSourceRegistry` above, the same plain parallel structure rather than
 * a shared generic abstraction. Resolves a `Step.assignment.strategy`'s `type`
 * to the resolver producing that step's candidate list.
 *
 * The context is deliberately minimal — widen it when the engine surfaces a
 * concrete need, the rule the CEL context follows. Passing the whole instance
 * would make every internal field part of the plugin contract by accident.
 * `data` is the data the entering instance will carry, with any submitted patch
 * already merged. No connection or transaction handle travels here: a strategy
 * needing its own database access uses the shared pool, as `src/auth/users.ts`
 * does.
 */
export interface AssignmentContext {
  config: Record<string, unknown>;
  stepId: string;
  instance: { id: string; startedBy: string | undefined; data: Instance["data"] };
}

/** `resolve` is async even for the pure config-echo `static` entry, so a future I/O-backed strategy is a drop-in, not an interface change (same reason as `DataSourceHandlerDef.resolve`). */
export interface AssignmentStrategyDef {
  resolve: (ctx: AssignmentContext) => Promise<string[]>;
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

const staticAssignmentConfigSchema = z.object({ candidates: z.array(z.string()) });

/** The built-in `static` entry: its configured list, verbatim, with no CEL evaluation and no dynamic lookup. */
export const staticAssignmentStrategyDef: AssignmentStrategyDef = {
  configSchema: staticAssignmentConfigSchema,
  resolve: async (ctx) => (ctx.config as { candidates?: string[] }).candidates ?? [],
};

/**
 * A registry pre-populated with the built-in `static` strategy. Homed here
 * rather than in host.ts (where the action and data-source defaults live)
 * because this resolver imports nothing — it reads its own config — so
 * registry.ts stays the leaf module it already was, and store.ts,
 * transition.ts and definitions.ts can all default a parameter to it without
 * closing an import cycle through host.ts.
 */
export function createDefaultAssignmentRegistry(): AssignmentRegistry {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, STATIC_ASSIGNMENT_STRATEGY_TYPE, staticAssignmentStrategyDef);
  return reg;
}

/**
 * Resolve a step's declared `assignment` into a fresh `AssignmentState` through
 * `reg`. `undefined` when the step declares no `assignment` (unrestricted).
 *
 * Called by the step-entry callers — `commitTransition`, the subprocess spawn
 * handler, `startInstance` — never by `planStepEntry` (which stays pure and
 * synchronous) and never by `createInstance` (which stays persistence-only).
 *
 * An unregistered type resolves to zero candidates rather than raising:
 * publish-time `checkAssignmentRegistry` already rejects one, so this is
 * defensive only, mirroring `resolveFields`' unresolved-ref handling. An empty
 * list means no actor is an eligible candidate; no fallback assignee is
 * substituted.
 */
export async function resolveStepAssignment(
  step: Step,
  reg: AssignmentRegistry,
  instance: AssignmentContext["instance"],
): Promise<Instance["assignment"]> {
  if (!step.assignment) return undefined;
  const strategy = step.assignment.strategy;
  const def = resolveAssignmentStrategy(reg, strategy.type);
  const candidates = def ? await def.resolve({ config: strategy.config, stepId: step.id, instance }) : [];
  return { candidates, claimedBy: undefined, claimedAt: undefined };
}

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
