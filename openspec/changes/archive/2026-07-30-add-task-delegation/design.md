## Context

`Instance.assignment` is an `AssignmentState`: `{ candidates: string[],
claimedBy?: string, claimedAt?: string }`. `claimStep` and `releaseClaim`
already live in `src/engine/transition.ts`. Both route through one shared
helper, `updateAssignment` (the `assignment-claim-release-consolidation`
mechanism spec). That helper row-locks the instance, runs an
operation-specific guard, and computes the next `AssignmentState`. It
writes that state with `jsonb_set` and appends one `InstanceEvent`. The
write is not a transition: it appends no `HistoryEntry` and does not
advance `transitionSeq`.

`claimStep` requires the actor to be an eligible candidate. Eligibility
means a match by id or by role, checked through `isEligibleCandidate`.
`releaseClaim` requires the actor to hold the current claim. Neither lets
the current claimant hand the task to someone outside the eligible
candidates. That gap is what this change closes.

## Goals / Non-Goals

**Goals:**

- Let the current claimant of a step hand it to one named actor directly.
  That actor need not be an original candidate.
- Reuse the existing `updateAssignment` mechanism as its shared
  row-lock-guard-write-event sequence. Delegation costs one new guard and
  one new next-state computation. It also needs a small generalization to
  that sequence (below), not a parallel code path.
- Record every delegation in the runtime event log, the same durability
  guarantee claim and release already have.

**Non-Goals:**

- A delegation chain view. The `InstanceEvent` log already lists every
  `assignment.delegated` entry in order. A dedicated visualization is a UI
  nicety this change does not build.
- Auto-delegation on absence (out-of-office reassignment). That needs a
  schedule or a status signal this design does not add.
- Delegating an unclaimed step. `claimStep` already covers that case for
  any eligible candidate.
- Restricting delegate targets to known users or matching roles. See the
  "No validation on `toActorId`" decision below.

## Decisions

**`delegateClaim(instanceId, actor, toActorId, db)` sits next to
`claimStep`/`releaseClaim` and reuses `updateAssignment`.** This is the
same mechanism-level pattern `assignment-claim-release-consolidation`
already enforces for its two existing callers. Delegation becomes a third
thin caller of one shared row-lock-guard-write-event sequence, not a
fourth independently-maintained copy of it.

**`updateAssignment` itself needs one small change: a generalized event
payload.** Today it hardcodes `payload: { actorId: actor.id }` for every
call (`src/engine/transition.ts`). Delegate's event payload is
`{ fromActorId, toActorId }`, which does not fit that shape. `claimStep`
and `releaseClaim` keep their existing `{ actorId }` payload unchanged.
Only `updateAssignment`'s internal construction generalizes. It could
take a payload value as a new parameter. Or it could take a
payload-building callback, alongside its existing guard and next-state
callbacks.

**Guard: the calling actor must hold the current claim.** This reuses
`NotClaimantError`, the same error `releaseClaim` already throws for the
same reason. A non-claimant has nothing to hand off.

**Next state: `{ candidates: assignment.candidates, claimedBy: toActorId,
claimedAt: at }`.** The candidate list does not change. The delegate does
not join the permanent candidate pool. If the delegate releases the claim,
the original candidates can reclaim it; the delegate cannot reclaim it
alone. A second delegation would need to name them again. This makes
delegation a handoff, not a standing reassignment. It matches how a
manager hands off one ticket without becoming the queue's permanent owner.

**No validation on `toActorId`.** Actor ids are opaque strings with no
referential integrity, per CLAUDE.md's "Identity" section. The fields
`assignedTo`, `startedBy`, and `claimedBy` all work this way today. A
delegate target follows the same rule.

The engine keeps no account directory to check it against. An external
JWT issuer mints actor ids the engine never stores. A check here would
break that consistency and would need a directory lookup that does not
exist.

**New event kind: `assignment.delegated`, payload `{fromActorId: string,
toActorId: string}`.** `fromActorId` is the delegating actor; `toActorId`
is the new claimant. This joins the same discriminated union as the other
ten `InstanceEvent` kinds, following the pattern CLAUDE.md documents for
adding one.

