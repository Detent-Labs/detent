## ADDED Requirements

### Requirement: An instance.transition action's processId resolves to a published process

Publishing SHALL resolve the `processId` of every `instance.transition` action
in the body against the published processes.

A `processId` naming no published process SHALL fail the publish. The error
SHALL name the action's location in the body and the unresolved process id.

This check SHALL skip an `instance.transition` action that targets the process
the author is publishing. The check already skips an `"instance.query"` data
source the same way. A process the engine publishes has not necessarily
persisted a prior version to resolve against.

#### Scenario: An unpublished target rejects the publish
- **WHEN** an `instance.transition` action names a `processId` no published
  process carries
- **THEN** publishing throws, names the action's location and that process id,
  and persists no version

#### Scenario: A self-targeting action publishes
- **WHEN** an `instance.transition` action targets the process the author is
  publishing
- **THEN** publishing does not reject it for an unresolved target

<!-- OpenSpec matches a requirement heading verbatim, so this one's wording stays as authored. -->
<!-- antislop: allow passive-voice -->
### Requirement: An instance.transition action's pathId is reported against the versions holding live instances

Publishing SHALL resolve the `pathId` of every `instance.transition` action
into the target process. It SHALL resolve it against a union. That union covers
the step sets of the target's versions holding live instances.

A version carries the reference when one of its steps declares a path with that
id. A version whose steps declare no such path does not carry it.

A `pathId` the union does not carry SHALL produce a publish finding. It SHALL
NOT fail the publish. The finding SHALL name the action's location, the path id
and the versions carrying it. It SHALL also name the count of live instances on
versions that do not.

Reporting rather than rejecting follows the rule the `"instance.query"`
references already follow, and for the same reason. The population a
publish-time check reads keeps moving after the check.

Checking the target's latest version alone SHALL NOT stand in for the union.
This action transitions an instance that already exists. That instance pins the
version it holds, from its creation or its last migration.

A target process with no live instances SHALL produce a finding rather than
none. An empty union carries nothing, and silence would read as agreement.

#### Scenario: A path every live version carries reports nothing
- **WHEN** the `pathId` resolves on a step of each target version holding live
  instances
- **THEN** publishing succeeds and reports no finding for that action

#### Scenario: A path outside the union reports a finding
- **WHEN** the `pathId` resolves in no target version holding live instances
- **THEN** publishing succeeds, and the result carries a finding naming the
  action's location and that path id

#### Scenario: A partially carried path names its versions
- **WHEN** the `pathId` resolves in one target version holding live instances
  and not in another
- **THEN** the finding names the version carrying it, and the count of live
  instances on the version that does not

#### Scenario: A target with no live instances reports the path
- **WHEN** the target process holds no live instance
- **THEN** publishing succeeds, and the result carries a finding for that
  action's path id

## MODIFIED Requirements

<!-- Requirement headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow passive-voice -->
### Requirement: The publishing author holds a read grant on the target process

Publishing SHALL reject a cross-process reference when the publishing actor
holds no `read` permission on the target process. The check SHALL use the
process-scoped permission gate the engine already provides.

Two site kinds carry this reference: an `"instance.query"` data source's
`processId`, and an `instance.transition` action's `processId`. The second
mutates a live instance of the target process, a stronger reach than the
first's read. It does not carry a weaker gate for that reason. Both site
kinds check against the same `read` permission. The publish collects them
together and checks them once per target process.

The publish entry point takes no actor today. Every authorization gate sits at
the HTTP route instead. The route's own comment records that placement: an
actor lacking the permission never reaches the publish path at all.

That placement cannot serve this check. The route gates on the process the
author is publishing. This check gates on a different process, which only the
body names. The body's data sources and actions resolve after the route hands
off.

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
- **AND** the publishing actor holds no `read` grant on that process
- **THEN** publishing fails once for that process, not once per site
  referencing it
