<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## MODIFIED Requirements

### Requirement: Reading one instance is authorized by relationship to it

`getInstanceView` SHALL authorize the caller against the instance before
returning it. An actor MAY read an ordinary instance when at least one of the
following holds. The first three evaluate against the instance's currently
committed state. The fourth evaluates against its principal set and its
revocations:

- the actor carries `ADMIN_ROLE`;
- the actor holds the current step's claim
  (`instance.assignment.claimedBy === actor.id`);
- the actor is an eligible candidate on the current step's assignment. The
  same `isEligibleCandidate` predicate `claimStep` uses decides this, an id or
  role match against one flat candidate namespace;
- the actor took part, and holds no revocation on the instance. Taking part
  means one of two things. `instance.startedBy` equals the actor's id. Or the
  instance's principal set holds the actor's id, a role of theirs, or a group
  of theirs. The `instance-visibility-set` capability defines that set.

The second and third grounds are the live grounds. A revocation SHALL NOT
remove them, and it never reaches `ADMIN_ROLE`. The engine never hands an actor a task they cannot open. The
revocation stays stored, so it applies again once the assignment ends. The
`scope=visible` list already follows that rule. The direct read SHALL agree
with the list on every instance.

An actor satisfying none of them SHALL be rejected with `AuthorizationError`
(403, `type: "authorization"`). The instance SHALL NOT be read out to them in
any form. A revoked actor gets that same refusal.

The set accumulates. Step entry added every candidate as a principal. A
candidate on an earlier step therefore keeps the read after the instance
advances. At that moment the `scope=mine` list drops the instance. The
`scope=visible` list keeps it. The direct read follows the visible list.

A test instance (`kind: "test"`) keeps the narrower rule the `runtime-api`
capability states. A non-administrative actor reads it only as its own
`startedBy`. Its principal set is not consulted.

The check SHALL live in the runtime API (`getInstanceView`), not in the HTTP
route handler. An in-process caller of the documented library seam then
cannot bypass it. `cancelInstance` already uses that placement.

An integration account that reads unrelated instances needs `system:admin`,
granted via `src/auth/cli.ts set-roles`.

#### Scenario: The instance's starter reads it

- **WHEN** the actor that created an instance requests `GET /instances/:id`
- **THEN** the response is 200 and carries the resolved view

#### Scenario: The current claimant reads it

- **WHEN** the actor holding the current step's claim requests the view
- **THEN** the response is 200

#### Scenario: A candidate on the current step reads it

- **WHEN** an actor eligible by id or by role on the current step's
  unclaimed assignment requests the view
- **AND** that actor holds no other relationship
- **THEN** the response is 200

#### Scenario: An unrelated authenticated actor is refused

- **WHEN** an authenticated actor without `system:admin` requests the view
- **AND** that actor did not start the instance and holds no claim
- **AND** that actor is no candidate on the current step and matches no
  principal of the instance
- **THEN** the response is 403 with `type: "authorization"`, and no part of
  the instance is disclosed

#### Scenario: A past candidate loses the read when the instance moves on

- **WHEN** an actor was an eligible candidate on a step the instance has
  since left
- **AND** that actor is not a candidate on the current step
- **AND** an administrator has revoked that actor from the instance
- **THEN** the response is 403

#### Scenario: A past candidate keeps the read when the instance moves on

- **WHEN** an actor was an eligible candidate on a step the instance has
  since left
- **AND** that actor never claimed it, did not start it, and is not a
  candidate on the current step
- **THEN** the response is 200

#### Scenario: A past participant matched by group reads it

- **WHEN** an instance holds group G as a principal
- **AND** a member of G with no live assignment requests the view
- **THEN** the response is 200

#### Scenario: A revoked participant is refused

- **WHEN** an administrator has revoked an actor from an instance
- **AND** that actor holds no claim and no candidacy on the current step
- **THEN** the response is 403 with `type: "authorization"`, the same one an
  unrelated actor gets

#### Scenario: A revoked starter is refused

- **WHEN** an administrator has revoked the instance's starter
- **AND** the starter holds no claim and no candidacy on the current step
- **THEN** the response is 403 with `type: "authorization"`

#### Scenario: A revoked claimant reads it while the claim lasts

- **WHEN** a revoked actor holds the current step's claim, or is an eligible
  candidate on it
- **THEN** the response is 200
- **AND** the revocation is still stored

#### Scenario: A granted actor reads it

- **WHEN** an administrator has granted an actor an instance they never took
  part in
- **THEN** that actor's request for the view returns 200

#### Scenario: An operator reads any instance

- **WHEN** an actor holding `system:admin` requests the view for an instance
  they have no other relationship to
- **THEN** the response is 200, consistent with the same role's access to
  `scope=all` and to the record route

#### Scenario: A refusal discloses nothing about existence

- **WHEN** an actor with no relationship and no `system:admin` requests the
  view for an instance id that does not exist
- **THEN** the response is the same 403 `authorization` an existing but
  unrelated instance produces. The caller cannot tell the two cases apart
