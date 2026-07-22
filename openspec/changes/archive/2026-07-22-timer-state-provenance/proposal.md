## Why

Migration's timer reconciliation (`src/engine/migration.ts::reconcileTimers`)
keys a carried timer against the target step's declared timers by `timer.id`
alone. `TimerState` (`src/schema/definition.ts`) carries no record of *what*
it was armed against — no declared duration, no deadline source, no arming
instant. A target step that redeclares a surviving timer id with a different
`duration`, or flips it between `duration` and `deadline`, is therefore
indistinguishable from one that left it unchanged: the old `fireAt` is kept
silently. This is a documented, known gap — the `timers` spec's own
"Migration reconciles timers instead of re-arming them" requirement already
states it ("This is a limitation of the record shape, not a judgement about
what is desirable; closing it requires a provenance field on `TimerState`.")
— and CLAUDE.md lists it under "Decided, not yet built."

## What Changes

- `TimerState` gains an optional `provenance` field recording what the timer
  was armed against: its declared source (`{ kind: "duration", duration }` or
  `{ kind: "deadline", src }`) plus the instant it was armed (`armedAt`).
  Optional so a body already stored under the current schema keeps
  deserializing (see Impact/backward-compatibility below).
- `armStepTimers` (`src/engine/duration.ts`) — the single site that arms a
  `TimerState`, used at instance creation, an ordinary transition, and
  migration's newly-armed bucket — populates `provenance` on every timer it
  arms. No caller needs to change to get this; it is a property of the armed
  record, not of who called for the arming.
- `reconcileTimers` (`src/engine/migration.ts`) additionally compares a
  carried, unfired, still-declared timer's `provenance` against the target
  step's current declaration. Matching provenance keeps the timer as today
  (unchanged `fireAt`). Mismatched provenance (a changed `duration` value, or
  a `duration`↔`deadline` flip) re-arms that timer against the target step,
  at the migration instant, exactly as if it were newly declared. A carried
  timer with no `provenance` (armed before this change) is trusted as-is —
  reconciliation has no signal to compare, so it keeps today's keyed-by-id
  behavior for exactly that instance's exactly that timer, not forever. A
  **fired** carried timer is never re-armed regardless of provenance — it has
  already run; provenance on a fired timer is audit information, not a
  directive to re-fire it.
- `definition.ts` stays the deserializer with no added strictness: the new
  field is optional, so a body/instance stored before this change (which
  includes every existing persisted `TimerState`) still parses.

## Capabilities

### Modified Capabilities
- `timers`: "Arm timers on step entry" gains the provenance-recording detail;
  "Migration reconciles timers instead of re-arming them" gains
  provenance-aware comparison, replacing the documented id-only limitation.

## Impact

- `src/schema/definition.ts`: new `timerProvenance` schema/type; `TimerState`
  gains `provenance: timerProvenance.optional()`.
- `src/engine/duration.ts`: `armStepTimers` populates `provenance` on every
  armed `TimerState` (both the `duration` and `deadline` branches).
- `src/engine/migration.ts`: `reconcileTimers` splits the "carried, still
  declared, unfired" bucket further by provenance match; a mismatch feeds
  into the same re-arm path already used for newly-declared timers.
- **Backward compatibility**: an instance persisted before this change has
  `TimerState` entries with no `provenance`. Reconciliation treats an absent
  `provenance` as "no signal, keep as today" rather than either forcing a
  re-arm (which would silently jump `fireAt` for a genuinely-unchanged legacy
  timer to the migration instant) or refusing to migrate. Once such a timer
  is re-armed once (on this or a later migration, or a fresh entry), it
  carries `provenance` from then on and gets full comparison on every
  subsequent migration.
- No change to `outbox.ts`, `resolution.ts`, `timers.ts` (the scheduler), or
  `transition.ts` — none construct a `TimerState` directly; all go through
  `armStepTimers` or carry a set forward unmodified.
