## 1. Shared helper

- [x] 1.1 Create `src/engine/poll.ts` exporting
      `pollForever(tick: () => Promise<unknown>, intervalMs: number): { stop: () => void }`
      per `design.md`, including the swallow-and-retry `catch` body.
      (Signature corrected from `Promise<void>` to `Promise<unknown>`
      during implementation — the drain functions resolve to a `number`
      row count that the original inline `tick`s already discarded; see
      design.md's amended "Helper scope" note.)

## 2. Call-site migration

- [x] 2.1 `outbox.ts`: collapse `startOutboxWorker`'s body to
      `return pollForever(() => drainOutbox(db, registry), intervalMs);`,
      keeping its own signature/defaults unchanged.
- [x] 2.2 `resolution.ts`: collapse `startResolutionWorker`'s body to
      `return pollForever(() => drainResolutions(db, resolveBody, leaseMs), intervalMs);`,
      keeping its own signature/defaults (including `leaseMs`) unchanged.
- [x] 2.3 `timers.ts`: collapse `startTimerScheduler`'s body to
      `return pollForever(() => drainTimers(db, resolveBody), intervalMs);`,
      keeping its own signature/defaults unchanged.

## 3. Verification

- [x] 3.1 Confirm `src/engine/host.ts` (the sole caller of all three
      `startX` functions) needs no changes — same call sites, same
      arguments, same returned `{ stop }` shape. Confirmed unmodified.
- [x] 3.2 Run `bun run typecheck`. Passed after the `Promise<unknown>`
      correction (engine + editor).
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun). 859 pass, 0 fail, 2286 expect() calls.
- [x] 3.4 Extra: since `pollForever` has no existing dedicated unit test
      (see design.md Context), directly exercised its actual code in a
      standalone script covering all three risk scenarios: (a) no
      immediate call, fires only after `intervalMs`; (b) a throwing tick
      is swallowed and polling continues; (c) `stop()` called mid-tick
      lets the in-flight tick finish and schedules no further tick. All
      six assertions passed.
