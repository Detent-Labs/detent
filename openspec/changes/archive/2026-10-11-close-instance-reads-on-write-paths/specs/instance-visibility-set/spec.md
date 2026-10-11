## ADDED Requirements

### Requirement: A revocation holds on the started scope

The started scope SHALL withhold an instance from its starter while a
revocation names that starter. The scope SHALL keep the instance while the
starter holds the claim on its current step. It SHALL also keep the instance
while the starter is a candidate and nobody holds the claim. That
is the assignment branch of `scope=visible`, applied to this list. A candidate
on a step another actor claimed does not keep the row here. The direct read
still opens that instance.

A caller holding `ADMIN_ROLE` is the exception. The scope SHALL keep every
instance that caller started, because a revocation never reaches the direct
read of an administrator.

The started scope and the direct read SHALL agree on revocation. An instance
the direct read refuses to the starter on that ground SHALL NOT appear in the
starter's started scope. The live-assignment ground keeps the divergence that
"The direct read consults the set" records. Each side carries its own
predicate there.

This requirement qualifies the `scope=started` paragraph of the `http-wrapper`
requirement "List instances over HTTP". That paragraph says the scope does not add an
assignment predicate of its own. The scope now adds one term: the revocation
test with its live-assignment override.

#### Scenario: A revoked starter loses the row

- **WHEN** an administrator revokes the starter of a completed instance
- **AND** the starter has no claim and no candidacy on its current step
- **THEN** the started scope returns a page without that instance

#### Scenario: A live assignment keeps the row

- **WHEN** an administrator revokes the starter of a running instance
- **AND** the starter holds the claim on its current step
- **THEN** the started scope returns that instance

#### Scenario: A candidate on a claimed step loses the row

- **WHEN** an administrator revokes the starter of a running instance
- **AND** the starter is a candidate on its current step, and another actor
  holds the claim
- **THEN** the started scope returns a page without that instance

#### Scenario: Restoring brings the row back

- **WHEN** an administrator restores a revoked starter
- **THEN** the started scope returns the instance again

#### Scenario: A revocation hides no other row

- **WHEN** an administrator revokes the starter from one instance
- **THEN** the started scope still returns every other instance the starter
  began

#### Scenario: A revocation never shortens a page

- **WHEN** a starter began five instances and a revocation names one of them
- **AND** the starter walks the started scope with a limit of two
- **THEN** each page except the last holds two rows
- **AND** the walk returns each of the other four instances once

#### Scenario: An operator who started a case keeps the row

- **WHEN** a caller holding `ADMIN_ROLE` started an instance
- **AND** an administrator revokes that caller from it
- **THEN** the started scope still returns that instance to that caller

### Requirement: The record read honors a revocation on its starter branch

`getInstanceRecord` SHALL refuse a starter whom a revocation names. The refusal
applies to the branch where an author or developer reads the record of an
instance they started. A caller holding `ADMIN_ROLE` reads the record whatever
a revocation says. A live assignment outranks the revocation, as it does on the
direct read. A test instance keeps its own rule: its starter reads its record.

The refusal SHALL be the `AuthorizationError` that an unrelated actor gets.

This requirement qualifies the two-path check that the `http-wrapper`
requirement "Read an instance's record over HTTP" describes. The `authorization`
capability states the changed permit.

#### Scenario: A revoked author cannot read the record

- **WHEN** an author started a published instance
- **AND** an administrator revoked that author from it
- **AND** the author has no claim and no candidacy on its current step
- **THEN** `getInstanceRecord` throws `AuthorizationError`

#### Scenario: A restored author reads the record

- **WHEN** an administrator restores that author
- **THEN** `getInstanceRecord` returns the record

#### Scenario: An administrator reads the record of a revoked starter

- **WHEN** an administrator reads the record of an instance after a
  revocation names its starter
- **THEN** `getInstanceRecord` returns the record

#### Scenario: A test instance's starter reads the record

- **WHEN** an author started a test instance and a revocation names the author
- **THEN** `getInstanceRecord` returns the record

### Requirement: A visibility change names a known account

Revoking and granting SHALL check the named actor against the local account
directory. The check runs only where the acting administrator's own id
resolves in that directory. A target the directory does not hold SHALL raise
`UnknownActorError`, naming the target. The engine SHALL write no denial, no
principal and no event.

This is the rule `delegateClaim` applies to its target. A deployment on an
external identity provider has no directory entry for its administrators, so
no target check runs there.

Restoring SHALL NOT run the check. An account that left the directory after a
revocation must stay restorable.

The check SHALL run after the permission check. A caller without standing
meets the refusal whatever target it names. Otherwise the route would answer
whether an arbitrary account exists.

#### Scenario: A mistyped target raises an error

- **WHEN** an administrator whose own id resolves in the local account
  directory revokes `alice.m`, and the directory holds only `alice_m`
- **THEN** the call throws `UnknownActorError` naming `alice.m`
- **AND** the engine stores no revocation and appends no event

#### Scenario: A grant to an unknown account raises an error

- **WHEN** an administrator whose own id resolves in the directory grants an
  instance to an unknown account
- **THEN** the call throws `UnknownActorError`
- **AND** the instance's principal set stays as it was

#### Scenario: Restoring works without a directory entry

- **WHEN** a revoked account no longer exists in the directory
- **AND** an administrator restores it
- **THEN** the engine removes the revocation

#### Scenario: A caller without standing learns nothing about accounts

