# Spec Delta

## ADDED Requirements

### Requirement: An instance.transition action's instanceIdField binds to an instance query over the action's process

Publishing SHALL reject an `instance.transition` action unless its
`instanceIdField` names a field bound to a data source of type
`"instance.query"`. That source's `processId` SHALL equal the action's
`processId`. The error SHALL name the action's location, the field id and the
missing or mismatching binding.

The binding restricts the field's value. The submit-time option check accepts
only a value that the bound source offers.

#### Scenario: A field without a data source rejects the publish
- **WHEN** an `instance.transition` action names an `instanceIdField` that
  declares no `dataSource`
- **THEN** publishing throws, names the action's location and that field id,
  and persists no version

#### Scenario: A field with a fixed option list rejects the publish
- **WHEN** the `instanceIdField` declares `options` and no `dataSource`
- **THEN** publishing throws and persists no version

#### Scenario: A field bound to another data source type rejects the publish
- **WHEN** the `instanceIdField` declares a `dataSource` whose type is not
  `"instance.query"`
- **THEN** publishing throws and persists no version

#### Scenario: A field bound to a query over another process rejects the publish
- **WHEN** the `instanceIdField` declares an `"instance.query"` data source
  whose `processId` differs from the action's `processId`
- **THEN** publishing throws, names both process ids, and persists no version

#### Scenario: A field bound to a query over the target process publishes
- **WHEN** the `instanceIdField` declares an `"instance.query"` data source
  whose `processId` equals the action's `processId`
- **THEN** publishing does not reject the action for that binding

#### Scenario: A self-targeting action with a bound field publishes
- **WHEN** an action targets the process the author is publishing
- **AND** its `instanceIdField` declares an `"instance.query"` data source over
  that same process
- **THEN** publishing does not reject the action for that binding

### Requirement: An identical re-publish skips the binding check

A publish that matches an existing version by hash SHALL return before the binding check. Every other publish-path check does the same. A published version stays immutable. The handler does not recheck the binding at delivery.

#### Scenario: A re-publish of an unbound body stays a no-op
- **WHEN** an author publishes again a body that predates the binding rule, with an
  unbound `instanceIdField`
- **THEN** publishing returns the existing version and rejects nothing

### Requirement: The publishing author holds migrate on an instance.transition target

Publishing SHALL reject a body carrying an `instance.transition` action when
the publishing actor lacks the `migrate` permission on the action's target
process. The check SHALL use the engine's process-scoped permission gate. It
SHALL run after the read grant check, once per target process. It SHALL run only when
the caller supplies the acting actor.

#### Scenario: An author without migrate on the target fails to publish
- **WHEN** an actor holding `read` and no `migrate` on the target process
  publishes a body carrying an `instance.transition` action naming it
- **THEN** publishing fails with an authorization error naming the target
  process, and the engine persists no version

#### Scenario: A self-targeting action needs migrate too
- **WHEN** an action targets the process the author is publishing
- **AND** the actor lacks `migrate` on that process
- **THEN** publishing fails with an authorization error

#### Scenario: The global developer role publishes
- **WHEN** an actor holding the global developer role publishes such a body
- **THEN** publishing succeeds, subject to the other checks

#### Scenario: A stored grant publishes
- **WHEN** an actor holds a stored `migrate` grant on the target process
- **THEN** publishing succeeds, subject to the other checks

#### Scenario: A publish with no actor supplied skips the check
- **WHEN** a caller publishes such a body without supplying an actor
- **THEN** publishing succeeds, and the `migrate` grant is not consulted

#### Scenario: Publishing reports one missing grant once per target process
- **WHEN** a body carries two `instance.transition` actions naming one target
  process
- **AND** the publishing actor lacks a `migrate` grant on that process
- **THEN** publishing fails once for that process, and the two sites add no
  second error

### Requirement: A list entry on the target does not stand in for migrate

