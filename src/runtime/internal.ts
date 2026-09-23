/**
 * Shared internals for the Runtime API Layer: pagination helpers, the
 * per-`db` definition store, instance loading/authorization, and the step
 * and collaboration lookups the rest of `src/runtime/` builds on. This
 * module resolves bodies internally via its own `createDefinitionStore`.
 */

import type { SQL } from "bun";
import { rehydrate } from "../engine/store.js";
import { createDefinitionStore } from "../engine/definitions.js";
import { isEligibleCandidate } from "../engine/transition.js";
import type { Actor } from "../cel/eval.js";
import { ADMIN_ROLE, AuthorizationError } from "../auth/authorize.js";
import { actorPrincipals } from "../auth/groups.js";
import { NotFoundError } from "../errors.js";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { instance as instanceSchema } from "../schema/definition.js";
import type { Instance, ProcessBody, Step, InstanceId } from "../schema/definition.js";

export type Page<T> = { items: T[]; cursor?: string };

export const DEFAULT_LIST_LIMIT = 50;
/**
 * Exported so `http/routes.ts` clamps to the same bound at the boundary. The
 * `Math.min` calls below stay, so a caller that reaches this layer directly is
 * still bounded. `engine/admin-queries.ts` declares its own pair for the
 * routes it serves; the numbers agree today by coincidence, not by contract.
 */
export const MAX_LIST_LIMIT = 200;
export const DEFAULT_RECORD_LIMIT = 100;
export const MAX_RECORD_LIMIT = 500;

/**
 * The hasMore/slice/last-row/encodeCursor tail shared by every
 * keyset-paginated read in this module (`listInstances`, `getInstanceRecord`,
 * `listComments`, `listAttachments`). Takes the raw rows overfetched via
 * `LIMIT limit + 1` and a row-to-cursor-tuple mapper, and returns the sliced
 * page, whether more remain, and the next cursor. Does not map rows to
 * items — every call site's mapping is applied to `pageRows` separately,
 * since the four are not uniform (`listInstances`'s is `async` and filters
 * out `undefined` results, which a single `toItem` parameter here could not
 * express without forcing every other caller through `await`). See
 * design.md.
 */
export function keysetPage<Row>(
  rows: Row[],
  limit: number,
  cursorOf: (row: Row) => string[],
): { pageRows: Row[]; hasMore: boolean; cursor: string | undefined } {
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor(cursorOf(last)) : undefined;
  return { pageRows, hasMore, cursor };
}

/**
 * Run a keyset-paginated, `instanceId`-scoped read shared by `listComments`
 * and `listAttachments`, ordered `created_at ASC, id ASC`. `table` and
 * `columns` are caller-controlled constants, never request input. Always
 * selects `created_at::text AS created_at_cursor` alongside `columns`:
 * Postgres's full microsecond precision, unlike the driver's own `Date`
 * conversion of the plain `created_at` column (millisecond-precise only),
 * which let a boundary row's true, sub-millisecond-later timestamp compare
 * greater than its own rounded cursor on the next page, reintroducing that
 * same row — confirmed via a failing pagination test during this helper's
 * introduction. Returns the raw overfetched rows (up to `limit + 1`); does
 * not map rows to items, matching `keysetPage`'s split.
 */
export async function pagedRead<Row>(
  db: SQL,
  table: string,
  columns: string,
  instanceId: InstanceId,
  limit: number,
  cursor: string | undefined,
): Promise<Row[]> {
  const [cursorCreatedAt, cursorId] = cursor ? decodeCursor(cursor, 2) : [undefined, undefined];
  return (await db.unsafe(
    `SELECT ${columns}, created_at::text AS created_at_cursor FROM ${table}
     WHERE instance_id = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3))
     ORDER BY created_at ASC, id ASC
     LIMIT $4`,
    [instanceId, cursorCreatedAt ?? null, cursorId ?? null, limit + 1],
  )) as Row[];
}

// ============================================================
// Internal: one definition store per distinct `db`, owned by this module.
// ============================================================

export type DefinitionStore = ReturnType<typeof createDefinitionStore>;
const stores = new WeakMap<SQL, DefinitionStore>();
export function getStore(db: SQL): DefinitionStore {
  let store = stores.get(db);
  if (!store) {
    store = createDefinitionStore(db);
    stores.set(db, store);
  }
  return store;
}

export function parseInstance(raw: unknown): Instance {
  return instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/** Read-only load: unlocked peek for processId/version, then resolveBody, then rehydrate's pin check. */
export async function loadInstanceForRead(instanceId: string, db: SQL): Promise<{ instance: Instance; body: ProcessBody }> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
  const peek = parseInstance(rows[0].body);
  const store = getStore(db);
  const body = await store.resolveBody(peek.processId, peek.version);
  if (!body) throw new NotFoundError(`no published body for process ${peek.processId} version ${peek.version}`);
  const instance = await rehydrate(peek.instanceId, body, db);
  return { instance, body };
}

