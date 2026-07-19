## Why

An automatic wait-state's whole point is a result-driven path: a step runs an
async action (`onEntry`), parks with no guard matching, and moves on once the
action writes its result back into `data`. But today nothing re-evaluates the
step's automatic paths after that writeback — `resolveAutomatic` runs only on a
manual transition and at instance start (`transition.ts`), while the outbox
writeback (`outbox.ts`) applies its data patch and stops. So a parked instance
never takes its happy path; in `examples/expense-approval.json` the `book`
wait-state would only ever fire its timeout timer, never reach `booked`. This is
the missing driver that makes the wait-state pattern (and the `timer-scheduler`
change that bounds it) actually work.

## What Changes

- When an outbox writeback changes an instance's `data`, mark that instance for
  re-resolution durably, in the same transaction as the data patch.
- Add a re-resolution worker that picks up marked instances, loads the pinned
  frozen body, and runs `resolveAutomatic` to drive the instance off the
  wait-state if a guard now matches (or leaves it parked if none does).
- Drive re-resolution with a system actor (no acting user) and make it OCC-safe
  and idempotent: re-resolving an instance that already moved or has no matching
  guard is a harmless no-op.
- Introduce a body-resolver seam — an injected `(processId, version) ->
  ProcessBody` — because no definition store exists yet and a background worker
  cannot otherwise obtain an instance's frozen body.

## Capabilities

### New Capabilities
- `writeback-reresolution`: marking an instance dirty on a data-affecting
  writeback, the claim/re-resolve/clear worker, the injected body-resolver seam,
  the system actor, and the idempotency/race guarantees.

### Modified Capabilities
<!-- None rewritten. This adds a new trigger for the existing "advance to rest"
     behavior in automatic-transitions and hooks into transactional-outbox's
     writeback without changing their stated requirements. -->

## Impact

- **Engine**: `src/engine/store.ts` (a `resolve_state` column + index on
  `instances`); `src/engine/outbox.ts` (the writeback UPDATE also flags
  `resolve_state = 'pending'` when it affects the row); a new
  `src/engine/resolution.ts` worker (`drainResolutions` + `startResolutionWorker`)
  mirroring the outbox's claim/CAS drain.
- **Seam / out of scope**: a persistent definition/version store. This change
  defines the `resolveBody` injection point only; production wiring (in-memory map
  now, a `definitions` table later) is a separate concern. Tests supply the body
  the same way existing engine tests already do.
- **Actor**: re-resolution uses a system actor `{ id: "system", roles: [] }`;
  automatic guards that reference `actor` in a wait-state are a latent question,
  not resolved here.
- **Sequencing**: this change should land before `timer-scheduler`, so the
  wait-state happy path exists before the timer fallback is added.
- **Tests**: `test/resolution.test.ts` — writeback that satisfies a wait-state
  guard drives the transition; one that does not leaves it parked; re-resolving an
  already-moved instance is a no-op; a writeback arriving during a claim is not
  lost.