**Enforcement downstream needs no change.** `submitAndTransition` already
enforces claimant-only action by reading `assignment.claimedBy`.
Delegation writes the delegate's id there. The existing check keeps
working unchanged. The delegate can now submit; the original claimant
cannot, until a delegation names them again.

**HTTP route: `POST /instances/:id/delegate`, body `{ toActorId:
string }`.** It sits alongside `/claim` and `/release` in
`src/http/routes.ts`. It maps `NotClaimantError` to `403` the same way
`/release` already does. An empty or missing `toActorId` is a
`RequestShapeError` (`400`), the same pattern `parseJsonBody` already
applies to `/submit`.

**`packages/admin`'s Instance screen needs one fix.** Its claim-state
derivation must learn the new kind. `InstanceScreen.tsx`'s
`deriveFromRecord` has no single-instance read for the current claimant.
It infers one by scanning the merged record for `assignment.claimed`
(sets `claimedBy`) and `assignment.released` (clears it). Without a third
case for `assignment.delegated` (sets `claimedBy` to `toActorId`), this
screen would show a stale claimant after any delegation. Neither
`assignment.claimed` nor `assignment.released` fires when a claim moves
by delegation. `describeElement`'s generic event rendering already
handles any kind, including this new one, without change.

**Frontend**: a "Delegate to" action on `packages/app`'s Task screen. A
text input for the target actor id, plus a submit button, next to the
existing claim/release controls. No new screen. Delegation is
participant-facing. It belongs where claim/release already live, not in
the admin or studio area.

## Risks / Trade-offs

- **A delegate target that never logs in receives a task no one can act
  on**. Mitigation: this mirrors today's risk with a mistyped or stale
  `claimedBy`/`assignedTo` id. The original candidates can reclaim the
  step once the delegate, or anyone, releases it. Release only requires
  holding the claim. No new mitigation is in scope here.
- **A delegation loop is legal and needs no special handling**. A
  delegates to B; B later delegates back to A. Mitigation: none needed.
  Each delegation is an independent, auditable event. A loop is a valid
  usage pattern, a back-and-forth handoff, not a bug.
- **The `updateAssignment` shared sequence now has three callers instead
  of two**. Mitigation: low risk. The existing
  `assignment-claim-release-consolidation` spec already frames the
  sequence as extensible per operation, each with its own guard. The new
  function `delegateClaim` adds its own guard and next-state computation.
  Only the event-payload construction inside `updateAssignment`
  generalizes; `claimStep`/`releaseClaim`'s own `{ actorId }` payload
  stays exactly as it is today.
- **A participant has no in-app way to find another actor's id**. Actor
  ids are opaque UUIDs, not emails, per `src/auth/users.ts`.
  `packages/app` exposes no user directory or picker; only
  `packages/admin`'s Users screen shows one. Mitigation: none in this
  change. The original approved design already scoped a directory lookup
  as a non-goal. A delegating participant needs the target id from
  somewhere outside the app today, for example an admin. This is a real,
  accepted usability limit, not something this change causes.
- **Two places outside this change's spec deltas hardcode "ten kinds"**,
  and need updating once this ships. CLAUDE.md's "Runtime record"
  section names all ten `InstanceEvent` kinds and treats the set as
  additive. `openspec/specs/runtime-events/spec.md`'s own Purpose
  section carries the same list in a table. Neither is a requirement, so
  the delta mechanism leaves both untouched. Mitigation: `tasks.md` adds
  an explicit documentation task for both.

## Migration Plan

No data migration. `InstanceEvent`'s discriminated union gains one
additive kind, `assignment.delegated`. Existing rows and every other kind
keep their current shape. No schema change to `instances` or
`instance_events` beyond the new kind's payload shape. The new route and
UI action are purely additive: no existing route, screen, or behavior
changes. Rollback is a plain revert of the change, since nothing
downstream depends on the new kind or route existing.

## Open Questions

None. The design reuses existing mechanisms end to end. No unresolved
technical decision remains.