export function findStep(body: ProcessBody, stepId: string): Step {
  const step = body.workflow.steps.find((s) => (s.id as string) === stepId);
  if (!step) throw new Error(`current step not in body: ${stepId}`);
  return step;
}

/**
 * The one fallback chain for a step's resolved collaboration setting: the
 * step's own value always wins, in either direction, over the process
 * default, and an unset key resolves `true` at both levels. Shared by
 * `postComment`/`uploadAttachment`'s enforcement and `getInstanceView`'s
 * reported `collaboration` field so the chain exists in exactly one place.
 */
export function resolveCollaboration(body: ProcessBody, step: Step, key: "comments" | "attachments"): boolean {
  return step.collaboration?.[key] ?? body.collaboration?.[key] ?? true;
}

/**
 * Loads an instance and authorizes `actor` to read it. The rule is an ordered
 * fallback, and the order is the rule (instance-visibility-view):
 *
 * 1. `ADMIN_ROLE` loads directly; a missing instance surfaces as not-found.
 * 2. A test instance admits only its own `startedBy` (draft-test-instances).
 * 3. A live assignment on the current step — the claimant, or an eligible
 *    candidate by `isEligibleCandidate` (shared with `claimStep` so the two
 *    predicates cannot drift) — admits without consulting a revocation.
 *    That is how "a live assignment outranks a revocation" holds with no
 *    special case: the engine never hands out a task nobody can open.
 * 4. Participation admits unless a revocation names the actor: the starter,
 *    or a match between the actor's principals (`actorPrincipals`) and the
 *    instance's principal set (`instance_principals`). A starter skips the
 *    group lookup, and both probes still run: a revocation refuses them too.
 *
 * Steps 3 and 4 differ in whether `instance_principals_denied` applies, so
 * they stay two steps rather than one SQL predicate. The same rule drives the
 * `scope=visible` list (`buildVisibleRowSet`), so list and detail agree.
 *
 * Every non-admin caller loads inside a `try` whose `catch` collapses into
 * `AuthorizationError`, so a nonexistent instance and one the caller may not
 * read are indistinguishable.
 *
 * Shared by `getInstanceView`, `postComment`, `listComments`,
 * `uploadAttachment`, `listAttachments` and `getAttachment` — every Runtime
 * API Layer call that uses this participant-facing visibility rule, as
 * opposed to `getInstanceRecord`'s narrower audit-trail one.
 */
export async function loadInstanceForActor(instanceId: InstanceId, actor: Actor, db: SQL): Promise<{ instance: Instance; body: ProcessBody }> {
  if (actor.roles.includes(ADMIN_ROLE)) {
    return loadInstanceForRead(instanceId, db);
  }
  let instance: Instance;
  let body: ProcessBody;
  try {
    ({ instance, body } = await loadInstanceForRead(instanceId, db));
  } catch {
    throw new AuthorizationError(`actor '${actor.id}' may not read instance '${instanceId}'`);
  }
  // draft-test-instances: a non-administrative actor may read a test
  // instance only as its own startedBy. A claim or candidacy alone —
  // sufficient for an ordinary instance below — is not sufficient here; the
  // refusal is the same AuthorizationError a nonexistent instance gets.
  if (instance.kind === "test") {
    if (instance.startedBy !== actor.id) {
      throw new AuthorizationError(`actor '${actor.id}' may not read instance '${instanceId}'`);
    }
    return { instance, body };
  }
  if (instance.assignment?.claimedBy === actor.id || isEligibleCandidate(actor, instance.assignment?.candidates ?? [])) {
    return { instance, body };
  }
  const isStarter = instance.startedBy === actor.id;
  const principals = isStarter ? [] : await actorPrincipals(actor, db);
  const [{ matched, denied }] = (await db`
    SELECT EXISTS (SELECT 1 FROM instance_principals
                    WHERE instance_id = ${instanceId} AND principal = ANY(${db.array(principals, "TEXT")})) AS matched,
           EXISTS (SELECT 1 FROM instance_principals_denied
                    WHERE instance_id = ${instanceId} AND actor_id = ${actor.id}) AS denied
  `) as { matched: boolean; denied: boolean }[];
  if (denied || !(matched || isStarter)) {
    throw new AuthorizationError(`actor '${actor.id}' may not read instance '${instanceId}'`);
  }
  return { instance, body };
}

/**
 * Thrown by `postComment`/`uploadAttachment` when the instance's current step
 * resolves the requested field's collaboration setting to `false`. Names the
 * instance and which of `"comments"`/`"attachments"` is disabled. Thrown only
 * after `loadInstanceForActor`'s own visibility check has already passed.
 */
export class CollaborationDisabledError extends Error {
  constructor(
    readonly instanceId: string,
    readonly field: "comments" | "attachments",
  ) {
    super(`instance '${instanceId}' has '${field}' disabled on its current step`);
    this.name = "CollaborationDisabledError";
  }
}
