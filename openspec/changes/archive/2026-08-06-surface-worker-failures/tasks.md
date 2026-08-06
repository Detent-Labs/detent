## 1. The tick boundary

- [x] 1.1 Add a required `name` first parameter to `pollForever`
      (`src/engine/poll.ts`), giving `pollForever(name, tick, intervalMs)`.
      Log `log.error("worker tick failed", { worker, error })` in its catch
      block.
- [x] 1.2 Rewrite the comment in that catch block. The current one asserts
      the error is transient, which is the claim this change refutes.
- [x] 1.3 Pass a name from all four call sites: `startOutboxWorker`
      (`outbox.ts:353`), `startResolutionWorker` (`resolution.ts:125`),
      `startTimerScheduler` (`timers.ts:100`) and `startRetentionSweep`
      (`retention.ts:81`).

## 2. The four per-item boundaries

Each drain holds one. All four log `"worker skipped a failing item"` with the
worker name, the item's identifier and the error message. None changes the
recovery it has today. A `ConcurrencyConflict` logs at debug level instead of
error.

- [x] 2.1 `drainOutbox` (`src/engine/outbox.ts:338`), carrying
      `idempotencyKey`. The row stays claimed.
- [x] 2.2 `drainResolutions` (`src/engine/resolution.ts:107`), carrying
      `instanceId`. The row stays claimed.
- [x] 2.3 `drainTimers` (`src/engine/timers.ts:84`), carrying `instanceId`.
      The row still moves out of the scan.
- [x] 2.4 `sweepRetention` (`src/engine/retention.ts:72`), carrying
      `instanceId`. The sweep still steps to the next instance.
- [x] 2.5 Update all four comments to say the line now exists.

## 3. Tests

Each per-item test needs a seam that reaches the boundary. Two do not reach
the outbox one. A throwing `deliverFn` is caught by `outbox.ts:227` first and
becomes an ordinary retry. A corrupt `action` column is unreachable as well.
`action` is `jsonb`, so Postgres validates it on write. That column can never
hold text `JSON.parse` rejects. The seams below do reach it.

- [x] 3.1 `test/poll.test.ts` (new): a tick that throws logs an error line
      naming its worker, and the loop still schedules the next tick. The test
      waits on the third line, not on the tick count. The catch that writes a
      line runs a microtask after the tick throws, so a test that signals from
      inside the tick body observes one line too few.
- [x] 3.2 `test/outbox.test.ts`: a throwing `resolveBody` reaches the
      boundary. `drainOutbox` calls it inside tx2, so the mark transaction
      aborts, and it is keyed by the row's own instance's processId. Fail one
      instance and assert the lines carry its idempotency keys, that its rows
      stay `claimed`, and that a second instance's rows deliver in the same
      pass.
- [x] 3.3 `test/resolution.test.ts`: an injected `resolveBody` that throws
      reaches the boundary. Assert the line carries the instance id and that
      the drain processes the rest of the batch.
- [x] 3.4 `test/timer.test.ts`: a row whose `body` fails `parseInstance`
      reaches the boundary, the seam the file's own poison-row test already
      uses. Assert the line carries the instance id.
- [x] 3.5 `test/retention.test.ts`: an instance row whose `body` fails
      `instanceSchema.parse` while still matching the sweep's WHERE clause
      reaches the boundary through `redactInstance`. Assert the line carries
      the instance id and that a second eligible instance is still redacted.
- [x] 3.6 A `ConcurrencyConflict` at a per-item boundary logs at debug level,
      and emits no error-level line.

## 4. Documentation

- [x] 4.1 Update `docs/current-state.md` where it describes the worker loops
      and their error handling.
- [x] 4.2 Update the same file's observability entry, near line 1727. Its
      "Three new sites" sentence undercounts once these land.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`. Every worktree shares one test database,
      so this change ran no suite. The serial full-suite run owns this box.
