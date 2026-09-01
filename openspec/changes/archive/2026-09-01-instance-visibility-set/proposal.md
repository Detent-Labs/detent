## Why

Nothing in the engine answers "who may see instance 101".

`assignment.candidates` covers the current step alone. A participant who
approves an instance loses sight of it the moment it moves on. Beside that,
`instance-query`'s own spec states the read is not implicitly scoped to the
calling actor. `GET /instances` defaults to `scope=all`. A process-scoped
`read` grant therefore exposes every instance of that process.

The owner approved this shape on 2026-09-01, from a summary rather than the
full analysis. Visibility accumulates from participation: the engine records
who took part, and no author configures anything. The owner deferred an
authored `visibleTo` field list to a later change. A scope carried inside a
role string stays rejected.

The owner rejected one part of the first proposal. That version made the set
purely additive, with no way to take access away. Access has to stay
changeable, so this change ships revocation with the set rather than after
it.

This change is the first of four and the only one that touches storage. It adds
the set and one narrowing consumer. It widens no existing answer, so no caller
changes behaviour.

## What Changes

- A new `instance_principals` relation: one row per `(instance_id, principal)`,
  where a principal is an actor id, a role string, or a group id. It carries a
  denormalized `created_at` so one index serves both the principal lookup and
  the list's keyset order.
- The engine appends principals at four write points, inside the caller's own
  transaction. Those points are a step entry, instance creation, claim and
  delegation, and a subprocess spawn. The step-entry point is `applyStepEntry`,
  which the migration path also uses. A spawn copies the parent's principals
  into the child.
- No ordinary workflow event removes a principal. Leaving a step, releasing a
  claim, losing a candidacy and a migration all leave one in place. Nothing
  takes a participant's access away by accident.
- An administrator revokes one named person from one named instance, and
  restores it again. A revocation names the actor, not the principal they
  matched by. An actor usually matches through a role or a group. Deleting that
  principal would revoke the instance for every other holder of it.
- A live assignment outranks a revocation at read time and clears nothing.
  Otherwise the engine could hand someone a task they cannot open. The
  revocation stays stored, so it applies again once the assignment ends. A
  routing decision therefore cannot permanently undo an administrative one.
- An administrator also grants a person an instance they never took part in.
- Every revocation, restoration and grant appends a `visibility.changed`
  runtime event naming the administrator and the affected actor. An assignment
  that clears a revocation appends none, since its own transition records it.
- A fifth `Permission` value, `"visibility"`, gates those three. It takes the
  operator role today. A per-process administrator later needs one grant row
  and no code change.
- `redactInstance` deletes an instance's principal rows and its revocation
  rows. Each names a person, so neither survives a redaction.
- A backfill derives principals for pre-existing instances from
  `history_entries.actorId`, `body.startedBy` and `body.assignment`.
- `GET /instances` accepts a fourth `scope` value, `visible`. It returns the
  instances whose principal set intersects the caller's own id, roles and group
  memberships.
- The read compiles to a `UNION ALL` of one ordered, limited index scan per
  principal, merged by Postgres. It does not compile to
  `WHERE principal = ANY($1)` with a `DISTINCT`, which sorts to disk once a
  broad role is in the caller's set.

Not in this change, deliberately:

- `getInstanceView` and `loadInstanceForActor` keep today's rule. Change 2 widens
  them, and widening is a separate review from narrowing.
- `executeReport` keeps today's rule. Change 3 filters it per row.
- `cycleTime`, `bottleneck` and `sla` stay unfiltered permanently. They return
  distributions over steps, never instance ids or field values. A filtered
  population would hand two readers two different cycle times. Nothing on
  screen would explain the difference.
- No change to the definition contract. This change adds no `ProcessBody` key,
  so `definitionHash` does not move. The `visibility.changed` event kind lives in
  the runtime record beside it, which the contract already admits additively.
  No `visibleTo`.
- No screen. The app area's "cases I took part in" list is a follow-up with its
  own `end-user-app` delta.

## Capabilities

### New Capabilities

- `instance-visibility-set`: the accumulated participant set. It covers what a
  principal is and the four points that append one. It also covers what removes
  one, the revocation rules, the backfill, and the read form.

### Modified Capabilities

- `instance-query`: a fourth `scope` value, `visible`. Every other scope keeps
  the requirement that the read is not implicitly scoped to the caller. The
  participant-facing scope list grows from two entries to three.
- `data-retention`: redaction clears personal data across six relations rather
  than five. The instance's visibility state is the sixth.
- `persistence`: `initSchema` creates the new relation. The index backing the
  principal lookup joins the predicates this spec already requires an index for.
- `transition-execution`: a step-entry commit writes one further relation. It
  does so in the same transaction as the instance row, the history entry, the
  events and the outbox rows.
- `authorization`: the `Permission` type carries five values rather than four.
  The fifth is `"visibility"`, and it takes the operator role.
- `permission-grant-administration`: the grant body accepts the fifth
  permission.
- `runtime-events`: a fourteenth event kind, `visibility.changed`.

## Impact

Engine: `src/engine/store.ts` (`initSchema`, `createInstance`),
`src/engine/transition.ts` (`applyStepEntry`, `updateAssignment`),
`src/engine/seeded-create.ts` (`createSeededInstance`, the seam the subprocess
spawn and `process.start` share), `src/engine/retention.ts` (`redactInstance`).

Contract: `src/schema/definition.ts` gains a `visibility.changed` kind on
`instanceEvent`. This is additive and touches no part of `ProcessBody`, so
`definitionHash` does not move and no published definition changes.

Auth: `src/auth/authorize.ts` (`Permission`, `PERMISSION_ROLE`) and
`src/auth/grants.ts` (`grantSchema`'s enum). The `permission_grants` relation
needs no change, since its `permission` column is text.

Runtime API Layer: `src/runtime/api.ts` (`listInstances`, and a principal-set
fragment beside `buildInstanceWhere`).

HTTP: `src/http/routes.ts` (`parseScope`, `handleListInstances`), plus three
routes for revoke, restore and grant under
`/instances/:instanceId/visibility*`. They sit beside `handleCancel` rather
than under `/admin/*`, which keeps the `authorization` rule that an `/admin/*`
route calls `requireRole`.

Auth: reads `getGroupsForMember` (`src/auth/groups.ts`), which already exists
for `listMyReports`.

Datastore: two new relations and one new index. The backfill runs once and
reads `history_entries`, which is already indexed by instance.

No browser package changes. No published definition becomes invalid, because
the change only narrows result sets and adds no `ProcessBody` key.
