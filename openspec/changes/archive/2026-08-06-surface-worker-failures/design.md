## Context

See proposal.md for motivation. Three facts shape the approach.

`pollForever` takes `(tick, intervalMs)` and returns a stop handle. It knows
nothing about its caller, so it cannot name the worker in a line.

Four functions call it. Each one is already named for its worker:
`startOutboxWorker` (`src/engine/outbox.ts:353`), `startResolutionWorker`
(`resolution.ts:125`), `startTimerScheduler` (`timers.ts:100`),
`startRetentionSweep` (`retention.ts:81`).

Each of those four workers also holds a per-item catch block inside its drain
loop: `outbox.ts:338`, `resolution.ts:107`, `timers.ts:84`, `retention.ts:72`.
A per-item catch swallows the error before the tick ever throws. The tick
boundary does not cover this case.

The log module already carries what this needs. `log.error(msg, context)`
emits structured output, and three operational events already use it.

## Goals / Non-Goals

**Goals:**

- A worker that fails on every tick is visible in the log, at once.
- A worker whose every item fails is visible the same way.
- The line names which worker, so an operator does not read four files.
- No behavior change. A failing tick still schedules the next one. A skipped
  item keeps the recovery its own boundary already gives it.

**Non-Goals:**

- No metric for worker failures. `/metrics` already reports the outcome, in
  backlog and lag. This change closes the reporting gap, not the counting
  one.
- No retry, no backoff and no circuit breaker in `pollForever`. The loop's
  behavior stays exactly as it is.
- No change to any per-item outcome. Each boundary keeps the recovery its
  comment already describes. The outbox and resolution rows stay claimed. The
  timer row leaves the scan. The retention sweep steps past its instance.

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

**`name` comes first: `pollForever(name, tick, intervalMs)`.** It reads as a
label on the loop, not as a third parameter beside the interval. Any position
makes the compiler find the four call sites. All four already pass
`intervalMs`.

**Two fixed `msg` strings.** `"worker tick failed"` at the tick boundary,
`"worker skipped a failing item"` at each per-item boundary. The existing
suite asserts on `msg`: `test/outbox.test.ts:355` matches
`"outbox row dead-lettered"`. A string the artifacts leave open is a string
the test and the code can disagree about. The worker name is context, not
part of the message, so one grep finds every worker.

**One `ConcurrencyConflict` logs at debug, not error.** Two workers reaching
one instance together is what the OCC predicate is for. The lease retries the
loser's row. An error line for every race on a healthy two-worker deployment
teaches an operator to ignore the level. That is the level this change exists
to make meaningful. Debug still satisfies the requirement: the boundary
discards no
error without a line.

**Every per-item line carries the item's own identifier.** The outbox row has
an idempotency key. The other three drains work on instances, so each carries
the instance id. One field name per boundary, matching what that boundary's
own recovery query keys on.

## Risks / Trade-offs

- A persistently failing worker floods the log → that is the outcome this
  change exists to produce. The alternative was no line at all. If the volume
  measures as a cost, per-worker suppression with a recovery line is the
  follow-up. It changes no requirement.
- A test that asserts an empty log for a failing tick breaks → no such test
  exists today. Nothing logged there.
- A per-item line at debug level is invisible under the default `LOG_LEVEL`
  → true, and it applies to the `ConcurrencyConflict` case alone. An operator
  who suspects a race raises the level. Every other error keeps its error
  line.

## Migration Plan

Deploy. No table changes, no stored row changes, and no variable to set.
Rollback is the previous image.

An operator who reads the log after this lands may see errors that were
already happening. That is the point. It is worth stating in the release
note.

## Open Questions

None.
