## Why

Two catch blocks in the engine discard every error they see, and neither one
writes a line.

`pollForever` in `src/engine/poll.ts` wraps every tick of all four background
workers: outbox, resolution, timers and retention. Its catch block is empty,
and its comment asserts the error is transient.

`drainOutbox` in `src/engine/outbox.ts` holds the second one, around each row.
Its catch block leaves a corrupt row or a failed mark transaction claimed, and
says nothing.

The reasoning is right for a blip and wrong for the rest. Take a schema
drift, a permissions change, a bad bound in `sweepRetention`, an exhausted
connection pool. Each one builds a worker that throws on every tick, forever.
Nothing records it. No line, no metric, and no outward symptom except work
that quietly does not happen.

The observability change that shipped added `/metrics` and structured
logging. It left the two loops those metrics describe unable to report their
own errors.

The 2026-08-01 code review (`docs/CODE_REVIEW.md`) records this as ERR-1.

## What Changes

- `pollForever` takes a worker name and logs an error line when a tick
  throws, carrying that name and the error message.
- The four `start*Worker` functions pass their own name. The review's text
  says these call sites are in `src/engine/host.ts`; they are in
  `outbox.ts`, `resolution.ts`, `timers.ts` and `retention.ts`.
- `drainOutbox`'s per-row catch logs an error line carrying the row's
  idempotency key and the error message. The row still stays claimed, and the
  drain still moves on to the rest of the batch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observability`: the operational-events requirement gains the two silent
  boundaries.

## Impact

- `src/engine/poll.ts`: the signature and the catch block.
- `src/engine/outbox.ts`, `src/engine/resolution.ts`,
  `src/engine/timers.ts`, `src/engine/retention.ts`: each passes its name.
- `src/engine/outbox.ts`: the per-row catch block.
- `docs/current-state.md`: the worker-loop entry.
- Tests: the observability suite and the poll-loop suite.
