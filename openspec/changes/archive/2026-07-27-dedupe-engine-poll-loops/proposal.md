## Why

`startOutboxWorker` (`src/engine/outbox.ts:230-252`),
`startResolutionWorker` (`src/engine/resolution.ts:110-133`), and
`startTimerScheduler` (`src/engine/timers.ts:61-83`) have a byte-identical
11-line poll-loop body (`stopped`/`timer`/`tick`/`setTimeout`, including
an identical swallow-and-retry comment on the `catch`), differing only in
which drain function `tick` calls and its arguments.
`PONYTAIL-AUDIT.md` (2026-07-26 scan, finding 2) flags this for
extraction into one `pollForever(tick, intervalMs)` helper. This is the
highest-scrutiny change in this audit pass: all three functions back
engine core subsystems (transactional-outbox delivery, automatic-path
resolution, timer firing) whose delivery guarantees
([[transactional-outbox]], [[timers]]) are load-bearing.

## What Changes

- Add `pollForever(tick: () => Promise<unknown>, intervalMs: number): { stop: () => void }`
  to a new `src/engine/poll.ts`, encapsulating the identical
  stopped/timer/setTimeout mechanics AND the identical
  try/swallow/reschedule wrapper (the `catch { /* transient, next tick
  retries */ }` body is also byte-identical across all three sites, so it
  belongs inside the shared helper, not left duplicated per call site).
- `startOutboxWorker`, `startResolutionWorker`, `startTimerScheduler`
  collapse to one-line calls: `return pollForever(() => drainX(...), intervalMs)`.
  Each function's own signature (parameters, defaults, return type) is
  UNCHANGED — this is purely an internal-body simplification.

## Capabilities

### New Capabilities
- `engine-poll-loop-consolidation`: a structural requirement that
  `startOutboxWorker`/`startResolutionWorker`/`startTimerScheduler` drive
  their drain call through one shared poll-loop implementation
  (`pollForever`), instead of independently-maintained, structurally
  identical copies. External behavior (polling cadence, stop semantics,
  swallow-and-retry on a transient drain failure) is unchanged; this
  capability exists to keep the "don't re-duplicate this" constraint from
  silently regressing as more poll-loop-driven engine workers are added.

### Modified Capabilities
None. [[transactional-outbox]] and [[timers]] describe delivery/firing
*semantics* (at-least-once, backoff, dead-lettering; fireAt computation,
arming/disarming) — this change touches none of that, only the scheduling
loop that repeatedly invokes the already-tested `drainOutbox`/
`drainResolutions`/`drainTimers` functions.

## Impact

- Affected files: `src/engine/outbox.ts`, `resolution.ts`, `timers.ts`
  (each loses its `startX` function's body, gains a one-line delegate),
  plus a new `src/engine/poll.ts`.
- `src/engine/host.ts` (the only caller of all three `startX` functions)
  is unaffected — same three call sites, same signatures, same returned
  `{ stop }` handles.
- No change to `src/schema/definition.ts`, the JSON contract, or any
  drain/delivery logic (`drainOutbox`, `drainResolutions`, `drainTimers`
  themselves are untouched — only their callers' scheduling wrapper moves).
- No dependency changes.
