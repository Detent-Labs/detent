## Context

Found while verifying `reresolve-after-writeback`. The outbox writeback gates on
`(body->>'status') NOT IN ('completed','cancelled')`, so a `faulted` instance still
receives a late action's `data` write and — since that change — a stray
`resolve_state='pending'` the resolution worker never claims. `markFaulted` sets
`faulted` and nothing reads it or transitions out (confirmed: `faulted` appears in
`src/` only as a write in `markFaulted`), so faulted is data-immutable in practice,
just missing from the suppression list.

## Goals / Non-Goals

**Goals:**
- Suppress the writeback (and its re-resolution flag) for a `faulted` instance,
  matching the existing `completed`/`cancelled` behavior.

**Non-Goals:**
- Cancelling a faulted instance's pending outbox rows. The engine already relies on
  deliver-then-suppress for terminal instances (it does not cancel their outbox
  rows either); matching that pattern is the minimal, consistent fix. A cancel-on-
  fault mechanism would be new machinery for no added correctness.
- Any un-fault/resume path — none exists in v1; out of scope.

## Decisions

### Whitelist `running` rather than extend the blocklist
The writeback `WHERE` becomes `(body->>'status') = 'running'` instead of adding
`'faulted'` to the `NOT IN` list. Rationale: the underlying rule is "only a live
instance accepts a data write"; with exactly four statuses the two forms are
equivalent, and `= 'running'` states the intent directly and matches the resolution
worker's own `status = 'running'` claim filter. A future non-running status would
then default to suppressed, which is the safe direction.

### Fix at the single shared write, so the flag follows for free
`resolve_state='pending'` is set in the same `UPDATE` as the `data` write, so
narrowing that one predicate suppresses both the write and the flag for a faulted
instance — no separate handling. The `suppressed` accounting (`affected === 0` with
a non-empty patch) already yields `suppressed: true`, unchanged.

## Risks / Trade-offs

- [Losing a faulted instance's late result for forensics] The action's result value
  is no longer written into `data` on a faulted instance. → The `ActionOutcome`
  still records the handler ran, its status, and `suppressed: true`; the value was
  never going to be read (the instance is a dead end), and this is exactly the
  trade-off already accepted for `completed`/`cancelled`.
