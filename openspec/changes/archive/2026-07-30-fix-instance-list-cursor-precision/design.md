## Context

`listInstances` (`src/runtime/api.ts`, roughly line 743) keyset-paginates
newest-first. It orders by `(created_at, instance_id)` descending. Its
cursor comes from
`encodeCursor([new Date(last.created_at).toISOString(), last.instance_id])`.

Bun's Postgres driver returns a `timestamptz` column as a JS `Date`. A
JS `Date` truncates to millisecond precision at construction time. An
empirical check during this investigation confirmed the direction.
Postgres's own `.100999+00` and `.100001+00` both convert to the same
`Date`, `.100Z`. The conversion truncates down. It never rounds up.

`add-instance-comments` hit this same root cause first. It surfaced in
that change's own new `listComments`. That change fixed it there.

The fix encoded the cursor from `created_at::text`, Postgres's lossless
text form, instead of the `Date`-truncated value. That change's
ordering is ascending. So the symptom there was a duplicate. A boundary
row's cursor rounded down. The row then still compared "greater than"
its own rounded cursor. It reappeared on the next page.

`listInstances` orders descending. The same root cause produces a
different, worse symptom there. A boundary row's cursor still rounds
down. Consider any row whose true value sits between the rounded
cursor and the true boundary value. That row stops comparing "less
than" the cursor. It drops out of the walk entirely.

A reproduction confirmed this directly. It forced three instances into
one millisecond, at three different microsecond offsets. Paging past
the first returned an empty page. The other two never appeared on any
page.

**Scope grew after this change's own `/opsx:verify` pass.** The first
draft of this design stated a Non-Goal. It claimed no third call site
in the codebase built a cursor from a `timestamptz` column. Verifying
that claim, rather than trusting it, found it false.
`src/engine/admin-queries.ts` has two more call sites. Both build a
cursor from a `timestamptz` column the exact same way:

- `listOutbox` (line ~105): `created_at DESC`, same ordering as
  `listInstances`. Same symptom: an outbox row can silently vanish from
  the admin Outbox screen's paginated backlog.
- `listPendingTimers` (line ~147): `next_timer_at ASC`, same ordering
  as `listComments`. Same symptom: a pending timer can reappear on the
  next page of the admin Timers screen.

Both columns are `timestamptz`, confirmed at `src/engine/store.ts:115`
(outbox `created_at`) and `store.ts:180` (instances `next_timer_at`).
This change now fixes all three call sites, not just `listInstances`.

## Goals / Non-Goals

**Goals:**
- Stop `listInstances`, `listOutbox`, and `listPendingTimers` from
  silently dropping or duplicating rows in a paginated walk when two
  rows share a millisecond.
- Fix all three the same way `listComments` already fixed the identical
  root cause, for one consistent pattern across the codebase.

**Non-Goals:**
- Auditing every other cursor-based read for the same class of bug
  beyond the four now confirmed: `listComments`, `listInstances`,
  `listOutbox`, `listPendingTimers`. `getInstanceRecord`'s cursor needs
  no such audit. Its `at` value is a JS-authored ISO string stored in
  `jsonb`. It never round-trips through a `timestamptz` column, so it
  carries no hidden precision loss.

  There are exactly five `encodeCursor` call sites in the repo: the
  four above, plus `getInstanceRecord`. Grepping every one of them
  confirms no other site builds a cursor from a `timestamptz` column.
  This Non-Goal is now a checked fact, not an assumption.
- Changing any of the three functions' route, request, or response
  shape.

## Decisions

**Same fix, same shape, all three sites.** Each of `listInstances`,
`listOutbox`, and `listPendingTimers` selects the relevant column cast
to `::text` alongside the existing column. Each builds its cursor from
that lossless text instead of a `new Date(...).toISOString()` round
trip. Every display-facing field keeps using `.toISOString()`
unchanged: `InstanceSummary.createdAt`, `OutboxRow.createdAt`,
`PendingTimer.nextTimerAt`. Display precision does not need to match
cursor precision. Only the cursor comparison does.

**Spec change is a scenario addition at each site.** It is not a
rewrite. Three existing requirements already state or imply the same
invariant this bug violates. A row already returned does not vanish or
reappear across a walk. One is `instance-query`'s "Instance listing is keyset-paginated in a
stable order." The other two are `admin-operations-api`'s "Outbox rows
are readable by status" and "Pending timers are readable."

None of the three requirements' normative text changes. Each gains one
scenario pinning the same-millisecond case for that specific read.

## Risks / Trade-offs

- [Each regression test forces a raw `UPDATE`, rather than a natural
  race] → deterministic beats flaky, for all three tests. Two real
  writes might not land in the same millisecond by chance. Waiting on
  that chance would put the tests' own reliability in question, not
  the fix's.
- [Scope grew mid-change] → the Non-Goals claim turned out false under
  checking. The right response to a wrong assumption is fixing it, not
  preserving a smaller diff. All three sites share one root cause and
  one fix. Splitting them into separate changes would not make any of
  them safer. It would only make them slower to land.

## Migration Plan

This is additive in behavior only. No schema, route, or type changes.
The fix changes three `SELECT`s and three `encodeCursor` calls, all in
already-existing functions. It deploys and rolls back like any other
same-file logic fix.

## Open Questions

None.
