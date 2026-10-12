# Design

## Context

See `proposal.md` for the reasons. All code sits in `drainOutbox`
(`src/engine/outbox.ts`). One pass has three parts. A claim `UPDATE` leases up
to 100 rows and adds one to each `attempts`. A loop then runs each handler off
the lock, raced against a deadline. A second transaction (tx2) applies the
result in a compare-and-set (CAS) on `status = 'claimed'`.

Three facts shape the fix:

- The lease check in the claim reads `claimed_at < now() - leaseMs`. Every row
  of a batch carries the same `claimed_at`, so the lease for row 100 ends when
  the lease for row 1 ends.
- `deliverFn` is raced, never cancelled. After the deadline fires, the handler
  still runs, and its late result is dropped.
- A reclaim adds one to `attempts` and nothing else changes it except tx2 and
  an operator requeue. The count therefore names one claim.

## Goals / Non-Goals

**Goals:**

- A worker starts no handler once the lease from its claim has elapsed. Any
  overlap of two runs of one row shrinks from a whole batch of rows to the
  one handler that was in flight at the lease end.
- A worker that lost its row changes nothing.
- A row whose tx2 fails on every run reaches the dead letters.
- Every retry schedule is finite and short enough to matter.

**Non-Goals:**

- Cancelling a handler. The deadline race stays as it is, so a handler that
  starts inside the lease and runs past it can overlap a peer's run of the
  same row. The idempotency key guards that case, as the spec says.
- Moving the lease to a heartbeat or a lease-renewal column.
- Changing `LIMIT 100`, the lease length, or the per-tenant worker loop
  (`bound-worker-scan-costs` owns the worker loop).
- Making the writeback itself retryable inside the pass.

## Decisions

### 1. The deadline is the lease that remains

Take `performance.now()` just before the claim `UPDATE`. A row's deadline is
`leaseMs - (performance.now() - claimStart)` when its turn comes. The database
stamps `claimed_at` inside the `UPDATE`, after `claimStart`. So the worker's
deadline always ends at or before the instant a peer may reclaim, whatever the
latency to the database. A monotonic clock keeps the figure right if the wall
clock steps. The database clock and the worker clock never meet.

Alternative: return `claimed_at` and compute against `Date.now()`. That mixes
the database clock with the worker clock, so skew between two hosts moves the
deadline past the reclaim. Rejected.

Alternative: claim one row at a time. That removes the batch lease, but it
costs a round trip per row, and a `backoff: "none"` row would come back inside
the same pass. The owner kept `LIMIT 100` (2026-10-12).

### 2. A row whose lease ran out is released unstarted

When the remaining lease is zero or less, the worker runs no handler. It
releases the row:

```sql
UPDATE outbox SET status = 'pending', claimed_at = NULL, attempts = ${attempts - 1}
WHERE idempotency_key = ${key} AND status = 'claimed' AND attempts = ${attempts}
```

`next_attempt_at` stays, and it is already in the past, so the row is due at
once. The refund matters. Without it, a long hang at row 7 spends one attempt
on every row behind it, and a healthy row dead-letters having never run.

The release sits inside the per-row error boundary. If it throws, the row stays
`claimed` and the old rule applies: reclaim after the lease, at the cost of one
attempt.

A row that returns to `pending` is taken by the next pass, which runs every
500 ms. It does not wait for a backoff.

### 3. tx2 matches its own claim

All three tx2 statements gain `AND attempts = ${attempts}`. `attempts` is the
value `RETURNING` gave the worker. A peer's reclaim raises it, so a late worker
matches zero rows:

- delivered branch: the existing `cas.length === 0` return already skips the
  writeback and the outcome.
- dead-letter branch: the same return applies.
- transient branch: the statement has no return check today, and none is
  needed. A zero-row update is the right result.

Alternative: match on `claimed_at`. It is equal for the whole batch, so it does
not name a claim. Rejected.

