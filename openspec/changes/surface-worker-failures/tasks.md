## 1. The tick boundary

- [ ] 1.1 Add a required `name` parameter to `pollForever`
      (`src/engine/poll.ts`). Log an error line in its catch block, carrying
      the name and the error's message.
- [ ] 1.2 Rewrite the comment in that catch block. The current one asserts
      the error is transient, which is the claim this change refutes.
- [ ] 1.3 Pass a name from all four call sites: `startOutboxWorker`,
      `startResolutionWorker`, `startTimerScheduler` and
      `startRetentionSweep`.

## 2. The per-row boundary

- [ ] 2.1 Log an error line in `drainOutbox`'s per-row catch block
      (`src/engine/outbox.ts`), carrying the row's idempotency key and the
      error's message.
- [ ] 2.2 Keep the row claimed and keep the loop going. Update the comment to
      say the line now exists.

## 3. Tests

- [ ] 3.1 A tick that throws logs an error line naming its worker, and the
      loop still schedules the next tick.
- [ ] 3.2 A row whose handling throws logs an error line carrying its
      idempotency key, and the drain still processes the rest of the batch.

## 4. Documentation

- [ ] 4.1 Update `docs/current-state.md` where it describes the worker loop
      and its error handling.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`.
- [ ] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
