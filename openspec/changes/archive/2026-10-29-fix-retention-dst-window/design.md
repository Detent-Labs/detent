# Design

## Context

See proposal.md. `retentionSelect` in `src/engine/retention.ts` builds its
cutoff in SQL:

```sql
to_char((now() - make_interval(days => ${days})) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
```

Postgres subtracts a `days` interval from a `timestamptz` in the session's
time zone. The result keeps the local wall-clock time. The dev pod and CI
start Postgres with `timezone=Europe/Zurich` (`scripts/dev-pod.sh`). Take
the 2026-10-25 change. Thirty days back from a CET instant lands on a CEST
instant with the same wall-clock time. That is 30 × 24 h + 1 h of elapsed
time.

The engine writes every entry time itself. `currentStepEnteredAt` and
`startedAt` come from `new Date().toISOString()` (`src/engine/transition.ts`,
`src/engine/store.ts`). The sweep compares them as text against the cutoff.
`instances_retention_idx` keys on the same entry expression.

## Goals / Non-Goals

**Goals:**

- A cutoff that sits exactly `days × 86 400 000` ms before the current
  instant, whatever the session time zone.
- A test that places a daylight-saving change inside the window on any
  calendar date, in both directions.

**Non-Goals:**

- Changing the session time zone of the dev pod or CI. That zone stays
  `Europe/Zurich` on purpose. It makes a time-zone defect visible in tests.
- A calendar-day meaning of `DATA_RETENTION_DAYS`. No reader needs one, and
  the spec now states 24-hour days.
- The other workers. Every other interval in `src/engine` already counts
  milliseconds (`${ms} * interval '1 millisecond'`), and no other site uses a
  `days` interval.

## Decisions

### D1. The engine computes the cutoff

`sweepRetention(db, days, now = Date.now())` computes
`new Date(now - days * DAY_MS).toISOString()` once per tick and passes that
string to `retentionSelect(db, cutoff, lastEntry, lastId)`. The query
compares the entry expression against the parameter:
`COALESCE(body->>'currentStepEnteredAt', started_at) < ${cutoff}`.

Three reasons favor this over keeping `now()` in SQL with an hour interval
(`make_interval(hours => days * 24)`):

- The entry times come from the engine clock, so a cutoff from the same clock
  compares like with like.
- `toISOString()` already produces the text form the comparison needs, and
  the `to_char` expression goes away.
- An injectable `now` lets a test put a daylight-saving change inside the
  window on any date. With `now()` in SQL, a test could only reach the defect
  during the 30 days after a real change.

One cutoff per tick also fixes the bound across all batches of that tick.
Today each batch re-reads `now()`.

### D2. `retentionSelect` takes the cutoff as its argument

The plan test in `test/worker-scan-plans.test.ts` explains the statement the
worker runs, so it calls `retentionSelect` with a cutoff computed the same
way. The parameter is a text value compared against the indexed expression,
so `instances_retention_idx` still bounds the scan. The plan test confirms
that.

### D3. Two regression tests with a fixed `now`

`test/retention.test.ts` gains two tests next to the existing boundary test.
Each uses a fixed instant 30 days after a Europe/Zurich change has started:

- autumn: `now = 2026-11-01T12:00:00.000Z`, window holds 2026-10-25
- spring: `now = 2027-04-10T12:00:00.000Z`, window holds 2027-03-28

Each test creates one instance at `now - 30 d - 60 s` and one at
`now - 30 d + 60 s`. The sweep must redact the first and leave the second.
The old code ignores the passed `now` and reads the real clock. The two
instances sit two minutes apart, so the real cutoff selects both of them or
neither. Either way one assertion fails.
The existing boundary test keeps the real clock.

## Risks / Trade-offs

- [Engine and database clocks drift apart] → The entry times already come
  from the engine clock. Using the same clock for the cutoff removes a source
  of skew instead of adding one.
- [A call site passes a stale `now`] → Only tests pass it. `host.ts` keeps
  `sweepRetention(c.db, retentionDays)`, and the default reads the clock per
  tick. The call in `test/instance-audit.test.ts` stays unchanged too.

## Migration Plan

1. Implement on the branch `fix-retention-dst-window`, verify, sync, archive.
2. Push and merge. No data migration: the sweep reads the same rows, and the
   boundary moves by at most one hour.
3. Rollback: revert the commits.

## Open Questions

None.
