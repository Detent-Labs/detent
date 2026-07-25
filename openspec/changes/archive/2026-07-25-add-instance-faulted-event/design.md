## Context

`resolveAutomatic` detects a non-terminating cascade by remembering every
`currentStepId` it entered; re-entering one means the guards can never resolve
differently (guards are pure, `data` does not change during a cascade). It parks
the instance and throws `AutomaticCascadeLoop`.

The park is `markFaulted`: a single `UPDATE instances SET body = jsonb_set(body,
'{status}', ...) WHERE instance_id = $1 AND transition_seq = $2`. The `WHERE`
clause is the OCC predicate, so the flip lands only if the instance is still at
the seq the cascade left it at.

What survives the park: the committed hops (each has its own `HistoryEntry`) and
the `faulted` status. What does not: the fact that a *cascade loop* caused the
park, and which step repeated. That is carried only by the thrown exception,
which dies with the request. The `automatic-transitions` spec already notes the
asymmetry — a crash mid-cascade leaves "no event, no history entry, and no
`faulted` status" — but says nothing about what a *detected* loop persists
beyond the status.

`InstanceEvent` is the record for exactly this shape of fact: real, not
reconstructable, and carrying no step change. Eight kinds exist; two of them
(`assignment.claimed`/`released`) were added by a later change and specced in the
capability that owns them rather than in `runtime-events`.

## Goals / Non-Goals

**Goals:**

- A detected cascade loop leaves a persisted, queryable record naming the
  repeated step and the reason for the park.
- The record and the status flip are atomic — no `faulted` instance without its
  event, no event for a flip that lost its OCC race.
- Follow the established event precedent exactly; introduce no new mechanism.

**Non-Goals:**

- Any other fault cause. `faulted` is set in exactly one place today; this change
  does not go looking for others to instrument.
- Recovering or un-faulting an instance. The event records the park, it does not
  make it reversible.
- Reworking `AutomaticCascadeLoop`. The exception stays as the caller-facing
  signal; the event is the durable one. They are complementary, not redundant.
- Backfilling events for instances already parked `faulted`. The fact was never
  recorded and cannot be reconstructed.

## Decisions

### The kind is specced in `automatic-transitions`, not `runtime-events`

`runtime-events` defines the record *shape* and names the six kinds it
introduced. `assignment.claimed` set the precedent that a new kind is specced in
the capability that owns the fact producing it. The cascade loop is owned by
`automatic-transitions`, so the delta lands there and `runtime-events` needs no
change.

*Alternative:* a `runtime-events` delta that grows the kinds table. Rejected —
it makes `runtime-events` a registry every future change has to touch, and it
already is not one (the table is stale w.r.t. the two assignment kinds by
design, not by neglect).

### `markFaulted` wraps flip + append in `db.begin`

The event must not exist if the flip lost its OCC race, and the flip must not
exist without the event. Both statements go in one transaction.

This is safe because `db` is never an already-open transaction at this call
site: `resolveAutomatic` receives a top-level `SQL` handle from every caller
(`api.ts` create/submit, `transition.ts` commit paths, `fireTimer`), each of
which is called *after* its own transaction committed and returned an instance.
Nesting `begin` inside an open transaction is what would break, and no path does
that.

*Alternative:* append the event outside the transaction, after the flip.
Rejected — a crash between the two leaves a `faulted` instance with no reason
recorded, which is the exact defect being fixed.

*Alternative:* pass the caller's transaction in. Rejected — no caller has one
open at that point, so the parameter would be permanently `undefined`.

### The flip's OCC predicate decides whether the event is written

The `UPDATE` is guarded on `transition_seq`. If it matches zero rows (a
concurrent actor moved the instance), the transaction writes no event. The
implementation checks the update's row count and skips the append on zero rather
than writing an event for a park that did not happen.

### Payload is `{ stepId, reason }` with a single-member reason enum

`stepId` is the repeated step — the same value `AutomaticCascadeLoop` carries,
and the only actionable detail for the operator reading the record.

`reason` is `z.enum(["automatic-cascade-loop"])`. A single-member enum looks
like speculative generality, but it is the shape `timerUnarmedReason`,
`migrationSkipReason`, and `migrationTransformDroppedReason` all use, and it is
what lets a second fault cause be added later without changing the payload
contract or the readers switching on it. The alternative — no `reason`, inferred
from the kind — makes `instance.faulted` mean "loop" forever, and renaming a
persisted kind is not additive.

### The event carries no `ActionOutcome`s

The park enqueues nothing. Per the contract's rule, a kind that enqueues no
actions must not carry an `actions` field at all, so a reader is never invited to
expect outcomes that cannot exist. Same as `migration.skipped`.

### The envelope's `version` is the instance's version

The instance did not move, so `stepId` resolves against the version it is pinned
to. No target/source ambiguity exists here (unlike
`migration.transform-dropped`).

## Risks / Trade-offs

- **`markFaulted` becomes transactional, and it runs on the error path of a
  cascade** → if the `begin` itself fails, the instance is left `running` on a
  looping definition and `AutomaticCascadeLoop` still throws. That is strictly
  no worse than today's failure mode (the bare `UPDATE` could fail the same
  way), and the thrown error still reaches the caller.

- **A single-member enum is one member of speculative surface** → accepted
  deliberately; it is a three-word literal, it matches three existing precedents
  in the same file, and it removes the need to touch the persisted kind name
  when a second cause appears.

- **Nine arms on `instanceEvent` makes the union long** → the union is meant to
  grow additively; the contract says so explicitly. No structural change is
  warranted at nine.

## Migration Plan

None. `instance_events.kind` is a text column with no enum constraint, so no DDL
runs. The change is additive to the discriminated union: bodies, published
definitions, and existing event rows are untouched, and instances already parked
`faulted` simply have no such event (they never did).

Rollback is reverting the code — no persisted state depends on the new kind
existing, though rows written while it was deployed would then fail
`instanceEvent.parse` on read. Deleting `WHERE kind = 'instance.faulted'` clears
that.

## Open Questions

None.
