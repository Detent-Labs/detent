## Context

See proposal.md for motivation. Three facts shape the approach.

`pollForever` takes `(tick, intervalMs)` and returns a stop handle. It knows
nothing about its caller, so it cannot name the worker in a line.

Four functions call it. Each one is already named for its worker:
`startOutboxWorker` (`src/engine/outbox.ts:353`), `startResolutionWorker`
(`resolution.ts:125`), `startTimerScheduler` (`timers.ts:100`),
`startRetentionSweep` (`retention.ts:81`).

The log module already carries what this needs. `log.error(msg, context)`
emits structured output, and three operational events already use it.

## Goals / Non-Goals

**Goals:**

- A worker that fails on every tick is visible in the log, at once.
- The line names which worker, so an operator does not read four files.
- No behavior change. A failing tick still schedules the next one, and a
  skipped row still waits for its lease to reclaim it.

**Non-Goals:**

- No metric for worker failures. `/metrics` already reports the outcome, in
  backlog and lag. This change closes the reporting gap, not the counting
  one.
- No retry, no backoff and no circuit breaker in `pollForever`. The loop's
  behavior stays exactly as it is.
- No change to the per-row outcome. The row stays claimed, and its lease
  reclaims it, which is what the current comment describes.

## Decisions

**A required `name` parameter, not an optional one.** Four call sites exist,
all of them here. A required parameter makes the compiler find them. An
optional one leaves a line reading `worker: undefined`, for whichever call
site a later change forgets.

**Every failing tick logs.** No suppression. A worker failing on every 500 ms
tick writes two lines a second. Suppressing repeats needs state per
worker. State that hides an error from an operator has the shape this change
takes out. Volume belongs to `LOG_LEVEL` and to the log pipeline.

**The line carries a message, not the error object.** `log.error` serializes
its context to structured output. An `Error` there serializes to `{}` in
JSON, which is how the three existing call sites already handle it.

## Risks / Trade-offs

- A persistently failing worker floods the log → that is the outcome this
  change exists to produce. The alternative was no line at all. If the volume
  measures as a cost, per-worker suppression with a recovery line is the
  follow-up. It changes no requirement.
- A test that asserts an empty log for a failing tick breaks → no such test
  exists today. Nothing logged there.

## Migration Plan

Deploy. No table changes, no stored row changes, and no variable to set.
Rollback is the previous image.

An operator who reads the log after this lands may see errors that were
already happening. That is the point. It is worth stating in the release
note.

## Open Questions

None.
