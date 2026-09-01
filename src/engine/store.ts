/**
 * Instance store: persist an instance and rehydrate it against its pinned frozen
 * body. Native Bun.sql, connection via DATABASE_URL. `instances` holds one row
 * per instance (jsonb body + promoted transition_seq for the OCC predicate);
 * append-only `history_entries` and `instance_events` hold the runtime record,
 * matching the schema's own separation (Instance carries neither; both records
 * carry instanceId).
 */

import { SQL } from "bun";
import {
  instance as instanceSchema,
  type Instance,
  type InstanceEvent,
  type InstanceEventId,
  type ProcessBody,
  type ProcessId,
  type StepId,
} from "../schema/definition.js";
import { definitionHash } from "../schema/hash.js";
import { armStepTimers, minFireAt } from "./duration.js";
import { idempotencyKey } from "./idempotency.js";
import { SPAWN_ACTION_TYPE, outboxActorsOf } from "./registry.js";

/**
 * Constructs the real client on first use, throwing an error naming
 * `DATABASE_URL` if it is unset at that point, rather than the empty string
 * this module used to hand `SQL` and let fail later with an opaque
 * connection error on whichever query happened to run first.
 *
 * Deferred to first use rather than module load: every real entry point
 * (`startHttpServer`, `src/auth/cli.ts`) now calls `initSchema` before doing
 * anything else, so for them this still fails immediately, before a request
 * is served or a command runs — `initSchema`'s first statement is the first
 * use. The difference only matters to a module that merely *imports*
 * `sql`/`initSchema` without ever calling either — most of this repo's
 * `bun:test` suites do exactly that at module scope, gated behind
 * `test.skipIf(!DATABASE_URL)` at the individual test, not the import. An
 * eager throw here would fail that `import` itself, for every such suite,
 * turning a documented graceful skip (see CLAUDE.md) into a crash.
 */
let realSql: SQL | undefined;
function getSql(): SQL {
  if (realSql) return realSql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it to a Postgres connection string before starting the engine (server, CLI, or script).",
    );
  }
  realSql = new SQL(url);
  return realSql;
}

/**
 * Shared client. A `Proxy` rather than the real `SQL` instance directly, so
 * that constructing it (see `getSql` above) can be deferred to first use.
 * `sql` is called as a tagged-template function (`` sql`...` ``) and has
 * methods accessed off it (`.begin`, `.close`, ...); the `apply`/`get` traps
 * forward both to the real, lazily-constructed instance.
 */
export const sql: SQL = new Proxy(function sql() {} as unknown as SQL, {
  apply(_target, thisArg, args) {
    return Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, thisArg, args);
  },
  get(_target, prop, _receiver) {
    const real = getSql();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getSql() as object, prop);
  },
});

