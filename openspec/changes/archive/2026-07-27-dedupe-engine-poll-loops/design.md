## Context

Three engine workers share one poll-loop shape, verified against current
file contents (not just the audit text):

```ts
// outbox.ts:230-252 (startOutboxWorker), resolution.ts:110-133
// (startResolutionWorker), timers.ts:61-83 (startTimerScheduler) —
// identical except the one line inside tick() and the function's own
// parameter list.
let stopped = false;
let timer: ReturnType<typeof setTimeout>;
const tick = async (): Promise<void> => {
  try {
    await drainX(...);
  } catch {
    // transient (e.g. DB blip); the next tick retries.
  }
  if (!stopped) timer = setTimeout(tick, intervalMs);
};
timer = setTimeout(tick, intervalMs);
return {
  stop: () => {
    stopped = true;
    clearTimeout(timer);
  },
};
```

All three are called exactly once each, from `src/engine/host.ts:67-71`
(`startEngine`), which collects their `{ stop }` handles and fans out
`stop()` to all three on its own `stop()`. No test calls `startOutboxWorker`/
`startResolutionWorker`/`startTimerScheduler` directly — `drainOutbox`/
`drainResolutions`/`drainTimers` (the functions each `tick` calls) are
what `test/outbox.test.ts`/`resolution.test.ts`/`timer.test.ts` exercise
directly; the poll wrapper itself has no dedicated unit test today.

## Goals / Non-Goals

**Goals:**
- Collapse the three identical poll-loop bodies (including the identical
  try/swallow/reschedule wrapper) behind one `pollForever` helper.
- Preserve every observable timing/stop semantic exactly: same initial
  delay before the first tick, same swallow-transient-errors-and-retry
  behavior, same "in-flight tick completes, then checks `stopped` before
  rescheduling" shutdown semantics.
- Preserve all three `startX` functions' external signatures (parameters,
  defaults, return type) unchanged — `host.ts` and any other caller sees
  no difference.

**Non-Goals:**
- Any change to `drainOutbox`/`drainResolutions`/`drainTimers` themselves,
  or to outbox/timer delivery semantics ([[transactional-outbox]],
  [[timers]]).
- Any change to polling cadence (`intervalMs` stays a per-call parameter,
  still defaulting to 500 at each of the three call sites — not hoisted
  into `pollForever` as a shared default, since that would make the three
  workers' defaults implicitly coupled where today they're independently
  specified, even though they happen to all be 500 today).

## Decisions

### Helper scope: include the try/catch, not just the timer mechanics

The audit's suggested signature is `pollForever(tick, intervalMs)`. Two
shapes were possible:

1. `pollForever` owns only the `stopped`/`timer`/`setTimeout` scheduling;
   each `startX` keeps its own `try { await drainX() } catch { /* ... */ }`
   wrapped around the call it passes in.
2. `pollForever` owns the scheduling **and** the try/swallow/reschedule
   wrapper; each `startX` passes a bare `() => drainX(...)` thunk.

Chose (2): the `catch { // transient (e.g. DB blip); the next tick
retries. }` block is byte-identical across all three sites too, not just
the scheduling shell — leaving it duplicated under option (1) would still
leave three copies of the actual behavior-relevant line (swallow and
retry), just wrapped in a thinner shell. Verified all three catch bodies
are truly identical (not e.g. one of them re-throwing or logging
differently) before choosing this.

```ts
// src/engine/poll.ts
/** Runs `tick` on a fixed interval until `stop()` is called. A tick that
 * throws is swallowed (transient — e.g. a DB blip — the next tick
 * retries); `stop()` lets an in-flight tick finish but prevents the next
 * one from being scheduled. */
export function pollForever(tick: () => Promise<unknown>, intervalMs: number): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = async (): Promise<void> => {
    try {
      await tick();
    } catch {
      // transient (e.g. DB blip); the next tick retries.
    }
    if (!stopped) timer = setTimeout(loop, intervalMs);
  };
  timer = setTimeout(loop, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
```

### Call-site changes

```ts
// outbox.ts
export function startOutboxWorker(db: SQL = sql, registry: Registry = new Map(), intervalMs = 500): { stop: () => void } {
  return pollForever(() => drainOutbox(db, registry), intervalMs);
}

// resolution.ts
export function startResolutionWorker(
  db: SQL = sql,
  resolveBody: ResolveBody = () => undefined,
  intervalMs = 500,
  leaseMs: number = CLAIM_LEASE_MS,
): { stop: () => void } {
  return pollForever(() => drainResolutions(db, resolveBody, leaseMs), intervalMs);
}

// timers.ts
export function startTimerScheduler(db: SQL = sql, resolveBody: ResolveBody = () => undefined, intervalMs = 500): { stop: () => void } {
  return pollForever(() => drainTimers(db, resolveBody), intervalMs);
}
```

Each function keeps its own parameter list, defaults, and closes over its
own `db`/`registry`/`resolveBody`/`leaseMs` in the thunk it hands to
`pollForever` — `pollForever` itself stays generic (`() => Promise<unknown>`,
`number`), with no knowledge of outbox/resolution/timer specifics.
`Promise<unknown>`, not `Promise<void>`: `drainOutbox`/`drainResolutions`/
`drainTimers` all resolve to a `number` (a processed-row count) that the
original `tick`s already discarded (their arrow bodies never returned it);
`Promise<void>` would reject those thunks at the call site since a
same-shorthand arrow (`() => drainOutbox(...)`) implicitly returns the
drain's `Promise<number>`. `Promise<unknown>` accepts any settle value and
`pollForever` still discards it, preserving the original discard
behavior exactly.

### Placement

New file `src/engine/poll.ts` — no existing engine file is a natural home
(it's infrastructure shared by three otherwise-unrelated subsystem files,
not logic belonging to any one of them).

### Testing

No new automated test. `pollForever` is a direct, non-branching extraction
of logic that itself has no existing dedicated test (see Context) — adding
one now would test infrastructure the project has never unit-tested
directly (timer-based scheduling is awkward to test without fake timers,
which this codebase doesn't use elsewhere). The real regression risk is in
`drainOutbox`/`drainResolutions`/`drainTimers`'s own behavior, which is
untouched and already covered by `test/outbox.test.ts`/
`test/resolution.test.ts`/`test/timer.test.ts`/`test/automatic.test.ts`/
`test/subprocess.test.ts` — run the full suite (task below) as the
regression signal, since these tests exercise the drain functions through
realistic instance lifecycles, not the poll wrapper directly (which is
unchanged in the tests' view either way).

## Risks / Trade-offs

- [Risk] `startEngine`'s `stop()` fans out to all three workers'
  `stop()` — if `pollForever`'s shutdown semantics diverged even slightly
  (e.g. not waiting for an in-flight tick, or clearing the wrong timer
  handle), a test or production shutdown could leave a worker running
  past `stop()`. → Mitigation: `pollForever`'s body is a direct,
  unmodified copy of the shared shape (same `stopped`/`timer` variable
  roles, same order of operations), not a rewrite — minimizing the chance
  of a subtle behavioral drift. Full suite run (which includes
  `startEngine`-driven integration-style tests) is the verification gate.
- [Risk] None identified for the drain functions themselves — untouched.

## Migration Plan

Pure refactor, no schema/contract/data changes, no change to any
persisted state or delivery guarantee. Rollback is reverting `outbox.ts`,
`resolution.ts`, `timers.ts`, and deleting the new `poll.ts`.

## Open Questions

None outstanding.