- **WHEN** an actor holding no standing revokes an unknown account
- **THEN** the call throws `AuthorizationError`, not `UnknownActorError`

#### Scenario: An external identity provider skips the check

- **WHEN** the acting administrator's id has no directory entry
- **THEN** the engine accepts a revocation of any non-empty target name

### Requirement: A visibility change discloses nothing about an unknown instance

Revoke, restore and grant SHALL refuse an unknown instance id. The refusal
SHALL match the one a known instance gives a caller without standing. Both
SHALL throw `AuthorizationError` with the same message text.

#### Scenario: An unknown instance id gets the opaque refusal

- **WHEN** any caller grants visibility on an instance id that resolves to
  nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: Both refusals match

- **WHEN** a caller without standing changes visibility on a known instance
- **THEN** the call throws an `AuthorizationError` with the same message text
  as in the unknown case

### Requirement: A write call reveals a finished instance only to a reader

Submit and form-draft save SHALL report a non-running instance to readers
only. A reader is a caller who may read the instance. Cancel by the starter
path SHALL return a finished instance's status on the same condition. The
direct-read rule decides. A standing revocation refuses, and a live assignment
outranks it.

A caller who may not read the instance SHALL get `AuthorizationError`. The
call then reveals no status. An unrelated actor and a starter whom a
revocation names both meet it. On submit and form-draft save the refusal
carries the text of the submit refusal on a running instance. The text does
not separate a finished instance from a running or an unknown one.

A reader keeps the current answer. Submit and form-draft save throw
`InstanceNotRunningError` with the status. Cancel returns the write result. The
loser of a double submission is a reader, because a claim adds its claimant to
the principal set.

Cancel by `system:cancel-any` or by a stored `cancel` grant is outside this
requirement. Those callers hold authority without a read right. Re-cancelling a
cancelled parent also resumes its child sweep, and that must keep working.

`runtime-api` states the same rule in its boundary requirement and in its
form-draft requirement. `claimStep`, `releaseClaim` and `delegateClaim` keep
the order of the boundary requirement. The `http-wrapper` typed-error scenario
that maps a submit against a non-running instance to `409` holds for a reader.
A non-reader gets `403` there.

A revocation still narrows reads alone. On a running instance this requirement
changes no write authority.

#### Scenario: An unrelated actor submitting to a cancelled instance learns no status

- **WHEN** an actor who may not read a cancelled instance calls
  `submitAndTransition` on it
- **THEN** the call throws `AuthorizationError`, not `InstanceNotRunningError`

#### Scenario: An unrelated actor saving a draft learns no status

- **WHEN** the same actor calls `saveInstanceDraft` on a completed instance
- **THEN** the call throws `AuthorizationError` and stores nothing

#### Scenario: A stranger cannot tell a finished instance from a running one

- **WHEN** an actor who may not read either instance submits to a cancelled
  instance
- **AND** the same actor submits to a running instance whose step has no
  assignment
- **THEN** both calls throw `AuthorizationError`
- **AND** the two message texts differ only in the instance id

#### Scenario: The starter still learns the status

- **WHEN** the starter, whom no revocation names, calls `submitAndTransition`
  on a cancelled instance
- **THEN** the call throws `InstanceNotRunningError` naming that status

#### Scenario: The losing claimant of a double submission still learns it lost

- **WHEN** the claimant submits twice at once, and the first submission leaves
  the instance non-running
- **THEN** the second call throws `InstanceNotRunningError`

#### Scenario: A revoked starter cancels a completed instance

- **WHEN** an administrator revoked the starter of a completed instance
- **AND** the starter has no claim and no candidacy on its current step
- **AND** the starter calls `cancelInstance` on it
- **THEN** the call throws `AuthorizationError`

#### Scenario: A revoked starter submits to a completed instance

- **WHEN** the same starter calls `submitAndTransition` on it
- **THEN** the call throws `AuthorizationError`

#### Scenario: A revoked starter saves a draft on a completed instance

- **WHEN** the same starter calls `saveInstanceDraft` on it
- **THEN** the call throws `AuthorizationError` and stores nothing

#### Scenario: A revoked starter keeps write authority on a running instance

- **WHEN** a revoked starter calls `submitAndTransition` on a running instance
  whose current step has no assignment
- **THEN** the submission commits, as it did before this change

### Requirement: Submit and form-draft save refuse an unknown instance to a stranger

`submitAndTransition` and `saveInstanceDraft` SHALL answer an instance id that
resolves to nothing, for a caller without `ADMIN_ROLE`, with the
`AuthorizationError` that a refused submit gives. The message text SHALL match
the text a known instance gives a caller without standing. A caller holding
`ADMIN_ROLE` keeps `NotFoundError`, as the direct read does.

This closes the existence answer on those two calls and nothing more. The
`not-claimed` and `not-claimant` refusals still tell a caller that an instance
exists and has an assignment. The task screen reads both types.

#### Scenario: A stranger submitting to an unknown instance gets the opaque refusal

- **WHEN** an actor without `ADMIN_ROLE` calls `submitAndTransition` on an
  instance id that resolves to nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: A stranger saving a draft on an unknown instance gets the opaque refusal

- **WHEN** an actor without `ADMIN_ROLE` calls `saveInstanceDraft` on an
  instance id that resolves to nothing
- **THEN** the call throws `AuthorizationError`

#### Scenario: An administrator still gets not-found

- **WHEN** an actor holding `ADMIN_ROLE` calls `submitAndTransition` on an
  instance id that resolves to nothing
- **THEN** the call throws `NotFoundError`