export async function initSchema(db: SQL = sql): Promise<void> {
  await db`CREATE TABLE IF NOT EXISTS instances (
    instance_id text PRIMARY KEY,
    transition_seq integer NOT NULL,
    body jsonb NOT NULL
  )`;
  await db`CREATE TABLE IF NOT EXISTS history_entries (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    entry jsonb NOT NULL
  )`;
  // Mirrors instance_events' own index on the structurally identical
  // predicate. Readers: outbox.ts::appendOutcome (UPDATE ... WHERE
  // instance_id = $1 AND transition_seq = $2, run for every delivered and
  // dead-lettered outbox row while it holds the outbox row lock) and
  // api.ts::getInstanceRecord (WHERE instance_id = ...).
  await db`CREATE INDEX IF NOT EXISTS history_entries_instance_idx ON history_entries (instance_id, transition_seq)`;
  // Append-only runtime events that are not transitions, shaped like
  // history_entries. `kind` is promoted out of the jsonb so the log is queryable
  // by kind ("which instances dropped a timer, and why") without a jsonb scan.
  await db`CREATE TABLE IF NOT EXISTS instance_events (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    kind text NOT NULL,
    event jsonb NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS instance_events_instance_idx ON instance_events (instance_id, transition_seq)`;
  await db`CREATE INDEX IF NOT EXISTS instance_events_kind_idx ON instance_events (kind)`;
  // Free-text comments, deliberately outside the history_entries/instance_events
  // audit backbone (see persistence spec's "Instance comments are persisted
  // independently of the audit-trail relations"): a comment's text can carry
  // personal data, unlike those two relations' structural-facts-only content.
  await db`CREATE TABLE IF NOT EXISTS instance_comments (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    actor_id text NOT NULL,
    text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await db`CREATE INDEX IF NOT EXISTS instance_comments_instance_idx ON instance_comments (instance_id, created_at, id)`;
  // File attachments, deliberately outside the history_entries/instance_events
  // audit backbone, the same reasoning instance_comments already applies: an
  // attachment's bytes can carry personal data, unlike those two relations'
  // structural-facts-only content. size_bytes is a 32-bit integer, capping at
  // roughly 2.1 GB — far above any sane MAX_ATTACHMENT_BYTES, but a ceiling a
  // future operator raising that cap should know about.
  await db`CREATE TABLE IF NOT EXISTS instance_attachments (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    actor_id text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await db`CREATE INDEX IF NOT EXISTS instance_attachments_instance_idx ON instance_attachments (instance_id, created_at, id)`;
  // Outbox: one row per enqueued trigger action. idempotency_key (PK) makes
  // re-enqueuing a replayed transition conflict instead of duplicating.
  await db`CREATE TABLE IF NOT EXISTS outbox (
    idempotency_key text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    action_id text NOT NULL,
    action jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz
  )`;
  // Claim/deliver/mark split: a claimed row carries a lease (claimed_at). status
  // is free text, so the 'claimed' state needs no constraint change. Idempotent
  // add so an existing outbox table gains the column.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz`;
  // Outcome routing: the runtime record that enqueued this action. An
  // InstanceEvent id when a reminder fire enqueued it, NULL when a transition did
  // (its outcome is located by (instance_id, transition_seq), which identifies a
  // transition exactly and an event not at all). Idempotent add.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_id text`;
  await db`CREATE INDEX IF NOT EXISTS outbox_claim_idx ON outbox (status, next_attempt_at)`;
  // Lamination stamp: the instance's version at enqueue time, kept in lock-step by
  // migrateOne (which locks and bumps every one of an instance's outbox rows
  // atomically with the instance's own version bump). Lets a migration remap a
  // safe row's Action.output field ids in place, and lets delivery detect (and
  // suppress) a writeback whose instance has since migrated out from under it.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS field_version integer`;
  // Denormalized copy of the failure message from the row's most recent delivery
  // attempt, so an outbox listing is self-sufficient without a jsonb scan across
  // history_entries/instance_events for the ActionOutcome that already carries it.
  // Cleared to NULL on a successful delivery. Idempotent add.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text`;
  // The actor ids the enqueuing instance held at that moment: assignment
  // candidates, the claimant, the starter. Frozen, and NOT rewritten when the
  // instance's assignment later changes — a handler naming a recipient by role
  // (notification.email's `toActors`) must see the actors of the commit that
  // enqueued the action. The resolution worker cascades automatic steps without
  // waiting for this queue, so a delivery-time read of `instances` would name
  // whoever holds a step the instance reached afterwards. NULL on every row
  // predating this column, and nothing backfills it: no body published before
  // it could name an actor recipient. Idempotent add.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS actors jsonb`;
  // Migration locks an instance's undelivered outbox rows before its instance row
  // (matching drainOutbox's own lock order); without this index that scan and lock
  // sequentially scan the whole table.
  await db`CREATE INDEX IF NOT EXISTS outbox_instance_idx ON outbox (instance_id)`;
  // Backfill is exact, not best-effort: the pre-existing in-flight-actions check
  // always skipped migration entirely while any pending/claimed row existed, so
  // every outbox row present before this column existed still belongs to an
  // instance sitting on the exact version that enqueued it.
  await db`UPDATE outbox SET field_version = (
    SELECT (body->>'version')::int FROM instances WHERE instances.instance_id = outbox.instance_id
  ) WHERE field_version IS NULL`;
  // Re-resolution flag: a data-affecting writeback sets this to 'pending' so the
  // resolution worker re-drives automatic evaluation for a parked wait-state.
  // Idempotent add + index for the worker's claim scan.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_state text NOT NULL DEFAULT 'idle'`;
  // Lease stamp for the resolution worker's claim: a 'claimed' row past its lease
  // is an abandoned (crashed) claim and is reclaimed by a later drain.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_claimed_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_resolve_idx ON instances (resolve_state)`;
  // Cancel-cascade sweep durability: 'idle' (never cancelled, or not yet attempted),
  // 'pending' (cancelled; the direct-child sweep has not completed without a
  // conflicted or failed child), 'done' (a sweep pass found zero conflicted/failed
  // children). Read by instance_id only (cancelInstance's own resume check), never
  // scanned by a worker, so no index.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS cancel_sweep_state text NOT NULL DEFAULT 'idle'`;
  // Timer scheduling: the min unfired fireAt of the current step's armed timers,
  // maintained at every arm/disarm. The scheduler polls WHERE next_timer_at <= now().
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS next_timer_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_timer_idx ON instances (next_timer_at)`;
  // Definition store: one row per published version, keyed by (process_id, version).
  // Holds the frozen compiled body plus its pin metadata; the resolution/timer
  // workers resolve an instance's body from here. Immutable — the PK forbids a
  // body overwrite at an existing (process_id, version).
  await db`CREATE TABLE IF NOT EXISTS definitions (
    process_id text NOT NULL,
    version integer NOT NULL,
    definition_hash text NOT NULL,
    status text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    body jsonb NOT NULL,
    PRIMARY KEY (process_id, version)
  )`;
  // Idempotent-publish lookup: an identical re-publish matches by (process_id, hash).
  await db`CREATE INDEX IF NOT EXISTS definitions_hash_idx ON definitions (process_id, definition_hash)`;
  // A test instance's frozen draft body, one row per test-instance run — a
  // sibling to `definitions`, never a row inside it (see design.md "A frozen
  // draft snapshot lives in a new table, not in definitions"). `version` is a
  // negative, per-process-decrementing sentinel (createDraftSnapshot below),
  // disjoint from `definitions`' always-positive published versions, so
  // `resolveBody`'s `version < 0` fallback can never collide with a real one.
  await db`CREATE TABLE IF NOT EXISTS draft_snapshots (
    process_id text NOT NULL,
    version integer NOT NULL,
    definition_hash text NOT NULL,
    body jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (process_id, version)
  )`;
  // Migration plans: the rule moving instances from one version to another, keyed by
  // its version pair and independent of `definitions` (a published body stays
  // immutable while its plan is corrected before use, and several source versions may
  // target one target). `applied_at` is NULL until the first instance migrates under
  // it; registration upserts under `WHERE applied_at IS NULL` to freeze it atomically.
  await db`CREATE TABLE IF NOT EXISTS migration_plans (
    process_id text NOT NULL,
    from_version integer NOT NULL,
    to_version integer NOT NULL,
    spec jsonb NOT NULL,
    applied_at timestamptz,
    PRIMARY KEY (process_id, from_version, to_version)
  )`;
  // Instance listing's paging key. Runtime ids are UUIDv4 (see createInstance's
  // ponytail note), so instance_id carries no time order on its own — a
  // participant inbox ordered by it would be ordered arbitrarily. Idempotent add;
  // a database created before this field existed gets `now()` for every
  // pre-existing row, which orders that population among itself by instance_id
  // (harmless pre-production, not a bug).
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`;
  await db`CREATE INDEX IF NOT EXISTS instances_created_idx ON instances (created_at DESC, instance_id DESC)`;
  // The inbox predicate ("claimed by me, or unclaimed and I am a candidate")
  // needs its own indexes over the jsonb-nested assignment fields:
  // instances_selection_col_idx does not cover them. These two stay expression
  // indexes — assignment.claimedBy and assignment.candidates have no column.
  await db`CREATE INDEX IF NOT EXISTS instances_claimed_by_idx ON instances ((body->'assignment'->>'claimedBy'))`;
  await db`CREATE INDEX IF NOT EXISTS instances_candidates_idx ON instances USING GIN ((body->'assignment'->'candidates'))`;
  // Child-instance lookup: the cancel cascade's child sweep and the migration
  // live-child gate both filter on the parent's instanceId. A plain B-tree
  // expression index — equality on one extracted text value, the same shape
  // as instances_claimed_by_idx (GIN above is for the candidates containment
  // predicate, not this one). `status` is deliberately left out: it is low
  // cardinality, and the parent id alone reduces the scan to a handful of
  // rows. Readers: transition.ts::sweepCancelledChildren, migration.ts::migrateOne.
  await db`CREATE INDEX IF NOT EXISTS instances_parent_idx ON instances ((body->'parent'->>'instanceId'))`;
  // Set once by redactInstance (src/engine/retention.ts); NULL means not
  // redacted, the same convention every other additive instances column uses.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS redacted_at timestamptz`;
  // "published" (an instance created against a definitions row) or "test" (a
  // draft-test-instances run, resolved via draft_snapshots below). A real
  // column, not just a field of the jsonb body: every kind-exclusion
  // predicate filters the stored row directly, and a pre-existing row's body
  // has no `kind` key at all — a `body->>'kind'` predicate would read that as
  // SQL NULL and silently drop it under three-valued logic. The column
  // default backfills every pre-existing row to 'published' at ALTER time.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'published'`;
  // The retention sweep's selection query filters on this column first (most
  // rows are NULL forever, so a partial index stays small), then checks
  // status/currentStepEnteredAt in memory over the reduced row set.
  await db`CREATE INDEX IF NOT EXISTS instances_redacted_idx ON instances (redacted_at) WHERE redacted_at IS NULL`;
  // Six standardized Instance scalars, promoted out of the jsonb body into
  // real columns, on the redacted_at precedent above: the key stays in body
  // (parseInstance is unchanged), and the column is additive infrastructure
  // a query MAY use instead of a jsonb ->> lookup. GENERATED ALWAYS ... STORED
  // rather than a dual write: it cannot drift from body, which a second
  // write path could. startedAt is `text`, not `timestamptz` — verified
  // against Postgres 16.15 that `(body->>'startedAt')::timestamptz` raises
  // "generation expression is not immutable" (the timestamptz input path
  // reads session DateStyle/TimeZone). Every writer produces startedAt as
  // `new Date().toISOString()`, a fixed-width ISO-8601 string in UTC, so a
  // text column ranges and sorts the same way a timestamptz column would.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS process_id text GENERATED ALWAYS AS ((body->>'processId')) STORED`;
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS version integer GENERATED ALWAYS AS (((body->>'version')::integer)) STORED`;
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS status text GENERATED ALWAYS AS ((body->>'status')) STORED`;
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS current_step_id text GENERATED ALWAYS AS ((body->>'currentStepId')) STORED`;
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS started_by text GENERATED ALWAYS AS ((body->>'startedBy')) STORED`;
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS started_at text GENERATED ALWAYS AS ((body->>'startedAt')) STORED`;
  // Backs selectInRange's range predicate (src/engine/reporting.ts), rewritten
  // to filter on this column directly — the planner would not substitute this
  // index into a query still naming the original body->>'startedAt' expression.
  await db`CREATE INDEX IF NOT EXISTS instances_started_idx ON instances (started_at)`;
  // Three plain btrees over the columns above, replacing the expression indexes
  // that stood over the same keys (instances_selection_idx,
  // instances_current_step_idx, instances_started_by_idx). They must sit after
  // the ADD COLUMN statements: a fresh database has no column to index before
  // them. Measured at 200k rows: liveVersionCounts 1.549 -> 0.343 ms (an
  // index-only scan becomes reachable), the orphan scan 5.990 -> 2.816 ms, the
  // migration scan 2.568 -> 1.548 ms, and the selection index's write overhead
  // +24.8% -> +17.1%, at identical index size. See the change
  // rebuild-instance-expression-indexes.
  //
  // The names differ from the three dropped ones on purpose. CREATE INDEX IF
  // NOT EXISTS leaves an index of a given name alone whatever its definition,
  // so reusing a name would strand every already-initialised database on the
  // expression form. The DROPs stay here permanently: a database that has
  // never run them reaches this code by the same path as one that has, and
  // nothing builds the old names again, so two concurrent initSchema runs
  // cannot race over them.
  await db`DROP INDEX IF EXISTS instances_selection_idx`;
  await db`DROP INDEX IF EXISTS instances_current_step_idx`;
  await db`DROP INDEX IF EXISTS instances_started_by_idx`;
  // Readers: the migration population scan and findOrphanKeys
  // (src/engine/migration.ts), liveVersionCounts (src/engine/definitions.ts),
  // selectInRange and the bottlenecks WIP query (src/engine/reporting.ts), and
  // buildInstanceWhere's processId/version/status filters (src/runtime/api.ts),
  // whose inbox predicate reaches it as one leg of a BitmapAnd.
  await db`CREATE INDEX IF NOT EXISTS instances_selection_col_idx ON instances (process_id, version, status)`;
  // Readers: buildInstanceWhere's shared currentStepId filter, reached by the
  // instance list read and the instance data read (src/runtime/api.ts), and the
  // bottlenecks view's GROUP BY (src/engine/reporting.ts).
  await db`CREATE INDEX IF NOT EXISTS instances_current_step_col_idx ON instances (current_step_id)`;
  // Readers: buildInstanceWhere's shared startedBy filter, reached by the same
  // two reads, and the participant-facing GET /instances?scope=started route.
  await db`CREATE INDEX IF NOT EXISTS instances_started_by_col_idx ON instances (started_by)`;
  // Project-local user accounts (src/auth/users.ts). user_id is the value used
  // as Actor.id — the same convention as assignment.candidates/claimedBy.
  await db`CREATE TABLE IF NOT EXISTS auth_users (
    user_id       text PRIMARY KEY,
    email         text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    roles         text[] NOT NULL DEFAULT '{}',
    disabled      boolean NOT NULL DEFAULT false
  )`;
  // The account's manager: a pointer to one other account, never a tree. Read by
  // the `org.manager-of-starter` assignment strategy (assignment-strategies.ts).
  // Its own statement, since CREATE TABLE IF NOT EXISTS does not touch a table
  // that already exists. The self-reference makes a pointer to no account
  // unrepresentable; nothing deletes an account today, so ON DELETE SET NULL
  // states an intent rather than a path that runs.
  await db`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS manager_user_id text REFERENCES auth_users(user_id) ON DELETE SET NULL`;
  // The account's human-readable name (src/auth/users.ts). Nullable, and NULL on
  // every pre-existing row: a caller reads the resolved COALESCE(display_name,
  // email), so a row without one shows its email until someone sets a value. Its
  // own statement for the same reason manager_user_id has one.
  await db`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS display_name text`;
  // The account's own UI locale (src/http/account-routes.ts). Nullable, and NULL
  // on every pre-existing row: a browser that reads no value keeps its own
  // localStorage preference. The value set is bounded by the route, not by a
  // check constraint — a locale the frontend later adds must not make an
  // already-stored row unreadable. Its own statement for the same reason
  // manager_user_id has one.
  await db`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locale text`;
  // Process-scoped permission grants (src/auth/grants.ts): one row maps a role
  // string to a permission and a scope, so any holder of that role gets that
  // permission over the process(es) the scope names. Read by
  // src/auth/authorize.ts::can, behind the global-role check, which is why an
  // installation that writes no grant pays no query and gains no access. No
  // tenant column: tenancy here is database-per-tenant, the same convention
  // auth_users uses. The triple IS the identity — a surrogate id would be a
  // second name for a row that already has one, and the composite key gives
  // the write its ON CONFLICT DO NOTHING idempotence and the revoke its exact
  // target for free. scope is jsonb so a second scope type never needs a
  // migration; Postgres normalizes key order inside a jsonb value, so the
  // primary key sees one canonical encoding per logical scope.
  await db`CREATE TABLE IF NOT EXISTS permission_grants (
    role       text  NOT NULL,
    permission text  NOT NULL,
    scope      jsonb NOT NULL,
    PRIMARY KEY (role, permission, scope)
  )`;
  // Studio's mutable draft store: one row per process, the authored (uncompiled)
  // body an author is still editing. Deliberately not `definitions` with
  // `status='draft'` — that table is what resolution.ts and the timer worker
  // rehydrate *running instances* from, and a mutable body there would put one
  // forgotten read site between a half-finished draft and a live instance.
  // `layout` sits beside `body`, never inside it: definitionHash is the JCS hash
  // of ProcessBody only, so a moved box carried in the body would mint a new
  // version at the next publish.
  await db`CREATE TABLE IF NOT EXISTS drafts (
    process_id   text PRIMARY KEY,
    body         jsonb NOT NULL,
    layout       jsonb NOT NULL DEFAULT '{}',
    revision     integer NOT NULL DEFAULT 0,
    base_version integer,
    updated_by   text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
  )`;
  // A participant's unfinished form input on a running instance, kept apart
  // from `instances.body.data` so a save can never leak into guards, data
  // sources, the admin record, or reporting before submit validates it. One
  // row per instance; `step_id` is the step the draft was saved on, and the
  // engine offers the draft only when it still matches the current step.
  await db`CREATE TABLE IF NOT EXISTS instance_drafts (
    instance_id text PRIMARY KEY,
    step_id     text NOT NULL,
    data        jsonb NOT NULL,
    updated_by  text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
  )`;
  // Data lists: the option values of a `"db.list"` data source, held outside the
  // process body so an operator changes them with no publish and no migration.
  // `label` here is the operator-facing name of the list itself, plain text; the
  // per-value label is a LocalizedText and therefore jsonb. Both relations sit
  // outside the audit backbone — they are configuration, not a record of what an
  // instance did, so no append-only rule applies.
  // `columns` declares the extra columns a value of this list carries beyond
  // `value` and `label`: an array of `{ key, label, type }`. It sits on the
  // list rather than in a process body so an operator makes a list
  // table-shaped with no publish, the same property the values themselves
  // already have.
  await db`CREATE TABLE IF NOT EXISTS data_lists (
    list_key    text PRIMARY KEY,
    label       text NOT NULL,
    description text,
    columns     jsonb NOT NULL DEFAULT '[]',
    updated_by  text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
  )`;
  await db`ALTER TABLE data_lists ADD COLUMN IF NOT EXISTS columns jsonb NOT NULL DEFAULT '[]'`;
  // A value is deactivated, never deleted: an instance that already holds one
  // must keep resolving its label (see the `heldValues` rule in host.ts). The
  // cascade therefore only fires when the whole list goes, which the delete
  // guard blocks while any published body references it.
  // `attributes` holds this value's entry per declared column, as a JSON scalar
  // each. Postgres normalizes a jsonb object's key order, so the read side
  // walks the list's `columns` declaration and looks each key up here — never
  // the reverse. Both new columns default to the empty case, so a deployment
  // that predates them needs no backfill.
  await db`CREATE TABLE IF NOT EXISTS data_list_values (
    list_key   text NOT NULL REFERENCES data_lists (list_key) ON DELETE CASCADE,
    value      text NOT NULL,
    label      jsonb NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}',
    active     boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (list_key, value)
  )`;
  await db`ALTER TABLE data_list_values ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'`;
  // Process templates: a reusable authored body a new process seeds from. Its
  // own table for the reason `drafts` has one — a template body in `definitions`
  // would make every read site of that table responsible for excluding it, and
  // a missed one puts a template in the participant's start list. No `version`
  // and no `definition_hash`: a template is never published and no instance
  // pins one, so nothing here reaches the audit backbone. `layout` travels
  // beside `body` so a seeded process opens with its boxes placed. No `label`
  // column either — the body already declares `label` and `description`, and
  // the list route projects them out of it.
  await db`CREATE TABLE IF NOT EXISTS templates (
    template_key text PRIMARY KEY,
    body         jsonb NOT NULL,
    layout       jsonb NOT NULL DEFAULT '{}',
    created_by   text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
  )`;
  // Per-deployment UI-chrome wording. `area` is plain text, not an enum: the
  // later admin/reporting catalog retrofit starts writing `area = 'admin'` rows
  // with no migration here. A row exists only while it overrides something, so
  // clearing a key deletes the row rather than blanking it — unlike
  // data_list_values, which deactivates instead, because a running instance may
  // still hold one. No instance, draft or published body ever reads a UI
  // string, so nothing pins to a row here and deletion stays safe.
  await db`CREATE TABLE IF NOT EXISTS ui_string_overrides (
    area       text NOT NULL,
    locale     text NOT NULL,
    key        text NOT NULL,
    value      text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (area, locale, key)
  )`;
  // Assignment-candidate groups (src/auth/groups.ts), read live by the
  // org.group-members assignment strategy. `members` carries no foreign key,
  // mirroring `auth_users.roles`: an operator may list a member id before that
  // account exists or after it stops existing (group-based-assignment design.md).
  await db`CREATE TABLE IF NOT EXISTS groups (
    group_id text PRIMARY KEY,
    name     text NOT NULL,
    scope    jsonb NOT NULL,
    members  text[] NOT NULL DEFAULT '{}'
  )`;
  // Saved reports (instance-data-tables): a process owner's saved table over
  // instance field values. `query` is jsonb (status/date-range/dataWhere, the
  // same axes `queryInstances` accepts) and `columns` is jsonb (the ordered
  // direct/merge column list), mirroring `data_lists.columns`'s own reason to
  // stay jsonb rather than a normalized shape: the read side always resolves
  // the whole object at once, and the shape stays free to grow with no
  // migration. `owner` carries no foreign key, the same convention
  // `groups.members` and `auth_users.roles` use, so an owner id survives that
  // account's own lifecycle.
  await db`CREATE TABLE IF NOT EXISTS reports (
    instance_report_id text PRIMARY KEY,
    owner       text  NOT NULL,
    process_id  text  NOT NULL,
    name        text  NOT NULL,
    query       jsonb NOT NULL DEFAULT '{}',
    columns     jsonb NOT NULL DEFAULT '[]',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
  )`;
  // A report's viewers/editors: one row per name per list per report, unlike
  // `groups.members`'s single `text[]` column, because a report's access
  // check runs in the opposite direction from a group's — "which reports name
  // me" rather than "read one group's members whole" (design.md "Reports are
  // a new table, not a row shape borrowed from `permission_grants`"). No
  // column distinguishes an id, a role or a group name; a caller checking
  // membership expands a `group_`-prefixed principal through
  // `getGroupMembers` before comparing. Cascades with its report: nothing
  // else ever holds a live reference to a report the way a running instance
  // holds a `data_list_values` row, so nothing needs a deleted report's
  // principal rows to survive it.
  await db`CREATE TABLE IF NOT EXISTS report_principals (
    instance_report_id text NOT NULL REFERENCES reports (instance_report_id) ON DELETE CASCADE,
    list       text NOT NULL,
    principal  text NOT NULL,
    PRIMARY KEY (instance_report_id, list, principal)
  )`;
  // "Reports visible to me" (`listMyReports`) matches the caller's own id,
  // roles and group ids against `principal`, filtered by `list`.
  await db`CREATE INDEX IF NOT EXISTS report_principals_principal_list_idx ON report_principals (principal, list)`;

  await initInstanceAudit(db);
}

