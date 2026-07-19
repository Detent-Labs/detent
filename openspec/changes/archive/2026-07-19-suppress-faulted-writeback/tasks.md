## 1. Suppress the writeback for a faulted instance

- [x] 1.1 In `src/engine/outbox.ts`, narrow the writeback `UPDATE instances ... WHERE` from `(body->>'status') NOT IN ('completed', 'cancelled')` to `(body->>'status') = 'running'`. This suppresses both the `data` write and the `resolve_state = 'pending'` flag for non-running instances.

## 2. Test

- [x] 2.1 In `test/outbox.test.ts`, add a case mirroring the completed-suppression test: a `faulted` instance (status set directly) with a pending output action delivers, `data` is not written, and the `ActionOutcome` has `suppressed: true`.
- [x] 2.2 Confirm the existing running/completed/cancelled outbox tests still pass unchanged.

## 3. Verify

- [x] 3.1 `bun run typecheck` clean; `bun test` green against a live Postgres.
