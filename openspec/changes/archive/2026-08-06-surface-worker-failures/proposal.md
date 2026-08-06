## Why

Two catch blocks in the engine discard every error they see, and neither one
writes a line.

`pollForever` in `src/engine/poll.ts` wraps every tick of all four background
workers: outbox, resolution, timers and retention. Its catch block is empty,
and its comment asserts the error is transient.

The second one is not one block but four. Every worker drain holds a per-item
catch that skips the item and says nothing: `drainOutbox`
(`src/engine/outbox.ts:338`), `drainResolutions` (`resolution.ts:107`),
`drainTimers` (`timers.ts:84`) and `sweepRetention` (`retention.ts:72`).

Those four are the harder half. Each sits INSIDE its drain loop. The drain
returns normally and the tick never throws. A worker whose every item fails
therefore reaches no tick boundary at all. A line at the tick boundary alone
would not report it.

The reasoning is right for a blip and wrong for the rest. Take a schema
drift, a permissions change, a bad bound in `sweepRetention`, an exhausted
connection pool. Each one builds a worker that fails on every tick, forever.
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
- All four per-item catch blocks log an error line carrying the item's
  identifier and the error message. The drain still moves on to the rest of
  the batch. Each boundary keeps the outcome it has today. `design.md` lists
  the four outcomes.
- A `ConcurrencyConflict` at one of those boundaries logs at debug level
  instead. Two workers reaching one instance together is the outcome the OCC
  predicate exists to produce, not an error.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observability`: the operational-events requirement gains the two silent
  boundaries.

## Impact

- `src/engine/poll.ts`: the signature and the catch block.
- `src/engine/outbox.ts`, `src/engine/resolution.ts`,
  `src/engine/timers.ts`, `src/engine/retention.ts`: each passes its name,
  and each logs at its own per-item catch block.
- `docs/current-state.md`: the worker-loop entry, and the observability entry
  whose "three new sites" count this change raises.
- `test/poll.test.ts`: new, for the tick boundary.
- `test/outbox.test.ts`, `test/resolution.test.ts`, `test/timer.test.ts`,
  `test/retention.test.ts`: one per-item boundary case each.