/**
 * Tamper-evident instance field audit log (instance-audit-log-chain). A
 * separate owner role holds `instance_audit` and `redact_instance_fields` so
 * the engine's own connecting role can only append (design.md "Who owns the
 * audit relation"): `initSchema` grants that role INSERT/SELECT on the
 * relation and EXECUTE on the redaction function alone, never UPDATE or
 * DELETE.
 *
 * Bootstrap order, each guarded so a cluster that cannot perform a step still
 * boots with the audit log switched off rather than failing every write:
 * pgcrypto, then the owner role plus the two grants only the engine's own
 * connecting role (owning `instances` and schema `public`) can make —
 * CREATE on schema `public` and TRIGGER on `instances` — then the owner's
 * `SET ROLE` membership, then, only once the role exists, the objects
 * themselves created under `SET LOCAL ROLE detent_audit_owner` so the owner
 * role owns them from creation (no `ALTER ... OWNER TO`, which raises on a
 * second run against an already-correct owner).
 */
async function initInstanceAudit(db: SQL): Promise<void> {
  // gen_random_bytes for instance_audit_append's per-row salt (design.md "The
  // chain hashes in SQL"). WITH SCHEMA public matches the append function's own
  // pinned search_path, which calls public.gen_random_bytes explicitly.
  await db`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`;

  const engineRole = (await db`SELECT current_user`)[0].current_user as string;

  // Postgres checks the CREATEROLE attribute before it checks whether the role
  // exists, so a bare duplicate_object guard alone would still raise 42501 on
  // every boot of a least-privileged engine role.
  await db`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'detent_audit_owner') THEN
        CREATE ROLE detent_audit_owner NOLOGIN;
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE WARNING 'detent_audit_owner absent and this role cannot create it; a superuser must run: CREATE ROLE detent_audit_owner NOLOGIN;';
    END $$
  `;

  // Postgres 15 removed PUBLIC's default CREATE on schema public; the owner
  // role needs it to create instance_audit and redact_instance_fields itself
  // below. Guarded the same way: a role without GRANT OPTION on the schema
  // (the devcontainer's postgres superuser always has it) cannot pass it on.
  await db`
    DO $$
    BEGIN
      GRANT CREATE ON SCHEMA public TO detent_audit_owner;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE WARNING 'cannot grant CREATE on schema public to detent_audit_owner; a superuser must run: GRANT CREATE ON SCHEMA public TO detent_audit_owner;';
    END $$
  `;

  // CREATE TRIGGER needs the TRIGGER privilege on `instances`, a privilege
  // distinct from ownership; `instances` is owned by the engine's own
  // connecting role (it created that table earlier in this same function, no
  // role switch yet), so that role — never detent_audit_owner, which does not
  // own `instances` — is the one that can grant it.
  await db`
    DO $$
    BEGIN
      GRANT TRIGGER ON instances TO detent_audit_owner;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE WARNING 'cannot grant TRIGGER on instances to detent_audit_owner; a superuser must run: GRANT TRIGGER ON instances TO detent_audit_owner;';
    END $$
  `;

  // Membership is what lets this role SET ROLE detent_audit_owner below —
  // membership alone does not carry SET on Postgres 16. No ADMIN OPTION:
  // Postgres 16 already gives the creator admin option, and re-requesting it
  // raises invalid_grant_operation (0LP01), which this trap does not catch —
  // harmless, since a role that just created detent_audit_owner already holds
  // admin option and never takes this branch for that reason.
  await db`
    DO $$ BEGIN
      GRANT detent_audit_owner TO current_user WITH INHERIT FALSE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'detent_audit_owner membership missing; the audit log stays inactive until a superuser runs: GRANT CREATE ON SCHEMA public TO detent_audit_owner; GRANT TRIGGER ON instances TO detent_audit_owner; GRANT detent_audit_owner TO <engine role> WITH INHERIT FALSE; then the audit object statements.';
    END $$
  `;

  const [{ audit_owner_exists }] = (await db`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'detent_audit_owner') AS audit_owner_exists
  `) as { audit_owner_exists: boolean }[];
  if (!audit_owner_exists) return; // already warned above; the log stays switched off

  // instance_audit_diff/instance_audit_append/verify_instance_chain are never
  // SECURITY DEFINER (verified by task 5.10), so their owner grants them no
  // privilege beyond what the calling role already holds — they run outside
  // the owner-role block, ordinary CREATE OR REPLACE FUNCTION statements
  // owned by the engine's own connecting role, idempotent on every rerun for
  // that reason. Postgres resolves a plpgsql body's relations at call time,
  // so creating these before instance_audit exists is safe; the triggers
  // below are what actually invoke them.
  //
  // Guarded the same way as the owner-role block below: a connecting role
  // that is not the one that originally created these three (a rotated
  // engine credential, most plausibly) gets "must be owner of function"
  // here, caught rather than crashing initSchema — the existing functions
  // stay in place, unreplaced, and the triggers created below still resolve
  // them by name.
  try {
    await db`
    CREATE OR REPLACE FUNCTION instance_audit_append(
      instance_id text,
      transition_seq bigint,
      field_id text,
      op text,
      value jsonb,
      actor text,
      source text,
      reason text
    ) RETURNS void
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      head_seq bigint;
      head_hash bytea;
      v_seq bigint;
      v_at timestamptz := now();
      v_salt bytea;
      v_value_hash bytea;
      v_prev_hash bytea;
      v_hash bytea;
    BEGIN
      IF strpos(instance_id, E'\\x1e') > 0 OR strpos(instance_id, E'\\x1f') > 0
         OR strpos(field_id, E'\\x1e') > 0 OR strpos(field_id, E'\\x1f') > 0
         OR (actor IS NOT NULL AND (strpos(actor, E'\\x1e') > 0 OR strpos(actor, E'\\x1f') > 0))
         OR (source IS NOT NULL AND (strpos(source, E'\\x1e') > 0 OR strpos(source, E'\\x1f') > 0))
         OR (reason IS NOT NULL AND (strpos(reason, E'\\x1e') > 0 OR strpos(reason, E'\\x1f') > 0))
      THEN
        RAISE EXCEPTION 'instance_audit_append: instance_id, field_id, actor, source and reason must not contain U+001E or U+001F';
      END IF;

      -- ponytail: one index seek per appended row, not per statement; a bulk
      -- migration pays it once per field it rewrites. Cache the head as
      -- audit_head_hash/audit_seq columns on instances when a measured
      -- migration says it costs too much (design.md "Open Questions").
      SELECT ia.seq, ia.hash INTO head_seq, head_hash
      FROM instance_audit ia
      WHERE ia.instance_id = instance_audit_append.instance_id
      ORDER BY ia.seq DESC
      LIMIT 1;

      v_seq := coalesce(head_seq, 0) + 1;
      v_prev_hash := coalesce(head_hash, sha256(''::bytea));

      IF value IS NULL THEN
        v_value_hash := sha256(''::bytea);
        v_salt := NULL;
      ELSE
        v_salt := gen_random_bytes(16);
        v_value_hash := sha256(v_salt || convert_to(value::text, 'UTF8'));
      END IF;

      v_hash := sha256(convert_to(concat_ws(E'\\x1e', instance_id, v_seq, transition_seq,
        field_id, op, coalesce(actor, E'\\x1f'), coalesce(source, E'\\x1f'),
        coalesce(reason, E'\\x1f'), extract(epoch from v_at)::numeric::text), 'UTF8')
        || v_value_hash || v_prev_hash);

      INSERT INTO instance_audit
        (instance_id, seq, transition_seq, field_id, op, value, actor, source, reason, at, salt, value_hash, prev_hash, hash)
      VALUES
        (instance_id, v_seq, transition_seq, field_id, op, value, actor, source, reason, v_at, v_salt, v_value_hash, v_prev_hash, v_hash);
    END;
    $$
  `;

  await db`
    CREATE OR REPLACE FUNCTION instance_audit_diff() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      k text;
      old_data jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.body->'data' END;
      new_data jsonb := NEW.body->'data';
      logged_value jsonb;
    BEGIN
      -- jsonb_object_keys raises on a scalar. data is always a JSON
      -- object through every application write path (instanceSchema
      -- enforces it); a row some other write made this malformed on is an
      -- anomaly no audit entry can meaningfully describe by key, and the
      -- underlying INSERT/UPDATE on instances must still succeed rather
      -- than fail here.
      IF (new_data IS NOT NULL AND jsonb_typeof(new_data) <> 'object')
         OR (old_data IS NOT NULL AND jsonb_typeof(old_data) <> 'object')
      THEN
        RETURN NEW;
      END IF;

      FOR k IN
        SELECT jsonb_object_keys(old_data)
        UNION
        SELECT jsonb_object_keys(new_data)
      LOOP
        IF (old_data->k) IS DISTINCT FROM (new_data->k) THEN
          -- A removed key logs JSON null, distinct from the SQL NULL a
          -- redaction leaves behind (design.md "The chain hashes in SQL").
          logged_value := CASE WHEN new_data ? k THEN new_data->k ELSE 'null'::jsonb END;
          PERFORM instance_audit_append(
            NEW.instance_id, NEW.transition_seq, k, 'set', logged_value,
            nullif(current_setting('detent.actor', true), ''),
            nullif(current_setting('detent.source', true), ''),
            NULL
          );
        END IF;
      END LOOP;
      RETURN NEW;
    END;
    $$
  `;

  await db`
    CREATE OR REPLACE FUNCTION verify_instance_chain(instance_id text)
    RETURNS TABLE (ok boolean, failed_seq bigint)
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      r record;
      prev bytea := sha256(''::bytea);
      computed_hash bytea;
      computed_value_hash bytea;
    BEGIN
      FOR r IN
        SELECT ia.seq, ia.transition_seq, ia.field_id, ia.op, ia.value, ia.actor, ia.source, ia.reason, ia.at, ia.salt, ia.value_hash, ia.prev_hash, ia.hash
        FROM instance_audit ia
        WHERE ia.instance_id = verify_instance_chain.instance_id
        ORDER BY ia.seq
      LOOP
        IF r.salt IS NOT NULL THEN
          computed_value_hash := sha256(r.salt || convert_to(r.value::text, 'UTF8'));
          IF computed_value_hash <> r.value_hash THEN
            RETURN QUERY SELECT false, r.seq;
            RETURN;
          END IF;
        END IF;

        IF r.prev_hash <> prev THEN
          RETURN QUERY SELECT false, r.seq;
          RETURN;
        END IF;

        computed_hash := sha256(convert_to(concat_ws(E'\\x1e', verify_instance_chain.instance_id, r.seq,
          r.transition_seq, r.field_id, r.op, coalesce(r.actor, E'\\x1f'), coalesce(r.source, E'\\x1f'),
          coalesce(r.reason, E'\\x1f'), extract(epoch from r.at)::numeric::text), 'UTF8')
          || r.value_hash || prev);

        IF computed_hash <> r.hash THEN
          RETURN QUERY SELECT false, r.seq;
          RETURN;
        END IF;

        prev := r.hash;
      END LOOP;

      RETURN QUERY SELECT true, NULL::bigint;
    END;
    $$
  `;
  } catch (err) {
    if (!isInsufficientPrivilege(err)) throw err;
  }

  try {
    await withTransaction(db, async (tx) => {
      await tx`SET LOCAL ROLE detent_audit_owner`;

      // Comment (not SQL): the primary key IS this relation's only index —
      // (instance_id, seq) serves both readers, the ordered replay of one
      // instance's chain and instance_audit_append's own chain-head read
      // (design.md "The relation's shape"). No second index follows it.
      await tx`CREATE TABLE IF NOT EXISTS instance_audit (
        instance_id text NOT NULL,
        seq bigint NOT NULL,
        transition_seq bigint NOT NULL,
        field_id text NOT NULL,
        op text NOT NULL CHECK (op IN ('set', 'redact')),
        value jsonb,
        actor text,
        source text,
        reason text,
        at timestamptz NOT NULL DEFAULT now(),
        salt bytea,
        value_hash bytea NOT NULL,
        prev_hash bytea NOT NULL,
        hash bytea NOT NULL,
        PRIMARY KEY (instance_id, seq)
      )`;

      await tx`DROP TRIGGER IF EXISTS instance_audit_insert_trg ON instances`;
      await tx`
        CREATE TRIGGER instance_audit_insert_trg
          AFTER INSERT ON instances
          FOR EACH ROW
          EXECUTE FUNCTION instance_audit_diff()
      `;
      await tx`DROP TRIGGER IF EXISTS instance_audit_update_trg ON instances`;
      await tx`
        CREATE TRIGGER instance_audit_update_trg
          AFTER UPDATE ON instances
          FOR EACH ROW
          WHEN (OLD.body->'data' IS DISTINCT FROM NEW.body->'data')
          EXECUTE FUNCTION instance_audit_diff()
      `;

      // SECURITY DEFINER: the engine's own role holds no UPDATE on
      // instance_audit, and clearing a prior row's value is an UPDATE
      // (design.md "Redaction is its own definer function"). It reads no
      // column off `instances` — the definer role holds no grant there — so
      // its caller passes transitionSeq explicitly. field_ids narrows the
      // clear to the caller-resolved redactable set
      // (redactable-field-flag): this role has no access to `definitions`
      // and cannot resolve FieldDef.redactable itself.
      //
      // Postgres treats a changed parameter list as a new overload, not a
      // replacement of the old one — drop the 4-arg signature explicitly so
      // only the 5-arg one remains.
      await tx`DROP FUNCTION IF EXISTS redact_instance_fields(text, text, text, bigint)`;
      await tx`
        CREATE OR REPLACE FUNCTION redact_instance_fields(
          instance_id text,
          actor text,
          reason text,
          transition_seq bigint,
          field_ids text[]
        ) RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog, public
        AS $$
        DECLARE
          fid text;
        BEGIN
          FOR fid IN
            SELECT DISTINCT ia.field_id
            FROM instance_audit ia
            WHERE ia.instance_id = redact_instance_fields.instance_id
              AND ia.field_id = ANY(redact_instance_fields.field_ids)
          LOOP
            PERFORM instance_audit_append(
              redact_instance_fields.instance_id, redact_instance_fields.transition_seq, fid, 'redact', NULL,
              redact_instance_fields.actor, 'redaction', redact_instance_fields.reason
            );
            UPDATE instance_audit
              SET value = NULL, salt = NULL
              WHERE instance_audit.instance_id = redact_instance_fields.instance_id
                AND instance_audit.field_id = fid
                AND instance_audit.value IS NOT NULL;
          END LOOP;
        END;
        $$
      `;

      // A function created with no explicit ACL carries EXECUTE for PUBLIC;
      // without this revoke, any role able to connect could null another
      // instance's audit values — the one deliberate hole in the append-only
      // property, which belongs to the engine's role alone (design.md "Who
      // owns the audit relation").
      await tx`REVOKE EXECUTE ON FUNCTION redact_instance_fields(text, text, text, bigint, text[]) FROM PUBLIC`;
      // engineRole is captured above via SELECT current_user, before this
      // SET LOCAL ROLE — inside the block current_user reads as the owner
      // role, and granting to current_user here would hand the owner's own
      // privileges to itself while leaving the engine's role with none.
      await tx.unsafe(`GRANT INSERT, SELECT ON instance_audit TO "${engineRole}"`);
      await tx.unsafe(
        `GRANT EXECUTE ON FUNCTION redact_instance_fields(text, text, text, bigint, text[]) TO "${engineRole}"`,
      );
    });
  } catch (err) {
    if (!isInsufficientPrivilege(err)) throw err;
    // detent_audit_owner exists but this role could not assume it (the
    // membership grant above failed and warned already, or a DBA created the
    // role without granting membership) — the relation, both triggers and the
    // redaction function all sit inside this one block, so a cluster that
    // reaches here has none of the four and keeps writing instances with the
    // audit log switched off, exactly as the missing-role case above does.
  }
}