A Reader list entry on the target process SHALL NOT satisfy the `migrate`
check, and neither SHALL a Developer list entry. The global developer role and
a stored grant remain the only answers. The operator role alone does not hold
`migrate`.

A standing read right on the target therefore cannot unlock a write effect on
it. An `"instance.query"` data source keeps the `read` gate alone.

#### Scenario: A Reader list entry does not stand in for migrate
- **WHEN** the actor reaches `read` on the target only through that process's
  Reader list
- **THEN** publishing fails with an authorization error, and the engine
  persists no version

#### Scenario: An instance.query source alone keeps the read gate
- **WHEN** a body carries an `"instance.query"` source over a target process
  and no `instance.transition` action naming it
- **AND** the actor holds `read` and lacks `migrate` on that process
- **THEN** publishing succeeds

## MODIFIED Requirements

### Requirement: The publishing author holds a read grant on the target process

Publishing SHALL reject a cross-process reference when the publishing actor
lacks the `read` permission on the target process. The check SHALL use the
process-scoped permission gate the engine already provides.

Two site kinds carry this reference: an `"instance.query"` data source's
`processId`, and an `instance.transition` action's `processId`. The second
mutates a live instance of the target process, a stronger reach than the
first's read. It therefore carries a second gate, which the requirement "The
publishing author holds migrate on an instance.transition target" states. Both
site kinds check the same `read` permission first. The publish collects them
together and checks them once per target process.

The publish entry point takes no actor today. Every authorization gate sits at
the HTTP route instead. The route's own comment records that placement: an
actor lacking the permission never reaches the publish path at all.

That placement cannot serve this check. The route gates on the process the
author is publishing. This check gates on a different process, which only the
body names. The body's data sources resolve after the route hands off.

The publish entry point SHALL therefore accept the acting actor as an optional
argument. It SHALL run this check when a caller supplies that actor. It SHALL
skip the check and publish as before when a caller omits it.

Optional keeps every existing caller compiling, and the engine's own tests
publish without an actor. The cost is that a caller omitting the actor skips
the gate. Both HTTP publish routes SHALL supply it, so no route-reachable
publish escapes the check.

The reserved operator role SHALL keep its short-circuit, as it does for every
other use of that permission. An installation writing no grant row therefore
keeps every answer it had.

<!-- Scenario headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: An author without the grant is rejected
- **WHEN** an actor with no `read` permission on the target process publishes
  a body carrying an `"instance.query"` source naming it
- **THEN** publishing fails with an authorization error, and the engine
  persists no version

#### Scenario: An author holding the grant publishes
- **WHEN** the publishing actor holds `read` on the target process
- **THEN** publishing succeeds, subject to the other checks

#### Scenario: The operator role short-circuits the grant
- **WHEN** an actor holding the reserved operator role publishes such a body
  with no grant row present
- **THEN** publishing succeeds

#### Scenario: A publish with no actor supplied skips the check
- **WHEN** a caller publishes such a body without supplying an actor
- **THEN** publishing succeeds, and the read grant is not consulted

#### Scenario: Both publish routes supply the actor
- **WHEN** an actor with no `read` grant publishes such a body over either
  publish route
- **THEN** the route supplies the actor, and publishing fails with an
  authorization error

#### Scenario: Publishing rejects an instance.transition action without the grant
- **WHEN** an actor with no `read` permission on an `instance.transition`
  action's target process publishes a body carrying that action
- **THEN** publishing fails with an authorization error, and the engine
  persists no version

#### Scenario: An instance.transition action's grant publishes
- **WHEN** the publishing actor holds `read` on an `instance.transition`
  action's target process
- **THEN** publishing succeeds, subject to the other checks

#### Scenario: Publishing reports one missing grant once per target process
- **WHEN** a body carries both an `"instance.query"` source and an
  `instance.transition` action naming one target process
- **AND** the publishing actor lacks a `read` grant on that process
- **THEN** publishing fails once for that process, and the two sites add no
  second report
