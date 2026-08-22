/**
 * Handler registry: an in-process `type -> HandlerDef` map, threaded through the
 * outbox worker (injected like `db`), not a global. `deliver` resolves a handler
 * by the outbox row's `action.type`; an unregistered type dead-letters.
 */

import type { SQL } from "bun";
import { z } from "zod";
import type { Action, AssignmentUnresolvedReason, FieldOption, Instance, Step } from "../schema/definition.js";

/**
 * The actor ids in force at the commit that enqueued an outbox row, frozen onto
 * that row. Engine-supplied state, not authored config: a handler reading it
 * still performs no instance lookup of its own.
 *
 * `candidates` is the entered step's resolved assignment candidate list.
 * `claimant` is `assignment.claimedBy`, which a fresh step entry clears.
 * `starter` is `Instance.startedBy`.
 */
export interface OutboxActors {
  candidates: string[];
  claimant?: string;
  starter?: string;
}

/**
 * Build the stamp from the instance a commit is writing. One helper so the
 * three `INSERT INTO outbox` sites (store.ts's subprocess spawn, and
 * transition.ts's step entry and timer fire) cannot drift apart.
 *
 * Homed here rather than beside any one of them: registry.ts is the leaf all
 * three already import, and this reads nothing but the instance.
 */
export function outboxActorsOf(inst: Pick<Instance, "assignment" | "startedBy">): OutboxActors {
  return {
    candidates: inst.assignment?.candidates ?? [],
    ...(inst.assignment?.claimedBy ? { claimant: inst.assignment.claimedBy } : {}),
    ...(inst.startedBy ? { starter: inst.startedBy } : {}),
  };
}

/**
 * What a handler is invoked with. It MUST dedupe external effects on
 * `idempotencyKey` (delivery is at-least-once).
 *
 * `actors` is optional. A row enqueued before the engine recorded actor ids
 * carries none, and a handler treats that case exactly like a row whose lists
 * are all empty. Same shape and same reason as `DataSourceContext.heldValues`.
 */
