## Context

`src/engine/migration.ts::migrateOne` currently refuses to migrate an instance
that has *any* outbox row with `status <> 'delivered'` (the existing
in-flight-actions check): it appends a `migration.skipped` event with reason
`pending-actions` and leaves the instance pinned on its source version until
the outbox fully drains. This is documented in `CLAUDE.md` under "Decided,
not yet built" as a known gap, closed for now by skipping rather than
reconciling, "revisit only if `pending-actions` skips prove common."

This is proactive roadmap work, not a response to an observed incident — no
`pending-actions` pileup has been reported.

## Goals / Non-Goals

**Goals:**
- Let migration proceed immediately in the case that actually matters (a
  `pending`, or abandoned-`claimed`, outbox row).
- Reconcile that row's eventual writeback so the async result lands on the
  *target* version's field id instead of being silently orphaned or lost.
- Still defer the instance when a delivery is genuinely in flight (an
  active-lease claim), because nothing done to a stored row can retroactively
  fix a writeback a live worker has already computed in memory.

**Non-Goals:**
- **Eliminating the skip entirely.** A `claimed` row with an active lease
  still blocks migration for that instance (narrower than today, not absent).
- **Lazy/chain-walked remap at delivery time** (composing the field mapping
  from the `migration_plans` chain on the fly). Remapping happens eagerly, in
  the same transaction as the migration event, once per hop — see "Lamination
  stamp" below for why this stays correct across several hops.
- **Fixing the pre-existing zombie-worker/lease-heuristic risk in general.**
  A lease-expired-but-not-actually-dead worker was already an accepted risk
  in `outbox.ts` before this change (handler idempotency on the UUIDv5 key is
  the real once-guarantee, per its own header comment). This change adds one
  new safeguard against *that* risk's interaction with migration specifically
  (the delivery-side version fold, below) but does not change lease/backoff
  semantics generally.
- **Reconciling `transforms`.** Migration's `transforms` are data-value
  computations declared against the target catalog; they have no bearing on
  an `Action.output` target *id*, which is either carried by identity or
  renamed via `fieldMap` — never derived through a transform expression. Only
  `fieldMap` participates in the remap here.
- **A new `InstanceEvent` kind for the remap itself.** See "Audit surface"
  below.
- **Any change to `MAX_ATTEMPTS`, backoff, or `CLAIM_LEASE_MS`.**

## Decisions

### Eligibility partition

`migrateOne`'s in-flight check splits outbox rows for the instance into two
groups instead of a single "any undelivered row blocks" check:

- **Live-claimed** — `status = 'claimed'` and `claimed_at >= now() -
  CLAIM_LEASE_MS`. A worker may be mid-handler-execution right now, with the
  source version's field ids already baked into its in-memory `ClaimedRow`
  snapshot; nothing done to the stored row can retroactively fix that
  computation. This still skips the instance with reason `pending-actions`
  (same event, narrower trigger condition).
- **Safe** — `status = 'pending'`, or `status = 'claimed'` with an expired
  lease (abandoned/crashed worker; the next drain re-claims and re-reads the
  row fresh from the DB, so a remap applied now is visible to it). Eligible
  for remap-in-place.

### Lock ordering

`drainOutbox`'s delivery transaction (`tx2` in `outbox.ts`) locks the outbox
row first (the `status='claimed'→'delivered'` CAS), then the instance row
(the writeback `UPDATE instances ...`), within one transaction. `migrateOne`
today locks only the instance row. Adding outbox-row locking to `migrateOne`
must preserve the same order — **outbox rows before the instance row** — or
concurrent migration and delivery can deadlock. `migrateOne` now:

1. Locks this instance's outbox rows first: `SELECT ... FROM outbox WHERE
   instance_id = $id AND status <> 'delivered' ORDER BY idempotency_key FOR
   UPDATE` (inside the same transaction as everything else in `migrateOne`).
2. Partitions them per "Eligibility partition" above.
3. If any row is live-claimed: skip as today, release locks on commit.
4. Otherwise: locks and reads the instance row as today, and proceeds.

`drainOutbox`'s claim step (`tx1`, the `FOR UPDATE SKIP LOCKED` batch claim)
is unaffected — `SKIP LOCKED` means it simply skips any row `migrateOne`
currently holds, rather than blocking, so there is no new contention there.

New index: `outbox` has no index on `instance_id` today (only the PK on
`idempotency_key` and `outbox_claim_idx (status, next_attempt_at)`), so both
the existing in-flight check and the new locking query would sequentially
scan. Add:

```sql
CREATE INDEX IF NOT EXISTS outbox_instance_idx ON outbox (instance_id)
```

### Remap computation

For each safe row, `action.output`'s target field ids are rewritten using the
same snapshot-based `fieldMap` image `remapData` already uses for `data` —
computed once from the full map, never applied as sequential renames (so an
`A↔B` swap resolves correctly instead of collapsing through an intermediate
state). A target id present as a `fieldMap` key is replaced by its image;
everything else is retained by identity, exactly matching `remapData`'s "keep
every key that is not a rename source" rule.

An identity-retained id can point at a field the target catalog no longer
declares at all (an outright removal, not a rename). The chosen behavior is
**orphan write-through**, matching `remapData`'s existing documented
philosophy ("a retained orphan is safe ... and dropping it would destroy
data"): the eventual delivery writes under that now-orphaned id rather than
being suppressed. It is inert (no guard/view reads an undeclared id) and
discoverable later via the existing `findOrphanKeys` tooling. This keeps one
consistent answer to "what happens to a value keyed by a field id the target
doesn't declare," whether the value arrived synchronously (already in the
snapshot at migration time) or asynchronously (arrives later via outbox
delivery) — no new suppression path, no new event kind, the delivery just
records its ordinary `succeeded` `ActionOutcome`.

**Alternative considered:** suppress delivery for an orphaned target id
(record a dropped writeback instead of writing through). Rejected — it
introduces a second, inconsistent answer to the "value targets an undeclared
field" question depending on whether the value arrived synchronously
(migration's own data remap, which always writes through) or asynchronously
(this remap), for no operational benefit over the existing orphan-inspection
tooling.

### Lamination stamp

New column `outbox.field_version integer`, stamped at enqueue time to the
instance's version at that moment (every `INSERT INTO outbox` site sets it:
`src/engine/store.ts` create-time spawn insert, `src/engine/transition.ts`'s
`applyStepEntry` general insert, and its timer-fire insert). `migrateOne`
bumps it to `toVersion` whenever it remaps a row.

Under correct operation this is an invariant, not a runtime branch: because
`migrateOne` locks *all* of an instance's outbox rows in the same transaction
as the instance's own migration, every row for that instance stays in
lock-step with the instance's version — a row enqueued after a migration is
already stamped with the new version by its own insert, and a row that
predates the migration gets bumped atomically alongside it. So `field_version`
must equal `fromVersion` whenever `migrateOne` is about to remap a row; this
also closes the "row that missed one migration" concern for a row surviving
several hops, since each hop re-stamps it to the version it just moved past.

A mismatch is therefore a "should never happen" canary, not a case to design
graceful handling for. `migrateOne` already has a precedent for exactly this
class of problem: a `definitionHash` pin mismatch on the instance itself just
`throw`s, landing the instance in the `failed` bucket with no event. A
`field_version` mismatch is treated identically — throw, land in `failed`, no
new skip-reason enum value, no new event kind.

### Delivery-side version fold

Closes the residual race: `migrateOne`'s "abandoned" classification is a
lease-expiry heuristic, not a certainty. If the claiming worker wasn't
actually dead, it can still finish and call `tx2` *after* `migrateOne` already
remapped the row and migrated the instance — using a `patch` it computed in
memory from the *old* field ids, before any of this happened.

`ClaimedRow` (the snapshot `tx1`'s claim step returns) gains `field_version`.
`tx2`'s instance-writeback `UPDATE instances SET body = ... WHERE instance_id
= ... AND status = 'running'` gains one more predicate: `AND
(body->>'version')::int = ${row.field_version}`. If the instance has since
migrated, this predicate fails, `affected` stays 0, and it folds directly into
the suppression accounting that already exists (`suppressed = keys.length > 0
&& affected === 0`, recorded on the `ActionOutcome` as today) — no new status.
Same idiom already used throughout this codebase ("gated on running in the
same UPDATE, no TOCTOU"): the race isn't prevented, its consequence is made
harmless.

### Audit surface

No new `InstanceEvent` kind for the remap itself. Unlike
`migration.transform-dropped` (whose drop reason depends on a CEL
expression's runtime evaluation and cannot be recomputed later), a field-id
remap is a pure, deterministic function of the migration plan's `fieldMap`,
which is immutable and permanently retained in `migration_plans`. An auditor
can reconstruct "why did this action's output land under field X" from the
instance's own `transitionSeq`/version history (recorded via the existing
`cause: "migration"` `HistoryEntry`) plus that plan's stored `fieldMap` — the
same reasoning that makes `timer.unarmed`/`migration.transform-dropped`
necessary (their facts are *not* reconstructable) argues against inventing a
parallel one here.

## Risks / Trade-offs

- **[Trade-off] Orphan write-through, not suppression.** A pending action
  targeting a field the target version removed outright still writes,
  landing under an orphan key. Accepted for consistency with `remapData`'s
  established policy; recoverable via `findOrphanKeys`.
- **[Risk, pre-existing] Lease-based "abandoned" classification is a
  heuristic.** A slow-but-alive worker can still race a migration's remap.
  Mitigated, not eliminated, by the delivery-side version fold: the
  consequence becomes a harmless suppressed writeback instead of data landing
  under a stale field id.
- **[Trade-off] `migrateOne` now takes additional row locks (outbox rows)
  per instance.** Slightly larger lock footprint per migration transaction;
  bounded by one instance's own outbox rows, and ordered to avoid new
  deadlocks against `drainOutbox`.

## Migration Plan

Schema (`src/engine/store.ts`, idempotent `ALTER TABLE`/`CREATE INDEX IF NOT
EXISTS`, matching the file's existing style):

```sql
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS field_version integer;
CREATE INDEX IF NOT EXISTS outbox_instance_idx ON outbox (instance_id);
```

Backfill for rows that predate this change: because the *old* behavior always
skipped migration entirely whenever any pending/claimed row existed, every
outbox row present at deploy time necessarily belongs to an instance still on
the exact version that enqueued it — no migration has ever been able to pass
it by. So the backfill is exact, not a best-effort guess:

```sql
UPDATE outbox SET field_version = (
  SELECT (body->>'version')::int FROM instances WHERE instances.instance_id = outbox.instance_id
) WHERE field_version IS NULL;
```

Code changes: `src/engine/migration.ts` (`migrateOne`'s in-flight check,
lock ordering, remap computation, lamination guard), `src/engine/outbox.ts`
(`ClaimedRow` gains `field_version`, `tx2`'s writeback predicate), the three
`INSERT INTO outbox` sites (`store.ts`, `transition.ts` ×2) each add
`field_version`.

Rollback: revert the four touched files and drop the column/index. No
instance data is destroyed by rolling back (orphan-retained keys are
harmless either way); any instance migrated under the new eager-remap
behavior stays validly migrated.

## Open Questions

None outstanding — eligibility partition, lock ordering, remap/orphan
policy, the lamination guard's failure mode, the delivery-side fold, and the
audit-surface decision all converged during design review (see "Decisions"
above).