/** Postgres SQLSTATE 42501: a role attempted something its grants do not cover. */
function isInsufficientPrivilege(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { errno?: unknown }).errno === "42501";
}

// Exported (not merely loadInstance-private) because subprocess.ts's return
// handler parses one row read under `FOR UPDATE`, which loadInstance's own
// unlocked SELECT cannot serve.
export const parseInstance = (raw: unknown): Instance =>
  instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);

/** Load one instance by id, or `undefined` if no row matches. */
export async function loadInstance(db: SQL, instanceId: string): Promise<Instance | undefined> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId} LIMIT 1`) as { body: unknown }[];
  return rows.length > 0 ? parseInstance(rows[0].body) : undefined;
}

/**
 * Run `fn` in a transaction, joining one already in progress rather than opening
 * a second. Bun rejects `begin` on a transaction-scoped client ("cannot call
 * begin inside a transaction use savepoint() instead") and exposes `savepoint`
 * only on that client, so its presence is the discriminator.
 *
 * A throw inside a savepoint propagates out of the enclosing `begin` and rolls
 * the whole outer transaction back, so joining never silently contains an inner
 * failure — the caller's all-or-nothing still holds.
 *
 * Every engine write path that could ever be reached from inside another one uses
 * this rather than `begin` directly. Nesting is a *runtime* throw, not a type
 * error, so a direct `begin` is a trap that only fires in production once some
 * caller wraps it. `drainOutbox`'s post-delivery transaction is the exception and
 * stays on `begin`: it is the outermost writer by construction, since the outbox
 * worker runs handlers outside any transaction.
 */
export function withTransaction<T>(db: SQL, fn: (tx: SQL) => Promise<T>): Promise<T> {
  const joinable = db as SQL & { savepoint?: (fn: (tx: SQL) => Promise<T>) => Promise<T> };
  if (typeof joinable.savepoint === "function") return joinable.savepoint(fn);
  return db.begin(fn) as Promise<T>;
}

/**
 * Stamps the instance-audit-log-chain trigger's attribution for every
 * `instances` write the enclosing transaction goes on to make
 * (instance-audit-log-chain design.md "Actor and source arrive through
 * set_config"). `true` scopes both settings to the transaction, not the
 * statement, so `tx` must be the enclosing transaction handle — never the
 * pooled `db` — or the setting is gone before the statement it was meant to
 * attribute. `actor` maps to SQL NULL when unsupplied (a spawned child's
 * creation, a system-driven writeback): passing `undefined` as the bind
 * value would land the four-character text "null" instead of a real NULL,
 * so callers pass `null` here rather than `undefined`.
 */
export async function setAuditAttribution(tx: SQL, actor: string | null | undefined, source: string): Promise<void> {
  await tx`SELECT set_config('detent.actor', ${actor ?? null}, true)`;
  await tx`SELECT set_config('detent.source', ${source}, true)`;
}

/**
 * Mint an event id. UUIDv4 like the other runtime ids — see createInstance's
 * note on the v7 deferral; a third convention would be worse than the one gap.
 */
export function newInstanceEventId(): InstanceEventId {
  return `evt_${crypto.randomUUID()}` as InstanceEventId;
}

/** The `assignment.unresolved` member of the `InstanceEvent` union. */
type AssignmentUnresolved = Extract<InstanceEvent, { kind: "assignment.unresolved" }>;

/**
 * The one statement of an `assignment.unresolved` event's shape. Three sites
 * record one — `transition.ts`'s step entry, `transition.ts`'s creation path
 * and `subprocess.ts`'s child spawn — and each hand-built the whole seven-field
 * literal before `dedup-server-helpers`. Only `id` and `kind` are constant
 * across the three, and those are exactly the two a copy can drift on.
 *
 * Every varying field is a required argument. `instanceId` is the parent's on
 * a step entry and the child's on a spawn; `transitionSeq` is 0 on a creation
 * path, which does not advance it. Nothing is defaulted.
 */
export function makeAssignmentUnresolvedEvent(opts: {
  instanceId: AssignmentUnresolved["instanceId"];
  transitionSeq: AssignmentUnresolved["transitionSeq"];
  version: AssignmentUnresolved["version"];
  stepId: AssignmentUnresolved["payload"]["stepId"];
  reason: AssignmentUnresolved["payload"]["reason"];
  at: AssignmentUnresolved["at"];
}): AssignmentUnresolved {
  return {
    id: newInstanceEventId(),
    instanceId: opts.instanceId,
    transitionSeq: opts.transitionSeq,
    version: opts.version,
    kind: "assignment.unresolved",
    payload: { stepId: opts.stepId, reason: opts.reason },
    at: opts.at,
  };
}

/**
 * Append one runtime event. Takes the transaction handle rather than opening its
 * own: an event must land in the same commit as the state change that caused it,
 * so it cannot survive a rollback and the commit cannot land without it.
 *
 * Ids are random per call, so `ON CONFLICT (id) DO NOTHING` never fires today; it
 * is a backstop against a double-append of one event object, not the mechanism
 * that keeps a replayable emitter honest. Each emitter is guarded by a
 * rows-affected check on the state change it accompanies — createInstance's
 * `RETURNING instance_id`, fireTimer's OCC predicate — so a replay that changed
 * nothing appends nothing. An emitter that ever needs conflict-based idempotency
 * instead would have to derive its id deterministically.
 */
export async function appendInstanceEvent(tx: SQL, event: InstanceEvent): Promise<void> {
  await tx`INSERT INTO instance_events (id, instance_id, transition_seq, kind, event)
    VALUES (${event.id}, ${event.instanceId}, ${event.transitionSeq}, ${event.kind}, ${event})
    ON CONFLICT (id) DO NOTHING`;
}

/** Append several events in one transaction; an empty list writes nothing. */
export async function appendInstanceEvents(tx: SQL, events: readonly InstanceEvent[]): Promise<void> {
  for (const e of events) await appendInstanceEvent(tx, e);
}

/**
 * Create an instance pinned to { processId, version, definitionHash }, at the
 * definition's initialStep, transitionSeq 0, and persist it. Creation is not a
 * transition — no HistoryEntry, no trigger actions — but it is a step entry, so
 * it carries the entry consequences the initial step declares: its timers are
 * armed, and if it is a subprocess step its spawn is enqueued (both inside the
 * INSERT transaction; see below).
 * ponytail: instanceId is UUIDv4; the contract calls for UUIDv7 (time-sortable).
 * transitionSeq already orders history per instance, so upgrade to v7 only when
 * cross-instance time ordering is needed.
 */
export async function createInstance(
  body: ProcessBody,
  opts: {
    processId: ProcessId;
    version: number;
    // Subprocess spawn: a deterministic child id (idempotent spawn), seed data
    // (from the parent's inputMapping), and the parent link. Omitted for a
    // top-level instance (random id, empty data, no parent).
    instanceId?: string;
    data?: Instance["data"];
    parent?: { instanceId: string; stepId: StepId };
    startedBy?: string;
    // A `process.start` action's reporting-only backlink to the instance
    // that started this one. Never set alongside `parent`: the two name
    // different relationships (chain vs. call-and-return).
    chainedFrom?: string;
    // The initial step's already-resolved candidate set. Creation is a step
    // entry, so an assignment-bearing initial step carries candidates — but the
    // caller resolves them (`registry.ts::resolveStepAssignment`), never this
    // function: a resolver is asynchronous and may reach outside the process,
    // which would break the persistence-only remit stated above and, on a
    // subprocess spawn, would run inside an already-open transaction.
    assignment?: Instance["assignment"];
    // Events the caller minted for this creation, appended to the ones this
    // function derives itself (unarmed timers, an enqueued initial spawn). The
    // caller supplies an `assignment.unresolved` here when the resolution above
    // produced no candidate: it must land in the same transaction as the INSERT,
    // and only the caller knows the reason.
    events?: InstanceEvent[];
    // "test" for a draft-test-instances run; omitted (or "published") for an
    // ordinary instance. Threaded into both the jsonb body and the real
    // `kind` SQL column below, which every kind-exclusion predicate filters.
    kind?: Instance["kind"];
  },
  db: SQL = sql,
): Promise<Instance> {
  // Arm the initial step's timers here, atomically with the INSERT — creation is a
  // step entry, and a resting initial wait-state needs its bound. Doing it in a
  // separate post-INSERT UPDATE would leave a crash window that permanently strands
  // the timer (no worker re-arms a next_timer_at=NULL running instance). If
  // resolveAutomatic later transitions off the initial step, the first commit
  // replaces these timers (disarming). Arming reads only the seed data and the
  // system actor, so it stays within createInstance's persistence-only remit.
  // The instance is validated first with no timers and armed against itself, so a
  // deadline on the initial step evaluates over the real seed data and instance
  // projection rather than a stand-in.
  const startedAt = new Date().toISOString();
  const initial = body.workflow.steps.find((s) => s.id === body.workflow.initialStep);
  // Mirrors planStepEntry's derivation (target.terminal ? "completed" :
  // instance.status): a process whose initialStep is terminal — a legitimate
  // shape (e.g. a migration target instances relocate onto, never created
  // from directly) — must not create a permanently-"running" instance that
  // can never complete.
  const seed: Instance = instanceSchema.parse({
    instanceId: opts.instanceId ?? `inst_${crypto.randomUUID()}`,
    processId: opts.processId,
    version: opts.version,
    definitionHash: definitionHash(body),
    currentStepId: body.workflow.initialStep,
    transitionSeq: 0,
    data: opts.data ?? {},
    timers: [],
    ...(opts.parent ? { parent: opts.parent } : {}),
    ...(opts.chainedFrom !== undefined ? { chainedFrom: opts.chainedFrom } : {}),
    status: initial?.terminal ? "completed" : "running",
    startedAt,
    currentStepEnteredAt: startedAt,
    ...(opts.startedBy !== undefined ? { startedBy: opts.startedBy } : {}),
    ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
  });
  const { armed: timers, drops } = armStepTimers(initial, startedAt, body, seed);
  const inst: Instance = { ...seed, timers, assignment: opts.assignment };
  // A timer the initial step declared but arming could not compute a fireAt for.
  // Recorded at seq 0 — creation advances no sequence, and an event records the
  // seq in force rather than advancing it.
  const events: InstanceEvent[] = [
    ...(opts.events ?? []),
    ...drops.map((d) => ({
      id: newInstanceEventId(),
      instanceId: inst.instanceId,
      transitionSeq: inst.transitionSeq,
      version: inst.version,
      kind: "timer.unarmed" as const,
      payload: { timerId: d.timerId, reason: d.reason },
      at: startedAt,
    })),
  ];
  // Creation at a subprocess initial step is a step entry like any other and
  // carries the same consequence: the child is spawned. planStepEntry enqueues
  // this on a transition; creation is not a transition and does not route
  // through the seam, so it restates the one row here rather than teaching the
  // seam a seq-0/no-HistoryEntry mode. Enqueuing inside the INSERT transaction
  // is load-bearing: a post-create enqueue leaves a crash window that strands
  // the instance forever on a wait-state nothing re-enqueues — the same argument
  // that put timer arming here. The coordinates are the ordinary ones with the
  // sequence being 0, so the handler (which derives the deterministic child id
  // from them) needs no special case and nesting composes through the outbox.
  //
  // The accompanying event is what the spawn's ActionOutcome attaches to.
  // Creation writes no HistoryEntry, so an event_id-less row would fall back to
  // the transition record at (instanceId, 0), match nothing, and discard the
  // outcome silently — precisely the failure event_id exists to close.
  //
  // This stays within the store's persistence-only remit: nothing is evaluated,
  // the row is a static function of the initial step and the instance id.
  const subStep = initial?.type === "subprocess" ? initial : undefined;
  const spawn = subStep && {
    id: `action_spawn_${subStep.id}`,
    type: SPAWN_ACTION_TYPE,
    config: { subprocessStepId: subStep.id, parentSeq: 0 },
  };
  const spawnEvent: InstanceEvent | undefined = subStep && {
    id: newInstanceEventId(),
    instanceId: inst.instanceId,
    transitionSeq: inst.transitionSeq,
    version: inst.version,
    kind: "subprocess.spawn-enqueued" as const,
    payload: { stepId: subStep.id },
    at: startedAt,
  };
  if (spawnEvent) events.push(spawnEvent);
  // Bind the object directly: Bun.sql encodes it as a jsonb object. A
  // JSON.stringify(...)::jsonb param would store a jsonb *scalar string* that
  // jsonb_set (used by the transition/writeback) cannot traverse.
  // ON CONFLICT DO NOTHING: a redelivered subprocess spawn (deterministic id)
  // is a no-op; the spawn handler checks prior existence to skip re-driving it.
  // RETURNING is what reconciles the events and the spawn row with that no-op:
  // they are written only inside the transaction whose INSERT actually created
  // the row, so a spawn that inserted nothing records nothing and enqueues
  // nothing, and a replay cannot double them. The conflicting attempt sees zero
  // rows and returns before writing either. That is also why the outbox insert
  // needs no ON CONFLICT: outside the guard, a redelivered child creation would
  // collide on the deterministic outbox key and fail the handler.
  await withTransaction(db, async (tx) => {
    await setAuditAttribution(tx, opts.startedBy ?? null, "creation");
    // resolve_state starts 'pending', not the column's 'idle' default: both
    // callers (startInstance, the subprocess spawn handler) immediately cascade
    // the instance they just created, and a crash between this INSERT and that
    // cascade's first hop would otherwise leave a cascade-eligible initial step
    // unmarked — the same gap applyStepEntry closes for every later commit.
    const inserted = (await tx`INSERT INTO instances (instance_id, transition_seq, body, next_timer_at, resolve_state, kind)
      VALUES (${inst.instanceId}, ${inst.transitionSeq}, ${inst}, ${minFireAt(timers)}, 'pending', ${inst.kind})
      ON CONFLICT (instance_id) DO NOTHING
      RETURNING instance_id`) as unknown[];
    if (inserted.length === 0) return;
    await appendInstanceEvents(tx, events);
    if (spawn && spawnEvent) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, event_id, field_version, actors)
        VALUES (${idempotencyKey(inst.instanceId, inst.transitionSeq, spawn.id)}, ${inst.instanceId}, ${inst.transitionSeq}, ${spawn.id}, ${spawn}, ${spawnEvent.id}, ${inst.version}, ${outboxActorsOf(inst)})`;
    }
  });
  return inst;
}

