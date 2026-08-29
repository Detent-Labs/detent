## ADDED Requirements

### Requirement: An instance.query data source's processId resolves to a published process

Publishing a process SHALL reject an unresolvable `"instance.query"`
`processId`. It SHALL resolve to at least one published version of that
process.

This matches the rule a `process.start` action already carries. A target
needs no `contract`, so an uncontracted resolved process is not a rejection
reason.

A source naming the publishing process itself SHALL resolve. A process may
read its own instances, and the handler excludes the reading instance at
runtime.

#### Scenario: Publishing rejects a source naming an unpublished process
- **WHEN** a body carries an `"instance.query"` data source whose `processId`
  matches no published process
- **THEN** publishing fails with a cross-process validation error naming the
  offending data source, and the engine persists no version

#### Scenario: A source naming a published process publishes
- **WHEN** a body carries an `"instance.query"` data source whose `processId`
  resolves to a published process
- **THEN** publishing succeeds, subject to the checks below

#### Scenario: A source naming the publishing process itself publishes
- **WHEN** a body carries an `"instance.query"` data source whose `processId`
  names the process the author is publishing
- **THEN** publishing succeeds

<!-- Requirement headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow passive-voice -->
### Requirement: Step and field references are reported against the versions holding live instances

Publishing SHALL resolve every reference an `"instance.query"` data source
makes into the target process. Those references are every `stepIds` entry,
every compared field id, every `labelFieldId` and every `attributes` field id.
It SHALL resolve them against a union. That union covers the catalogs and step
sets of the target's versions holding live instances.

A reference the union does not carry SHALL produce a publish finding. It SHALL
NOT fail the publish. The finding SHALL name the data source, the reference,
and the versions carrying it. It SHALL also name the count of live instances
on versions that do not.

Reporting rather than rejecting is deliberate, and it departs from the three
checks above. The population a publish-time check reads keeps moving after the
check. The engine's `createProcessInstance` accepts an explicit version, and
migration moves instances between versions. A rejection would therefore rest
on a fact that expires.

Checking the target's latest version alone SHALL NOT stand in for the union. A
`process.start` action creates an instance at the latest version, so the
latest version is the right question there. This source reads instances across
many versions, so it is the wrong question here.

A target process with no live instances SHALL produce a finding for every
reference rather than none. An empty union carries nothing, and silence would
read as agreement.

#### Scenario: A reference every live version carries reports nothing
- **WHEN** every `stepIds` entry and every referenced field id resolves in
  each target version holding live instances
- **THEN** publishing succeeds and reports no finding for that data source

#### Scenario: A reference outside the union reports a finding
- **WHEN** a compared field id resolves in no target version holding live
  instances
- **THEN** publishing succeeds, and the result carries a finding naming the
  data source and that field id

#### Scenario: A partially carried reference names its versions
- **WHEN** a referenced step id resolves in one target version holding live
  instances and not in another
- **THEN** the finding names the version carrying it, and the count of live
  instances on the version that does not

#### Scenario: A target with no live instances reports every reference
- **WHEN** the target process holds no live instance
- **THEN** publishing succeeds, and the result carries a finding for each
  reference of that data source

### Requirement: A compared field resolves to a scalar-typed field

Publishing SHALL reject an `"instance.query"` comparison naming a target field
whose declared type holds a non-scalar value. A `multiselect` field holds
`string[]`, so a comparison naming one can never compare at the JSON level.
The same rejection SHALL apply to a `group` field.

`instance-data-query` defers this check here by name. Its own row-level check
reads values rather than declared types. That check passes while no selected
instance has written the field. That check is the backstop, and this one is
the type-level gate.

This check rejects where the reference check above reports. The two ask
different questions. Whether a version carries a field is a fact about a
moving population. Whether a resolved field's declared type admits a
comparison is a fact about the catalog. A type that admits none is wrong in
every version declaring that field.

A comparison naming a field the union does not carry SHALL produce the
reference finding above. It SHALL NOT also produce a type rejection. There is
no declared type to judge.

<!-- Scenario headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A comparison naming a multiselect field is rejected
- **WHEN** an `"instance.query"` comparison names a target field a live
  version declares as `multiselect`
- **THEN** publishing fails with a cross-process validation error naming that
  data source and field, and the engine persists no version

#### Scenario: A comparison naming a scalar field publishes
- **WHEN** every `"instance.query"` comparison names a target field declared
  with a scalar type
- **THEN** publishing succeeds

#### Scenario: An unresolvable compared field reports rather than rejects
- **WHEN** an `"instance.query"` comparison names a field id no live target
  version declares
- **THEN** publishing succeeds with a reference finding, and no type error

### Requirement: The publishing author holds a read grant on the target process

Publishing SHALL reject an `"instance.query"` data source when the publishing
actor holds no `read` permission on the target process. The check SHALL use
the process-scoped permission gate the engine already provides.

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