The release in decision 2 lowers `attempts` by one. A peer's claim after the
release raises it back to the old value. The releasing worker never touches the
row again in this pass, so no stale statement can match.

### 4. A row past its cap dead-letters without a run

After parsing the action, before the lease test of decision 2 and before any
handler, test `attempts > maxAttemptsFor(action)`. This test runs first
because it needs no handler time, and the CAS of decision 3 makes it safe when
a peer already holds the row. A row can reach that state only through
claims that did not finish: tx2 threw, or the worker died. The worker then
sends the row through the dead-letter CAS of decision 3, with
`attempts = maxAttemptsFor(action)` and `last_error = 'abandoned after N
attempts'`, then appends the `dead-letter` outcome and logs, as the existing
dead-letter branch does. The claim itself keeps its shape, and no SQL pre-pass
exists (owner, 2026-10-12).

With `maxAttempts = 5`, a row whose tx2 always throws runs the handler on
attempts 1 to 5, stays `claimed` each time, and dead-letters at claim 6. Each
step takes one lease (30 s), so the row ends in about 2.5 minutes.

Alternative: dead-letter inside the tx2 `catch`. That `catch` is the error
boundary of the whole row, and the spec forbids a second write there because it
could race an aborted tx2.

### 5. The writeback path is one element

`jsonb_set(body, ARRAY['data', ${fid}::text], ...)` replaces the string
`{data,${fid}}` cast to `text[]`. A parameter is one array element whatever it
holds. The comment "fieldId is a validated field_<uuid>" is wrong, because
`fieldId` checks only the prefix, so it goes.

### 6. The retry bounds

`retryPolicy.maxAttempts` becomes `z.number().int().min(1).max(20)`. The
exponential branch returns `Math.min(base * 2 ** (attempts - 1),
Math.max(base, BACKOFF_CAP_MS))`, with the cap at one hour. A base above one
hour is the author's own choice and stays. The fixed and none branches stay as
they are.

With 20 attempts and a one-second base, the delay reaches the cap at attempt
13, and the whole schedule ends within about 8 hours. No row waits for years.

The bound sits in Zod, in `definition.ts`. `definition-contract` gives two
criteria for the placement. A hand-written body must not bypass the rule: a
Zod bound holds for every body that parses, so it meets this one. A rule may
live in the schema when no published body can violate it. No deployment
exists, no stored body pins a version, and `examples/` stays at 5 or less, so
no body can violate the bound. `authoring-invariants.md` warns that a
tightened refinement strands a pinned instance. At this stage none exists.

## Risks / Trade-offs

- [A handler that outlives its deadline still runs to completion] → Unchanged.
  The idempotency key is the guard, as the spec says.
- [A pass of 100 slow rows now releases the tail every pass] → The tail comes
  back the next 500 ms tick, at no cost in attempts. A throughput limit exists
  on a hung target, and `bound-worker-scan-costs` covers the tenant loop.
- [A row behind a hung row is no longer delivered in the same pass] → The hung
  row spends the whole lease, so the row behind it is released and goes out on
  the next tick. The old pass spent one lease per hung row, so the new pass is
  never slower. The test at `test/outbox.test.ts:861` expects the same-pass
  delivery and changes with this decision (task 1.3).
- [A handler that starts with almost no lease left runs past it] → It is
  abandoned at the lease end, like any slow handler, and a peer may run the
  row at the same time. A floor on the remaining lease would shrink the window
  but cannot close it, because handler time is unknown.
- [A `maxAttempts` above 20 in a stored draft] → The draft fails to parse on
  load. No such draft ships, and the studio's JSON surface reports the Zod
  message.
- [The abandoned dead-letter loses the writeback of the last run] → The
  external effect ran, and the operator sees `last_error` in the admin
  outbox. A requeue resets `attempts` to 0.

## Migration Plan

No data migration. The schema change takes effect on the next parse. A row
already `claimed` at deploy time follows the new rules from its next claim.
Rollback is a revert of the commit.

## Open Questions

None.
