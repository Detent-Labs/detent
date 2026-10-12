# Design

## Context

The resolution, retention and outbox workers poll every 500 ms per tenant.
See proposal.md for the cost they carry. Three facts shape the fix.

- `instances.status` is already a generated column over `body->>'status'`. A
  claim can read it without detoasting the body.
- Since `fix-outbox-lease-and-dead-letter`, the 30 s claim lease caps one outbox
  batch. A row reached after the lease starts no handler. The audit's 500 s and
  50 minute figures for B-8 no longer hold. A hung target still costs every
  later tenant up to 30 s per tick.
- `persistence` states that a spec asserts no query plan. The plan checks below
  are tests and impose nothing on the spec.

## Measurements

All numbers come from one seeded database on Postgres 18.6. It holds 300,000
instances with a 3 KB body each: 100,000 `completed` + `pending`, 150,000
`completed` + `idle`, 40,000 `running` + `idle` and 10,000 `running` +
`pending`. Each query ran as the code issues it, under `EXPLAIN (ANALYZE,
BUFFERS)`.

| Finding | Query | Before | After |
|---|---|---|---|
| B-6 | resolution claim | 1119.6 ms, 290,000 rows filtered | 10.9 ms, 0 rows filtered |
| B-7 | retention sweep, nothing eligible | 256 ms (133,339 unredacted rows) | 0.36 ms |
| B-7 | same, `status` column + `(instance_id)` partial index | 341 ms | rejected |
| B-11 | admin outbox list, page 1, 500,000 rows | 52 ms, parallel seq scan | 0.07 ms |
| B-11 | same, deep page | 79 ms | 0.04 ms |
| B-11 | same, `status = dead-letter` filter | 6.1 ms | 1.7 ms |

A predicate on the `status` column with a partial index alone does not help
the sweep. The cost sits in the timestamp comparison on the body. The index
must key on the entry time.

## Goals / Non-Goals

**Goals:**

- The claim, the sweep and the outbox list cost what is live or eligible. They
  no longer cost what the engine ever stored.
- A slow tenant delays no other tenant's tick.

**Non-Goals:**

- PERF-1 (`LISTEN`/`NOTIFY` or one cross-tenant claim) stays open. The
  resolution and timer loops keep their 500 ms cadence.
- No time budget per tenant and no environment variable for the bound.
- The outbox claim order stays as it is. `RETURNING` does not follow
  `created_at`, and no part of this design relies on claim order.

## Decisions

**D1. Clear the mark where a commit ends the run.** `applyStepEntry` writes
`ELSE 'idle'` for a status other than `running`, where it wrote
`ELSE resolve_state`. `markFaulted` sets `resolve_state = 'idle'` in its flip.
The audit named four writers. `markFaulted` is a fifth. It left a `faulted`
instance `claimed` for good after a looping cascade.

Alternative: a `CHECK (status = 'running' OR resolve_state = 'idle')`
constraint. It would make any future writer fail loudly. It needs a `DO`
block, since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`. Tests cover every
writer instead.

**D2. The claim reads the column and a partial index.** The claim filters on
`status = 'running'` and orders by `instance_id`. A new index serves it. It is `instances_resolve_open_idx`, over
`instances (instance_id)` for rows where `resolve_state` is not `idle`. The index replaces `instances_resolve_idx`, since it covers every
query the old one served. The new name matters. `CREATE INDEX IF NOT EXISTS`
leaves an index of an existing name alone. The `DROP` stays in `initSchema`
for good, as the three expression-index drops do.

**D3. Clear stale marks inside `initSchema`, after the index exists.** The
statement `UPDATE ... WHERE resolve_state <> 'idle' AND status <> 'running'`
runs after the partial index and the `status` column exist. The first run on
an existing database rewrites the stale rows once. Every later run reads the
partial index, which holds the live marks only, so the statement costs
nothing.

**D4. The retention sweep keys on entry time.** The index covers rows with a
`NULL` `redacted_at` and a `completed` or `cancelled` status. Its key is `COALESCE(body->>'currentStepEnteredAt',
started_at)`, then `instance_id`. It names the `status` and `started_at`
columns, as `persistence` requires wherever a column exists.
`currentStepEnteredAt` has no column, so it stays a jsonb
expression. A new generated column would rewrite the table once and would add
a seventh promoted scalar.

The sweep compares the text with a cutoff string built in SQL, in the same
fixed-width UTC form as `Date.toISOString()`. Text order equals time order,
because every writer of `currentStepEnteredAt` and `startedAt` emits
`toISOString()`. The `started_at` column already relies on this.

The keyset is `(entry, instance_id)`, ascending. A failed redaction stays at
the front of the next tick. It never blocks the batch behind it.

`instances_redacted_idx` goes away. It indexes `redacted_at` over
`WHERE redacted_at IS NULL`, so every unredacted row sits in it. With
retention off, that means every row. Its comment claimed the opposite.

**D5. No retention interval.** The brief suggested minutes in place of 500 ms.
With D4, a pass over nothing eligible costs 0.36 ms. A slower interval adds
nothing the index does not already give.

The retention loop keeps its cadence. The PERF-1 entry in `docs/decisions.md`
gets no sentence. A 5 minute interval stays a one-line edit. It would matter
only if two idle queries per second per tenant start to hurt, which is
PERF-1's concern.

**D6. One drain per tenant, at most eight at once.** `eachTenant` keeps a set
of tenant keys whose drain still runs. A tick walks the list. For each tenant
not in the set, the tick waits for a free slot. The cap is
`TENANT_TICK_CONCURRENCY = 8`. The tick then adds the key and starts the drain
without awaiting it. The drain removes its key when it ends. Its own `catch` logs the
`tenant tick skipped` warning as today. A tenant listed after a slow one
starts in the same tick.

Alternative: a pool over the list that awaits every drain before the next
tick. Under one hung tenant, that tick lasts as long as the hung drain, up to
the 30 s lease. A second tenant's next tick then starts 30 s late, which
matches the serial loop. The chosen shape couples no tenant to another.

Single-tenant mode has one key. One drain runs at a time, and the next one
starts at the first tick after the drain ends.

Alternative: a time budget per tenant and tick. It needs threading into
`drainOutbox`, and the lease already bounds a batch.

**D7. The outbox list index.** `outbox_created_idx ON outbox (created_at DESC,
idempotency_key DESC)`. It serves the unfiltered list and its keyset page. A
status-filtered list keeps its speed, as the table shows.

## Risks / Trade-offs

- [A drain outlives `stop()`] → Today's tick also finishes after `stop()`. The
  `engine-poll-loop-consolidation` spec already lets an in-flight tick
  complete. A detached drain behaves the same.
- [Nine or more slow tenants block a tick's later tenants] → The wait for a
  slot ends when any drain ends. The lease bounds each drain.
- [Text comparison of timestamps] → A hand-edited body with a non-UTC string
  would sort wrongly. No writer produces one, and `started_at` carries the
  same assumption.
- [The first `initSchema` rewrites stale marks] → One `UPDATE` over the stale
  rows, once. On a database with millions of finished instances it takes
  seconds and locks only its own rows.

## Migration Plan

`initSchema` is idempotent and carries the whole migration. It creates the
three indexes, clears stale marks and drops the two old indexes. Order
matters. The clear runs after the `status` column and the partial index
exist. To roll back, deploy the previous release. It recreates
`instances_resolve_idx` and `instances_redacted_idx` on its own start.

## Open Questions

None. The owner settled the three questions of the brief on 2026-10-12.
