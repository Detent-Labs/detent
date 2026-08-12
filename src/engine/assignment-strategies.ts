/**
 * The engine's shipped assignment strategies beyond the pure `static` entry that
 * lives in leaf `registry.ts`.
 *
 * Homed here rather than in `registry.ts` because `org.manager-of-starter` reads
 * the database: it imports `src/auth/users.ts`, which imports `sql` from
 * `store.ts`, which imports `SPAWN_ACTION_TYPE` back from `registry.ts`. Putting
 * this entry there would close that cycle and cost `registry.ts` the leaf status
 * that lets `store.ts`, `transition.ts` and `definitions.ts` each default a
 * parameter to `createDefaultAssignmentRegistry()`.
 *
 * This module's `createDefaultAssignmentRegistry` deliberately shares that name.
 * `src/http/server.ts` — the composition root — imports the identifier and uses
 * it as the default for both `createServer` and `serve`, so switching the whole
 * HTTP surface onto the org-aware set is a change of import, with no
 * default-parameter expression touched.
 */
import { z } from "zod";
import { getManagerOf } from "../auth/users.js";
import {
  type AssignmentRegistry,
  type AssignmentStrategyDef,
  createDefaultAssignmentRegistry as createStaticAssignmentRegistry,
  registerAssignmentStrategy,
} from "./registry.js";

export const MANAGER_OF_STARTER_STRATEGY_TYPE = "org.manager-of-starter";

/** Strict and empty: the strategy reads nothing from its config, so any key is an authoring error caught at publish. */
export const managerOfStarterConfigSchema = z.object({}).strict();

/**
 * Resolve the manager of the instance's starter, the value every instance
 * already records as `startedBy`. Nothing new is persisted per instance.
 *
 * ONE hop. It does not walk a chain of managers, and it does not resolve the
 * manager of whoever performed the previous step — both are different questions
 * and become their own registry entries if anyone needs them.
 *
 * Returns an empty list when the instance records no `startedBy`, when
 * `startedBy` matches no account, or when that account has no manager on record.
 * `resolveStepAssignment` classifies all three as `no-candidates` and records an
 * `assignment.unresolved` event; it substitutes no fallback assignee.
 *
 * The id returned is the `user_id`, which is the value the manager authenticates
 * with. It therefore matches `Actor.id`, `assignment.claimedBy` and the
 * `scope=mine` inbox filter with no translation — the property that makes a
 * later switch to an external directory a swap of this lookup alone.
 */
export const managerOfStarterStrategyDef: AssignmentStrategyDef = {
  configSchema: managerOfStarterConfigSchema,
  resolve: async (ctx) => {
    const starter = ctx.instance.startedBy;
    if (!starter) return [];
    const manager = await getManagerOf(starter, ctx.db);
    return manager ? [manager] : [];
  },
};

/**
 * The registry the engine ships: the built-in `static` entry plus
 * `org.manager-of-starter`.
 *
 * It takes no database. Each resolution reads `ctx.db`, so one registry serves
 * every tenant — a handle bound here would resolve every tenant's manager
 * against one directory.
 */
export function createDefaultAssignmentRegistry(): AssignmentRegistry {
  const reg = createStaticAssignmentRegistry();
  registerAssignmentStrategy(reg, MANAGER_OF_STARTER_STRATEGY_TYPE, managerOfStarterStrategyDef);
  return reg;
}
