<!-- antislop: allow-file synonym-rotation -->
<!-- This document names SQL keywords (ALTER, UPDATE, DELETE), status
     values (faulted, cancelled), and error-class names (Error, fault)
     that share surface forms with plain-English synonyms the linter
     tracks. Renaming a SQL keyword or a status enum value is not an
     option, so this file-wide allow covers only synonym-rotation, the
     same targeted-not-blanket pattern ROADMAP.md already uses. -->

## Context

The runtime record is append-only. `history_entries` and `instance_events`
carry only structural facts. These are step ids, path ids, opaque actor
ids, and field ids inside `ActionOutcome`. Neither ever carries a field value.
The one place a participant's submitted values live is
`instances.body.data`. It is a single jsonb object, overwritten in place
at every writeback.

Two tables added after the original design also carry personal data:
`instance_comments.text` and `instance_attachments.data` (the file
bytes). The roadmap's 2026-07-30 addendum extends this design's scope to
cover both. Neither table has its own retention or erasure path today.

`instances` stores its Instance object as one `body jsonb NOT NULL`
column. It also carries a handful of additive worker-bookkeeping columns
(`resolve_state`, `cancel_sweep_state`, `next_timer_at`, `created_at`),
each added by `ALTER TABLE instances ADD COLUMN IF NOT EXISTS` in
`src/engine/store.ts::initSchema`. `status` and `currentStepEnteredAt`
live inside `body`. The engine reads them elsewhere as
`body->>'status'` and `body->>'currentStepEnteredAt'` (`resolution.ts`,
`timers.ts`, `migration.ts`).

## Goals / Non-Goals

**Goals:**
- Give an operator a way to erase one instance's personal data on demand.
- Bound storage growth with an opt-in automatic sweep.
- Leave the append-only audit trail (`history_entries`, `instance_events`)
  untouched. Both already carry no field value, so redaction needs no
  change there.
- Cover the two tables the roadmap addendum names:
  `instance_comments`, `instance_attachments`.

**Non-Goals:**
- Per-process retention settings. One global `DATA_RETENTION_DAYS`
  covers every process.
- Erasing a `running` instance, automatically or manually. Its `data` is
  live state that guards and actions still read.
- `auth_users.email` erasure. Stage 10 already settled account-level
  erasure with `setDisabled`, not a row delete.
- Data portability or export.
- Historical `data` snapshots. None exist; this project never historizes
  `data` per transition.

## Decisions

**One additive column, `instances.redacted_at timestamptz`.** It joins
the same way as every other additive `instances` column. The statement is
`ALTER TABLE instances ADD COLUMN IF NOT EXISTS redacted_at timestamptz`.
A matching
optional `Instance.redactedAt: timestamp.optional()` joins
`src/schema/definition.ts`. A pre-existing instance without the column
predates redaction. That matches the rule every prior additive column
already follows.

**`InstanceView` gains `redactedAt`, and the admin client gains a
matching call.** `packages/admin`'s instance detail screen renders from
`getInstanceView` (`src/runtime/api.ts`). Its return type,
`InstanceView`, today carries `status` but nothing about redaction.
Neither `InstanceSummary` nor `getInstanceRecord`'s
`Page<InstanceRecordElement>` carries it either. The transition/event
history has no reason to.

`getInstanceView` SHALL add `redactedAt: instance.redactedAt` to its
returned object. `InstanceView` SHALL gain a matching optional field.
`packages/admin/src/api/types.ts`'s mirror of `InstanceView` needs the
same field. `packages/admin/src/api/client.ts` gains a
`redactInstance(instanceId, token)` function, calling `POST
/admin/instances/:id/redact`. This follows the same
one-function-per-action shape its existing `cancelInstance` already
uses.

**`redactInstance(instanceId, db)` in a new `src/engine/retention.ts`.**
One transaction:
1. `SELECT ... FOR UPDATE` on the instance row. This is the same row-lock
   convention `migrateInstances` uses, since the OCC token does not cover
   `data`.
2. No row found: throw `NotFoundError`. This matches every other
   instance-lookup failure in the Runtime API Layer.
3. `body->>'status' = 'running'`: throw a new `InstanceRunningError`
   (`src/errors.ts`), the mirror image of the existing
   `InstanceNotRunningError`. Most operations refuse a non-running
   instance. This one refuses a running one, so it needs its own type,
   not a reused one with an inverted meaning.
4. `redacted_at IS NOT NULL`: return the current row unchanged. A second
   call against an already-redacted instance is a no-op, not an error.
   This matches the outbox's own no-op-on-repeat shape elsewhere in the
   codebase.
5. Otherwise: `UPDATE instances SET body = jsonb_set(body, '{data}',
   '{}'::jsonb), redacted_at = now() WHERE instance_id = ...`. Then two
   deletes, both inside the same transaction as the row lock: `DELETE
   FROM instance_comments WHERE instance_id = ...` and `DELETE FROM
   instance_attachments WHERE instance_id = ...`. `'{}'::jsonb` is a
   static literal, not a bound value. The jsonb-binding rule that applies
   to `subprocess.ts`'s merge-patch case does not apply here.

**Deleting rows, not clearing text/bytea columns.** `instance_comments`
and `instance_attachments` have no natural "empty" form the way `data`
does. A comment's `text` and an attachment's `filename` both carry
personal data with no safe placeholder. A zero-byte attachment with its
original filename would still record a fact: "this participant uploaded
a file named X." A full row delete removes each fact completely.

This departs from the original design's "anonymize in place, never delete
a row" instinct for `instances`. That instinct applies to the audit
backbone; `instance_comments` and `instance_attachments` sit outside it.
Nothing else references a comment or attachment row by id.

