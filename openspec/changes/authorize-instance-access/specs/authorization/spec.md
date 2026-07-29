## ADDED Requirements

### Requirement: Reading one instance is authorized by relationship to it

`getInstanceView` SHALL authorize the caller against the instance before
returning it. An actor MAY read an instance when at least one of the following
holds, evaluated against the instance's currently committed state:

- the actor carries `ADMIN_ROLE`;
- `instance.startedBy` equals the actor's id;
- the current step's assignment is claimed by the actor
  (`instance.assignment.claimedBy === actor.id`);
- the actor is an eligible candidate on the current step's assignment, decided
  by the same `isEligibleCandidate` predicate `claimStep` uses — id or role
  match against one flat candidate namespace.

An actor satisfying none of them SHALL be rejected with `AuthorizationError`
(403, `type: "authorization"`), and the instance SHALL NOT be read out to
them in any form.

The relationship is evaluated against the **current** step, not the
instance's history: an actor who was a candidate on an earlier step, never
claimed it, and holds no other relationship loses the read when the instance
advances. This mirrors `scope=mine`, which stops listing the instance at the
same moment for the same reason.

The check SHALL live in the runtime API (`getInstanceView`), not in the HTTP
route handler, so an in-process caller of the documented library seam cannot
bypass it — the placement `cancelInstance` already uses.

This is a **BREAKING** tightening of a route that previously required only a
valid token. An integration account that reads instances it has no
relationship to must be granted `system:admin` via `src/auth/cli.ts
set-roles`.

#### Scenario: The instance's starter reads it

- **WHEN** the actor that created an instance requests `GET /instances/:id`
- **THEN** the response is 200 and carries the resolved view

#### Scenario: The current claimant reads it

- **WHEN** the actor holding the current step's claim requests the view, and
  did not start the instance
- **THEN** the response is 200

#### Scenario: A candidate on the current step reads it

- **WHEN** an actor eligible by id or by role on the current step's
  unclaimed assignment requests the view, and holds no other relationship
- **THEN** the response is 200

#### Scenario: An unrelated authenticated actor is refused

- **WHEN** an authenticated actor holding no reserved role, who did not start
  the instance, does not hold its claim, and is not a candidate on its
  current step, requests the view with a valid instance id
- **THEN** the response is 403 with `error.type` `authorization`, and no
  field value from `instance.data` appears in the response

#### Scenario: A past candidate loses the read when the instance moves on

- **WHEN** an actor was an eligible candidate on the step an instance has
  since left, never claimed it, did not start it, and is not a candidate on
  the current step
- **THEN** the response is 403

#### Scenario: An operator reads any instance

- **WHEN** an actor holding `system:admin` requests the view for an instance
  they have no other relationship to
- **THEN** the response is 200, consistent with the same role's access to
  `scope=all` and to the record route

#### Scenario: A refusal discloses nothing about existence

- **WHEN** an actor with no relationship and no `system:admin` requests the
  view for an instance id that does not exist
- **THEN** the response is the same 403 `authorization` an existing but
  unrelated instance produces — the two cases are indistinguishable to the
  caller
