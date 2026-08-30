# cross-process-validation

## Purpose

Defines the publish-time enforcement that a `subprocess` step's wiring is valid
against the child process it calls. A subprocess step references a child by
`processId` + `versionBinding` and maps parent data into the child's inputs; these
checks resolve the referenced child via the definition store and reject the publish
when the reference does not resolve to a contracted child, or when an `inputMapping`
target lies outside the child's declared inputs. Failing at publish keeps the error
close to the author instead of surfacing as a runtime spawn dead-letter, and makes
child-first publish ordering a hard requirement.

## Requirements

### Requirement: inputMapping targets lie within the child's declared inputs

Publishing a process SHALL reject it when any subprocess step's `inputMapping`
target key is not present in the referenced child's `contract.inputFields`. The
check resolves the child body via the definition store; the rejection is a
publish-time error, not a runtime failure.

#### Scenario: An out-of-contract inputMapping target is rejected at publish
- **WHEN** a process with a subprocess step maps a value to a child field id that is not in the child's `contract.inputFields`
- **THEN** publishing that process fails with a cross-process validation error naming the offending field, and no version is persisted

#### Scenario: inputMapping targeting only declared input fields publishes
- **WHEN** every `inputMapping` target of every subprocess step is in the referenced child's `contract.inputFields`
- **THEN** the process publishes normally

### Requirement: The child reference must resolve to a contracted child (child-first ordering)

Publishing a process with a subprocess step SHALL resolve the referenced child and
reject the publish when it cannot: a `pinned` binding whose `pinnedVersion` is not
a published version of the child process, or a `latest-at-spawn` binding whose
`contractRef` matches no published child contract signature. A resolved child that
declares no `contract` is likewise rejected — there is no declared input set to
validate the wiring against. A parent MAY therefore be published only after the
contracted child version it references exists.

#### Scenario: A pinned reference to an unpublished child version is rejected
- **WHEN** a subprocess step pins a child `pinnedVersion` that has not been published
- **THEN** publishing the parent fails with a cross-process validation error, and no parent version is persisted

#### Scenario: A latest-at-spawn reference matching no published contract is rejected
- **WHEN** a subprocess step binds `latest-at-spawn` with a `contractRef` that equals no published child version's contract signature
- **THEN** publishing the parent fails with a cross-process validation error

#### Scenario: A reference to a non-contracted child is rejected
- **WHEN** a subprocess step resolves to a published child version that declares no `contract`
- **THEN** publishing the parent fails with a cross-process validation error

#### Scenario: Publishing the child first lets the parent validate
- **WHEN** the contracted child version is published, then the parent referencing it is published
- **THEN** the child resolves and the parent publishes (subject to the inputMapping check)

### Requirement: outputMapping and guard references to child.data lie within the child's declared outputs

Publishing a process SHALL reject it when a subprocess step's `outputMapping`
value expression, or one of the step's automatic-path guard expressions,
references `child.data.<key>` for a `<key>` that is not present in the referenced
child's `contract.outputFields` (resolved to the child field's `key`, the same way
every CEL site addresses a field). The check resolves the child body via the
definition store — the same resolution the `inputMapping` check already performs
for the step — and types `child.data` against a schema built from
`contract.outputFields` instead of accepting any key. An absent or empty
`contract.outputFields` means no key is valid, so any `child.data.<key>` reference
on that step is rejected. `child.outcome` is unaffected: it remains typed `string`
regardless of `contract.outcomes`.

This closes the same class of gap the CEL check/eval scope drift for declared data
sources closed: a declared surface (`contract.outputFields`) that the CEL type
checker did not enforce, letting a parent silently depend on a child's
non-contracted internal field.

#### Scenario: An outputMapping reference to an uncontracted child field is rejected
- **WHEN** a subprocess step's `outputMapping` value expression references
  `child.data.<key>` for a child field whose id is not in the referenced child's
  `contract.outputFields`
- **THEN** publishing the parent fails with a CEL validation error naming the
  offending expression, and no parent version is persisted

#### Scenario: An automatic-path guard reference to an uncontracted child field is rejected
- **WHEN** a subprocess step's automatic-path guard references `child.data.<key>`
  for a child field whose id is not in the referenced child's
  `contract.outputFields`
- **THEN** publishing the parent fails with a CEL validation error naming the
  offending guard expression

#### Scenario: References confined to declared output fields publish normally
- **WHEN** every `child.data.<key>` reference in a subprocess step's `outputMapping`
  and guards names a key whose field id is in the referenced child's
  `contract.outputFields`
- **THEN** the process publishes normally (subject to the existing inputMapping and
  resolvability checks)

#### Scenario: A child with no declared outputFields rejects every child.data reference
- **WHEN** a subprocess step references a child whose `contract.outputFields` is
  absent or empty, and the step's `outputMapping` or a guard references
  `child.data.<key>` for any key
- **THEN** publishing the parent fails, naming the offending expression

#### Scenario: child.outcome references are unaffected
- **WHEN** a subprocess step's guard or `outputMapping` references `child.outcome`
- **THEN** the reference type-checks regardless of the referenced child's
  `contract.outputFields`, exactly as before this change

### Requirement: A process.start action's processId resolves to a published process

Publishing a process SHALL reject an unresolvable `process.start`
reference. Its `processId` must resolve to at least one published
version of that process.

This capability already validates a subprocess reference the same way. A
chain target needs no `contract`, though. An uncontracted resolved
process is not a rejection reason here.

#### Scenario: Publishing rejects a process.start action naming an unpublished process
- **WHEN** a body carries a `process.start` action whose `processId` matches no published process
- **THEN** publishing that body fails with a cross-process validation error naming the offending action, and the engine persists no version

#### Scenario: A process.start action naming a published, uncontracted process publishes
- **WHEN** a body carries a `process.start` action whose `processId` resolves to a published process that declares no `contract`
- **THEN** publishing succeeds, unlike the equivalent case for a subprocess reference

### Requirement: A process.start action's inputMapping targets lie within the target process's field catalog

Publishing a process SHALL reject an `inputMapping` target key that is
not a declared field of the target process. That check uses the
process's full field catalog, not a `ProcessContract.inputFields` list.
The check resolves the target body via the definition store, the same
resolution the `processId` check above already performs.

#### Scenario: Publishing rejects an out-of-catalog inputMapping target
- **WHEN** a `process.start` action maps a value to a field id that is not in the resolved target process's field catalog
- **THEN** publishing fails with a cross-process validation error naming the offending field

#### Scenario: inputMapping targeting only declared fields publishes
- **WHEN** every `inputMapping` target of every `process.start` action is a declared field of its resolved target process
- **THEN** the process publishes normally

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
whose declared type holds a non-scalar value. A `list` field holds
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
#### Scenario: A comparison naming a list field is rejected
- **WHEN** an `"instance.query"` comparison names a target field a live
  version declares as `list`
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
- **AND** the publishing actor holds no `read` grant on that process
- **THEN** publishing fails once for that process, not once per site
  referencing it
