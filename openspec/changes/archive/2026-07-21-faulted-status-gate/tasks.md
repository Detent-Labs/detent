## 1. Guard executeManualTransition

- [x] 1.1 In `src/engine/transition.ts`, add an early `if (instance.status !== "running") return instance;` guard at the top of `executeManualTransition`, before the current-step lookup, matching `cancelInstance`'s existing no-op shape and comment style.
- [x] 1.2 Update `executeManualTransition`'s doc comment to state the non-running no-op, consistent with how `cancelInstance`'s comment documents its own no-op.

## 2. Guard fireTimer

- [x] 2.1 In `src/engine/transition.ts`, add the same `if (instance.status !== "running") return instance;` guard at the top of `fireTimer`, before the current-step lookup, so it covers both the transition-timer branch and the reminder-timer branch with one check.
- [x] 2.2 Update `fireTimer`'s doc comment to state the non-running no-op.

## 3. Tests

- [x] 3.1 In `test/transition.test.ts`, add a case: a `faulted` instance offered a valid manual path is unchanged — no `HistoryEntry` appended, `transitionSeq` unchanged, `currentStepId`/`status` unchanged.
- [x] 3.2 In `test/timer.test.ts` (or `test/transition.test.ts`, wherever `fireTimer` is already exercised), add a case: a `faulted` instance with a due transition timer is unchanged — no `HistoryEntry`, no `transitionSeq` bump, no outbox row enqueued.
- [x] 3.3 In the same file, add a case: a `faulted` instance with a due reminder timer is unchanged — no `timer.fired` event appended, no outbox row enqueued, the timer's `fired` flag unchanged.
- [x] 3.4 Run `bun test` with `DATABASE_URL` set (full suite, per CLAUDE.md) and confirm all tests pass, including the three new ones and the full 336+ baseline. Result: 362 pass / 0 fail / 1193 expect() calls.

## 4. Verify no regressions to adjacent behavior

- [x] 4.1 Confirm `resolveAutomatic` is not invoked when `executeManualTransition` or `fireTimer`'s transition branch no-ops (i.e. the guard sits before the `commitTransition` call, not after). Verified by inspection: both guards are the first statement in their function, before any lookup or commit.
- [x] 4.2 Confirm the existing `cancelInstance`, `resolveAutomatic`, `drainResolutions`, and `subprocess.ts` tests still pass unmodified — this change touches no shared code path they depend on. Confirmed by the full-suite run (362/362 pass, no other test files touched).
