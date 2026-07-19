## Why

The outbox writeback suppresses `data` mutation for `completed` and `cancelled`
instances (they are data-immutable once terminal) but not for `faulted`. A faulted
instance is a dead-end error park — `markFaulted` is the only writer of that status
and nothing reads it, transitions out of it, or resumes it. Yet `markFaulted` does
not cancel the instance's already-enqueued outbox actions, so a late delivery still
writes into a faulted instance's `data`. This is a small correctness oversight
(a post-mortem write to a broken instance) and, since `reresolve-after-writeback`,
it also leaves a stray `resolve_state = 'pending'` flag the resolution worker never
claims (it filters `status = 'running'`).

## What Changes

- The writeback (and its re-resolution flag) SHALL be applied only to a `running`
  instance. A `faulted` instance is suppressed exactly as `completed`/`cancelled`
  already are: no `data` write, no re-resolution flag, `ActionOutcome` still
  recorded with `suppressed: true`.
- One-line code change: `outbox.ts` writeback `WHERE` narrows from
  `NOT IN ('completed','cancelled')` to `= 'running'` (equivalent to excluding all
  three non-running statuses; there are exactly four).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `action-handlers`: the "A writeback to a terminal instance is suppressed"
  requirement broadens from `completed`/`cancelled` to any non-running instance,
  adding `faulted`.

## Impact

- **Code**: `src/engine/outbox.ts` — one `WHERE` predicate. No schema change.
- **Behavior**: a `faulted` instance no longer receives late `data` writes or a
  re-resolution flag; the fix that resolves the `reresolve-after-writeback`
  verification's remaining SUGGESTION.
- **Tests**: `test/outbox.test.ts` — a faulted-instance suppression case mirroring
  the existing completed-instance one.
- **Unchanged**: `running` still writes; `completed`/`cancelled` still suppress —
  every existing outbox test result is preserved.
