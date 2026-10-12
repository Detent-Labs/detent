# Proposal

## Why

The outbox promises at-least-once delivery and a terminal dead-letter. With
two engine processes, or a row whose commit keeps failing, it breaks both.
The 2026-10-10 audit found three gaps (B-4, B-5, B-12). The runbook supports
more than one engine process, so the first is reachable today.

## What Changes

- **B-4.** A claim leases up to 100 rows at once, but the deadline starts fresh
  at each row. A hung target lets a peer reclaim rows 7 to 100 while the first
  worker still holds them. Each row's deadline becomes the remaining lease from
  the claim. A row whose lease ran out before its turn returns to `pending`
  unstarted, and its attempt is refunded.
- **B-4.** The three compare-and-set statements of the second transaction also
  match the attempt count the claim produced. A late worker whose row a peer
  reclaimed then changes nothing.
- **B-5.** A row claimed with `attempts` above its action's `maxAttempts` is
  dead-lettered without running the handler, with `last_error` of
  `abandoned after N attempts`. A row whose second transaction always throws
  then reaches the dead letters. The writeback path binds as
  `ARRAY['data', fid]`, so a field id with a `,` or `}` cannot alter it.
- **B-12.** `retry.maxAttempts` becomes an integer from 1 to 20. The
  exponential delay is capped at `max(baseDelay, 1 hour)`.
  **BREAKING** for a hand-written body with a `maxAttempts` outside that range:
  it fails to parse. Nothing is deployed, and `examples/` stays within 5.
- `docs/authoring-guide.md` states the retry bounds.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transactional-outbox`: the deadline becomes the remaining lease per row, the
  second transaction matches its own claim, an abandoned row at the cap
  dead-letters, and the retry policy gains its bounds.

## Impact

- `src/engine/outbox.ts`: the drain loop, the three compare-and-set
  statements, the backoff function, the writeback path.
- `src/schema/definition.ts`: `retryPolicy.maxAttempts`.
- `docs/authoring-guide.md`, `docs/decisions.md` (the audit index entry),
  `.claude/rules/process-contract.md` and `.claude/rules/authoring-invariants.md`.
- `test/outbox.test.ts`, including the hung-row test that expected a
  same-pass delivery, and `test/definitions.test.ts` for the range.
- No new schema key, so the studio mirrors of `CLAUDE.md` do not change.
