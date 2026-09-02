<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## ADDED Requirements

### Requirement: The direct read consults the set

The engine SHALL answer a direct read of one instance from the same rule the
visible scope lists by. A direct read is `getInstanceView`. It is also every
other Runtime API Layer call that shares its loader: comments and
attachments, in both directions.

For an ordinary instance and a non-administrative actor, the direct read SHALL
admit the actor on either of two grounds:

- a live assignment: the actor holds the current step's claim, or is an
  eligible candidate on it;
- participation, with no revocation naming the actor on this instance. The
  actor started the instance. Or the instance's principal set holds the
  actor's id, a role of theirs, or a group of theirs.

A live assignment SHALL outrank a revocation, and SHALL clear nothing. The
"A live assignment outranks a revocation" requirement states that rule for
the list. Here it applies to one instance.

The actor's principal set SHALL resolve as the "An actor's principal set
resolves from the credential" requirement states. That is id, roles and group
memberships, from the credential alone. The engine SHALL resolve that set in
one function. The direct read, the visible scope and report sharing SHALL all
call it.

A refused actor SHALL get the same `AuthorizationError` an unrelated actor
gets. The refusal SHALL disclose nothing about the instance.

A test instance SHALL keep the narrower rule of the `runtime-api` capability.
Its principal set is not consulted.

The list and the direct read SHALL agree. An instance the visible scope
returns to an actor SHALL open for that actor. One it withholds SHALL refuse
them. The one exception is the one `scope=visible` already has. A test
instance never reaches a participant list, and its starter still opens it.

#### Scenario: A past participant opens the instance

- **WHEN** an actor was a candidate on a step the instance has since left
- **AND** that actor holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` returns the view

#### Scenario: A group member opens the instance

- **WHEN** the instance holds group G as a principal and the actor is a member
  of G
- **THEN** `getInstanceView` returns the view

#### Scenario: A revoked participant is refused

- **WHEN** an administrator has revoked the actor from the instance
- **AND** the actor holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` throws `AuthorizationError`

#### Scenario: A revoked starter is refused

- **WHEN** an administrator has revoked the instance's starter
- **AND** the starter holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` throws `AuthorizationError`

#### Scenario: A live assignment outranks the revocation on the direct read

- **WHEN** a revoked actor holds the current step's claim, or is an eligible
  candidate on it
- **THEN** `getInstanceView` returns the view
- **AND** the revocation is still stored

#### Scenario: The revocation applies again after the assignment ends

- **WHEN** an assignment has been overriding a revocation on the direct read
- **AND** the instance moves to a step that does not assign that actor
- **THEN** `getInstanceView` throws `AuthorizationError` for that actor

#### Scenario: A granted actor opens the instance

- **WHEN** an administrator has granted an actor an instance they never took
  part in
- **THEN** `getInstanceView` returns the view to that actor

#### Scenario: Comments and attachments follow the same rule

- **WHEN** a past participant lists or posts comments on the instance, or
  uploads, lists or downloads an attachment
- **THEN** the call succeeds
- **AND** the same call by a revoked participant with no live assignment
  throws `AuthorizationError`

#### Scenario: A test instance keeps its own rule

- **WHEN** a test instance holds a group as a principal
- **AND** a member of that group, who did not start it, requests the view
- **THEN** `getInstanceView` throws `AuthorizationError`
