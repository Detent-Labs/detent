## Why

A claimed step has no handoff path today. The only release mechanism
(`releaseClaim`, Roadmap #5d) returns the step to the shared candidate pool,
not to a specific actor. Stage 9 explicitly excluded delegation from the
participant-facing app.

Roadmap #23 (Extended Task Collaboration) re-brainstormed this gap at the
user's direction on 2026-07-30. It sequenced delegation first among its
three sub-projects, since delegation sits closest to the existing engine
core. It reuses `claimStep`/`releaseClaim`'s own `updateAssignment`
mechanism, generalized to carry a delegate's two-actor event payload. The
design is already approved
(`docs/superpowers/specs/2026-07-30-task-delegation-design.md`). This
change carries it into implementation.

## What Changes

- New `delegateClaim(instanceId, actor, toActorId, db)` in
  `src/engine/transition.ts`, next to `claimStep`/`releaseClaim`, sharing
  their `updateAssignment` row-lock/guard/write/event sequence as a third
  caller.
  - Guard: the calling actor must currently hold the claim (`NotClaimantError`
    otherwise, the same error `releaseClaim` already throws).
  - Effect: `claimedBy` becomes `toActorId`, `claimedAt` refreshes; the
    candidate list is untouched. The delegate does not join the permanent
    candidate pool. Releasing returns the step to the original candidates,
    not to the delegate.
  - No validation on `toActorId`: actor ids are opaque strings with no
    referential integrity anywhere else in the engine (matches
    `assignedTo`/`startedBy`/`claimedBy`).
- New `InstanceEvent` kind, `assignment.delegated`, payload
  `{fromActorId, toActorId}`, added to the existing ten-kind discriminated
  union (becomes eleven).
- New route `POST /instances/:id/delegate`, body `{ toActorId: string }`,
  alongside the existing `/claim` and `/release` routes. Maps
  `NotClaimantError` to `403` (matching `/release`); an empty/missing
  `toActorId` is a `400` `RequestShapeError` (matching `/submit`'s existing
  body-shape check).
- `packages/app`'s Task screen gains a "Delegate to" action, next to the
  existing Claim/Release controls. It is a target-actor-id text input plus
  a submit button. No new screen.

## Capabilities

### New Capabilities

(none. Delegation extends the existing assignment/claim mechanism instead
of introducing a new domain concept.)

### Modified Capabilities

- `assignment-claim-enforcement`: gains the delegation requirement: guard,
  state transition, and non-membership-in-candidates behavior.
- `assignment-claim-release-consolidation`: `delegateClaim` joins
  `claimStep`/`releaseClaim` as a third thin caller of the shared
  row-lock-guard-write-event sequence.
- `runtime-events`: the `InstanceEvent` union gains `assignment.delegated`.
- `runtime-api`: gains the `delegateClaim(instanceId, actor, toActorId, db?)`
  Runtime API Layer function.
- `http-wrapper`: gains the `POST /instances/:instanceId/delegate` route,
  including its CORS preflight and error mapping.
- `end-user-app`: the Task screen gains the "Delegate to" action.

## Impact

- `src/engine/transition.ts`: new `delegateClaim` function. Also a small
  generalization of `updateAssignment`'s hardcoded `{ actorId }` event
  payload. A third caller needs to carry a different payload shape.
  `claimStep`/`releaseClaim` keep their own payload unchanged.
- `src/schema/definition.ts`: new `assignment.delegated` kind on the
  `InstanceEvent` discriminated union.
- `src/http/routes.ts` and `src/http/server.ts`: new `/delegate` route
  and its `OPTIONS` preflight, reusing existing `RequestShapeError` and
  `NotClaimantError` mappings.
- `packages/app`: Task screen UI action and its API call.
- **`packages/admin`'s `InstanceScreen.tsx`**: its `deriveFromRecord`
  helper infers the current claimant by scanning the record for
  `assignment.claimed`/`assignment.released` only. It needs a third case
  for `assignment.delegated`, or the Instance Operations screen shows a
  stale claimant after any delegation.
- **Documentation**: CLAUDE.md's "Runtime record" section and
  `openspec/specs/runtime-events/spec.md`'s Purpose section both
  hard-code the current ten `InstanceEvent` kinds. Neither is a
  requirement, so archiving leaves both untouched. Both need a manual
  change to name the eleventh kind.
- Test files exercising `InstanceEvent`'s kind union, `claimStep`/
  `releaseClaim`, and the HTTP claim/release routes need a sibling case
  for delegate. `tasks.md` lists them. This mirrors how the escalation
  design tracked its own dependent-test list.