**Automatic sweep as a fourth worker, gated by `DATA_RETENTION_DAYS`.**
`startRetentionSweep(db, days)` in `retention.ts` follows the same
`pollForever` helper `startOutboxWorker`, `startResolutionWorker`, and
`startTimerScheduler` already use.

`startEngine` (`src/engine/host.ts`) reads
`process.env.DATA_RETENTION_DAYS`. An existing deployment that upgrades
without setting the variable keeps its current behavior. No default
value exists, and nothing is ever erased.

An operator who sets the variable must give it a positive integer. If
it fails to parse that way, `startEngine` throws at startup. No worker
starts. This is a deliberate escalation past every other worker's own
tolerance for a bad input.

`MAX_ATTACHMENT_BYTES` and similar env vars fall back to a default on a
bad value. This variable gates a destructive, irreversible action
instead, with no default of its own. Silently not starting the sweep
would leave an operator believing retention is active when it is not.
Failing the whole engine start surfaces the mistake instead.

Each sweep tick selects up to 500 instance ids at a time (`BATCH = 500`
in `retention.ts`). It does not select an unbounded set in one query.
Instead it pages by `instance_id` with a keyset cursor. This is the
same way `migrateInstances` and `findOrphanKeys` already page their own
scans.

The selection matches three conditions: `body->>'status' IN
('completed', 'cancelled')`, `redacted_at IS NULL`, and
`(body->>'currentStepEnteredAt')::timestamptz` before a cutoff. The
cutoff is `now() - make_interval(days => $days)`. The worker calls
`redactInstance` once per id, and pages through every eligible batch
each tick, not just the first. A failure on one id does not stop the
rest of the batch, the same per-row isolation `migrateInstances` and
`findOrphanKeys` already use.

`startRetentionSweep` runs on a one-hour interval
(`pollForever(tick, 60 * 60 * 1000)`), unlike the outbox and timer
workers' 500ms. A retention sweep is housekeeping, not
latency-sensitive delivery. An hourly tick keeps the added database
load low, while still catching a newly eligible instance within the
same day.

**`faulted` instances stay out of the automatic sweep.** A fault is an
anomaly, not a normal completion. An operator may still need to inspect
it. The manual route below still reaches a `faulted` instance. An
erasure request naming one does not wait for a fix.

**Manual route: `POST /admin/instances/:id/redact`.** Added to
`src/http/admin-routes.ts`, gated by the existing `ADMIN_ROLE`
(`requireRole`). It follows `handleAdminRunMigration`'s shape: resolve
the actor, check the role, call the engine function, map its result.

`InstanceRunningError` gets one new entry in `http/errors.ts`'s
`MESSAGE_ERRORS` table, mapped to 409 with type `instance-running`. This
mirrors `InstanceNotRunningError`'s existing 409 mapping in shape: a
typed precondition failure, message-bearing, no issues array. It does
not mirror it in meaning. The two errors report opposite preconditions.

**Admin UI: one new action, one new badge.** `packages/admin` gains a
"Redact data" action on its instance detail screen. It sits next to the
existing Cancel action. The new action shows only when status is not
`running`. It disables once `redactedAt` already holds a value.

Its confirmation dialog states plainly that the action clears the
instance's data, comments, and attachments permanently. Once redacted,
the screen shows a "Data redacted on `<date>`" badge. This mirrors
`admin-users`' disabled badge for a comparable irreversible state.

## Risks / Trade-offs

- **Deleting comment/attachment rows takes them out of any future
  investigation.** → Accepted: both tables exist to carry
  potentially-personal content. Erasure has to delete that content, not
  soften it. The transition/event history stays intact. It still
  answers "who did what, when."
- **A wrong `DATA_RETENTION_DAYS` value erases data sooner than
  intended.** → No default value at all. An operator must set it
  deliberately.
- **A non-positive-integer `DATA_RETENTION_DAYS` value goes unnoticed.**
  An operator could believe retention is active. It is not. →
  `startEngine` throws at startup instead of silently skipping the
  sweep. The engine stays down until an operator fixes or removes the
  value.
- **The sweep and a concurrent manual redact race on the same
  instance.** → Both use the same `redactInstance` transaction. It holds
  a row lock, plus an idempotent no-op on an already-redacted row. The
  race resolves to one winner and one silent no-op, never a duplicate
  delete or a partial state.
- **A long-running sweep tick competes with the outbox/timer workers for
  database connections.** → Same shape as the existing three workers.
  This design introduces no new concern here.

## Migration Plan

1. Add the `redacted_at` column and `Instance.redactedAt` field. This is
   additive; it needs no backfill, since `NULL` correctly means "not
   redacted."
2. Ship `retention.ts`, the new route, and the admin UI action together.
   None is useful without the others.
3. `DATA_RETENTION_DAYS` stays unset by default. An operator who wants
   the automatic sweep sets it, as a positive integer, after this
   change deploys. That is a deliberate, separate action, not a
   migration step. Setting it to anything else keeps the engine from
   starting at all. An operator finds out immediately, not after a
   silent no-op.
4. Rollback: unset `DATA_RETENTION_DAYS` to stop the sweep. The column
   and the manual route can stay. Neither is destructive to leave in
   place.

## Open Questions

None outstanding. The approved design
(`docs/superpowers/specs/2026-07-30-data-retention-deletion-design.md`)
already settled most open questions. This document adds the
`instance_comments`/`instance_attachments` extension the roadmap's
addendum requires.

It also adds three points a source-code review surfaced. The approved
design did not address any of them. `InstanceView` needed a new field
for the admin UI to read. The sweep needed an explicit batch size and
interval. A misconfigured `DATA_RETENTION_DAYS` needed a fail-loud
behavior instead of a silent no-op.