/**
 * Reserve the next negative sentinel version for a test-instance run against
 * `processId` and persist its frozen body under it. Sentinels are assigned
 * per test instance, never a shared value, so the frozen-at-creation
 * guarantee holds even when several test instances exist for one process.
 *
 * `pg_advisory_xact_lock` scoped to `processId` serializes the read-then-insert
 * against a concurrent "play" creation of the same process's draft: the
 * `(process_id, version)` primary key alone is not enough, since two
 * concurrent transactions could both read the same `MIN(version)` before
 * either commits and then collide on the same computed sentinel.
 */
export async function createDraftSnapshot(processId: ProcessId, hash: string, body: ProcessBody, db: SQL = sql): Promise<number> {
  return withTransaction(db, async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${processId}))`;
    const rows = (await tx`SELECT COALESCE(MIN(version), 0) - 1 AS next FROM draft_snapshots WHERE process_id = ${processId}`) as { next: number }[];
    const version = Number(rows[0]!.next);
    await tx`INSERT INTO draft_snapshots (process_id, version, definition_hash, body)
      VALUES (${processId}, ${version}, ${hash}, ${body})`;
    return version;
  });
}

export class PinMismatch extends Error {
  constructor(instanceId: string, pinned: string, got: string) {
    super(`pin mismatch: instance ${instanceId} pinned ${pinned}, supplied body hashes to ${got}`);
    this.name = "PinMismatch";
  }
}

/**
 * Load an instance and verify the supplied body is the one it is pinned to by
 * recomputing its hash. Refuses on mismatch rather than running against the
 * wrong body.
 */
export async function rehydrate(instanceId: string, body: ProcessBody, db: SQL = sql): Promise<Instance> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  if (rows.length === 0) throw new Error(`instance not found: ${instanceId}`);
  // Bun.sql returns jsonb as text; parse when it does.
  const raw = rows[0].body;
  const inst = instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  const got = definitionHash(body);
  if (got !== inst.definitionHash) throw new PinMismatch(instanceId, inst.definitionHash, got);
  return inst;
}
