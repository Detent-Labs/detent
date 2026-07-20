## Why

`Timer.duration` is `z.string()` with no format refinement, so nothing validates it
until `durationMs` parses it at step entry — inside the transition commit. Two
defects follow, both pre-existing and both surfaced by the adversarial review of
`add-deadline-timers`:

1. A malformed duration (`"P1Y"` — a calendar unit `durationMs` deliberately
   rejects; `"1 day"`; `""`) publishes cleanly and then throws while arming the
   **target** step's timers. No instance can ever enter that step: every transition
   to it fails. If the step is `initialStep`, no instance of that definition can be
   created at all. Reached through the scheduler, the throw lands in `drainTimers`'
   bare `catch {}`, `next_timer_at` stays due, and the poll retries every 500 ms
   indefinitely with no dead-letter and no log.
2. A well-formed but absurd duration (`P9999999D`) produces a `fireAt` in the
   expanded-year form (`+029405-01-26T...`). Its leading `+` (0x2B) sorts before
   every digit, so it wins `minFireAt`'s lexical comparison and suppresses every
   other timer on the step.

`add-deadline-timers` closed exactly these two failure modes on the `deadline`
branch — a strict instant whitelist and a bounded, width-checked output. The
`duration` branch was deliberately left out of that change's scope to keep it
honest, leaving the two branches inconsistent. This change closes the gap.

## What Changes

- `src/schema/definition.ts` exports `parseIsoDuration` as the single grammar source
  (weeks, days, hours, minutes, seconds; no calendar units; at least one component;
  no trailing bare `T`). `duration` itself stays `z.string()`.
- Enforcement lands in `src/schema/compile.ts` as `validateDurations`, run at
  compile/publish — **not** as a Zod refinement. `definition.ts` is also the
  deserializer for stored immutable bodies, so a refinement would make an
  already-published definition throw on *read* and its pinned instances
  unrehydratable. **BREAKING** at publish for a body carrying an unsupported
  duration — such a body is already non-functional, since every entry to its step
  throws — while the read path stays permissive.
- A magnitude bound on `Timer.duration`, derived from a fixed entry-instant ceiling
  so a passing duration cannot produce a `fireAt` outside the four-digit-year window
  when armed before that ceiling. Bounding by the representable window alone is
  necessary but not sufficient. `retryPolicy.baseDelay` and `action.timeout` carry
  the grammar but not the bound: neither computes an instant.
- `armStepTimers`' duration branch is brought under the same width invariant the
  deadline branch already asserts, so the guarantee holds at the point of arming
  rather than resting on validation alone.
- `durationMs` keeps throwing on an unsupported value: after the refinement it is
  unreachable for a validated body, and a defensive throw is preferable to
  silently arming a wrong instant.
- The `armStepTimers` docstring loses its "the duration branch is not total" caveat,
  which this change makes untrue.

## Capabilities

### New Capabilities
<!-- none: this hardens an existing capability -->

### Modified Capabilities
- `timers`: the arming requirement gains a normative statement that a `duration` is
  validated at publish and that every armed `fireAt` — from either branch — carries
  the fixed-width, lexically sortable form the scheduler's earliest-timer selection
  depends on.

## Impact

- `src/schema/definition.ts`: exports `parseIsoDuration`, the entry-instant ceiling
  and the derived `MAX_TIMER_DURATION_MS`; the grammar regex stays module-private
  (it is weaker than the parser). This is the contract — changed deliberately, with
  a rejecting test per invariant. `duration` remains `z.string()`.
- `src/schema/compile.ts`: `validateDurations` + `DurationValidationError`, called
  from `compileProcessBody` before its idempotent early return so re-publishing an
  already-compiled body is still checked.
- `src/engine/duration.ts`: `durationMs` becomes a wrapper over `parseIsoDuration`;
  the width invariant applied to the duration branch; docstring correction.
- `test/validate.test.ts` (publish-level accept/reject, the read-permissive /
  publish-strict layering, traversal of every action position, the ordering against
  the early return), `test/duration.test.ts` (grammar parity, bound derivation),
  `test/timer.test.ts` (both branches arm the same fixed-width form).
- No database, migration, or API impact. Existing example definitions use ordinary
  durations and are unaffected — verified as part of the work.