export interface HandlerContext {
  action: Action;
  config: Record<string, unknown>;
  idempotencyKey: string;
  instanceId: string;
  actors?: OutboxActors;
  /**
   * The database this delivery belongs to. Required, unlike `actors`: an absent
   * handle has no sane fallback once one process serves many tenants, since a
   * handler would quietly read whichever database built the registry. A handler
   * needing no database ignores it, the way `http.request` does.
   */
  db: SQL;
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

/**
 * The `process.start` action type, homed here for the same reason as the
 * pair above. `handlers/process-start.ts` imports `createDefinitionStore`
 * from `engine/definitions.ts`, and `definitions.ts` needs this constant for
 * its own publish-time check, so defining it in the handler file would cycle
 * back through `definitions.ts`.
 */
export const PROCESS_START_ACTION_TYPE = "process.start";

export type Registry = Map<string, HandlerDef>;

export function createRegistry(): Registry {
  return new Map();
}

/**
 * The three type-name arrays every dimension's type-resolution half checks
 * against — the same `[...registry.keys()]` shape `GET /registry` already
 * builds (`src/http/studio-routes.ts`). The studio's `useRegistry` response
 * satisfies this structurally: its `RegistryInfo` is a six-field superset
 * carrying these same three arrays plus three schema-description records, so
 * the studio passes its own fetched response wherever a `RegistryDescription`
 * is expected, with no shared type tying the two declarations together.
 */
export interface RegistryDescription {
  actionTypes: string[];
  assignmentStrategyTypes: string[];
  dataSourceTypes: string[];
}

/**
 * Derive one type-name array from one live registry. Building a full
 * `RegistryDescription` takes three calls to this function, one per registry
 * (action, assignment, data source), not one call deriving the whole shape
 * from a single registry.
 */
export function describeTypeNames(registry: Registry | AssignmentRegistry | DataSourceRegistry): string[] {
  return [...registry.keys()];
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
 * already merged.
 *
 * `db` travels here, which reverses what this comment said until multi-tenancy
 * landed: a strategy used to reach the shared pool itself. Under one database
 * per tenant a handle bound when the registry was built resolves every tenant's
 * manager against one directory, and the wrong actor lands in the wrong inbox.
 * It is a plain handle, never a transaction: resolution runs before the entry's
 * own transaction opens on three of its four paths.
 */
export interface AssignmentContext {
  config: Record<string, unknown>;
  stepId: string;
  instance: { id: string; startedBy: string | undefined; data: Instance["data"] };
  db: SQL;
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

export const staticAssignmentConfigSchema = z.object({ candidates: z.array(z.string()) });

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
  reg.set(STATIC_ASSIGNMENT_STRATEGY_TYPE, staticAssignmentStrategyDef);
  return reg;
}

/** The default resolution deadline in milliseconds, overridden by `ASSIGNMENT_RESOLUTION_TIMEOUT_MS`. */
export const DEFAULT_ASSIGNMENT_RESOLUTION_TIMEOUT_MS = 5000;

/** Read per call, not once at module load, so a test can set the variable after import. */
function resolutionTimeoutMs(): number {
  const raw = Number(process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ASSIGNMENT_RESOLUTION_TIMEOUT_MS;
}

/**
 * What `resolveStepAssignment` answers: the state to write, plus the reason it
 * produced no candidate. The CALLER records that reason as an
 * `assignment.unresolved` event, inside the transaction committing the entry.
 * This function holds no transaction handle and, on three of the four paths,
 * runs before one opens — appending here could commit an event beside a
 * rolled-back entry.
 */
export interface ResolvedAssignment {
  assignment: Instance["assignment"];
  unresolved?: AssignmentUnresolvedReason;
}

/**
 * Resolve a step's declared `assignment` into a fresh `AssignmentState` through
 * `reg`. `assignment: undefined` and no reason when the step declares no
 * `assignment` (unrestricted): resolution does not run for it, and it records
 * nothing.
 *
 * Called by the step-entry callers — `commitTransition`, `startInstance`,
 * `createSeededInstance` (shared by the subprocess spawn handler and
 * `process.start`), `createProcessInstance` — never by `planStepEntry` (which
 * stays pure and synchronous) and never by `createInstance` (which stays
 * persistence-only). Migration reaches none of this: it passes
 * `assignment: { carry: true }` and keeps the candidates the instance holds.
 *
 * Resolution is TOTAL. A resolver that raises, that exceeds the deadline, or
 * that answers with an empty list yields empty candidates and a reason. It never
 * rolls back the entry: the state change that reached the step is real. No
 * fallback assignee is substituted, so an empty list means no actor is an
 * eligible candidate and the instance stalls visibly.
 *
 * An unregistered type resolves to zero candidates rather than raising:
 * publish-time `checkAssignmentRegistry` already rejects one, so this is
 * defensive only, mirroring `resolveFields`' unresolved-ref handling.
 *
 * The deadline bounds every path, which is what makes the subprocess return's
 * carve-out safe. That one path resolves while holding the parent's row lock,
 * since it derives the step it enters from the row it read `FOR UPDATE`, so an
 * unbounded resolver there would hold the lock against every other writer of
 * that instance. `Promise.race` does not cancel the loser and does not need to:
 * the orphaned query holds a different pool connection, so the caller returns
 * and its transaction commits and releases the lock on time. A late answer is
 * ignored.
 */
export async function resolveStepAssignment(
  step: Step,
  reg: AssignmentRegistry,
  instance: AssignmentContext["instance"],
  db: SQL,
): Promise<ResolvedAssignment> {
  if (!step.assignment) return { assignment: undefined };
  const strategy = step.assignment.strategy;
  const def = reg.get(strategy.type);

  let candidates: string[] = [];
  let unresolved: AssignmentUnresolvedReason | undefined;
  if (!def) {
    unresolved = "no-candidates";
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol("assignment-resolution-timeout");
    try {
      const raced = await Promise.race([
        def.resolve({ config: strategy.config, stepId: step.id, instance, db }),
        new Promise<typeof timedOut>((resolve) => {
          timer = setTimeout(() => resolve(timedOut), resolutionTimeoutMs());
        }),
      ]);
      if (raced === timedOut) unresolved = "timed-out";
      else if (raced.length === 0) unresolved = "no-candidates";
      else candidates = raced;
    } catch {
      unresolved = "resolver-raised";
    } finally {
      // Without this a prompt resolver still leaves a pending timer holding the
      // event loop open for the rest of the deadline.
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return {
    assignment: { candidates, claimedBy: undefined, claimedAt: undefined },
    ...(unresolved ? { unresolved } : {}),
  };
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
  /**
   * The database this resolution belongs to. Required for the reason
   * `HandlerContext.db` is: `db.list` reads the `data_lists` tables, and a
   * bound handle would offer one tenant's values to every tenant.
   */
  db: SQL;
  /**
   * The values the instance already holds for the field under resolution, so a
   * handler can return one its own store has since retired. A handler with no
   * such notion (`"static"`) ignores it.
   */
  heldValues?: string[];
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
