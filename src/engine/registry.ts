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
