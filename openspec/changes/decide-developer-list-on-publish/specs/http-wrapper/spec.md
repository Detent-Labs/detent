## MODIFIED Requirements

### Requirement: Publish a process body over HTTP

The HTTP wrapper SHALL expose `POST /processes`. It SHALL accept an authored
process body, and SHALL publish it through the existing publish operation of
the definition store. The response SHALL carry `processId`, `version`,
`definitionHash` and `status`.

Publishing SHALL need `can(actor, "publish", processId, db)` to answer true.
The `authorization` capability states the two tests behind that answer. The
global `system:publish` role admits every process. A stored grant of
`"publish"` scoped to this `processId` admits this one. The gate SHALL put the
question through `await requirePermission(actor, "publish", processId, db)`,
and SHALL NOT read `Actor.roles` itself.

An actor who does not hold `system:admin` SHALL also appear on the Developer
list of the body's `processId`, per the `process-access-roles` capability. That
check follows the permission check and runs before the publish chain. It does
not apply to a `processId` with no draft and no published version, which is a
first publish. A refused caller reads 403, and the publish chain never runs.

That call needs the target process id, and the request body carries it. The
gate SHALL therefore run after the body parse and the shape check. It SHALL run
before anything else.

The shape check proves only that the body's `processId` is a string. The
publish chain checks the `proc_` prefix later. The gate SHALL NOT treat that
string as a process the store already holds.

The property that the earlier ordering protected SHALL hold. A caller the gate
refuses SHALL never reach the definition store, the registry, or the CEL
check. Such a call SHALL consume no version and SHALL persist no definition.

One response changes. Take a caller the gate refuses. Two bodies from that
caller now read 400 rather than 403:

- a body that is not valid JSON
- a body of the wrong shape

That answer discloses nothing about the installation, because the caller wrote
the body. Every other publish response SHALL stay as it is.

Publishing SHALL run the unchanged publish-time validation chain: authored
schema, duration bounds, action registry, CEL, and cross-process. The check
SHALL resolve against the server's own injected registry. A client SHALL NOT be
able to supply or extend that registry.

An identical re-publish SHALL return the existing version, since publish is
idempotent on an identical body.

#### Scenario: Publishing a valid body

- **WHEN** an actor carrying the `system:publish` role requests
  `POST /processes` with a valid authored body
- **THEN** the response is 200 and carries version 1 and its hash
- **AND** the version is readable from the definition store

#### Scenario: Re-publishing an identical body

- **WHEN** a caller publishes the same body again
- **THEN** the response carries the same version and hash as the first publish

#### Scenario: Publishing a changed body

- **WHEN** a caller publishes a changed body for the same process
- **THEN** the response carries version 2

<!-- Why: a MODIFIED block keeps each base scenario name word for word, or archive drops the scenario. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A malformed request body is rejected

- **WHEN** a caller requests `POST /processes` with a body that is not valid JSON
- **THEN** the response is 400 with a typed error body

<!-- Why: a MODIFIED block keeps each base scenario name word for word, or archive drops the scenario. -->
<!-- antislop: allow passive-voice -->
#### Scenario: Publishing without the required role is rejected

- **WHEN** an actor whose resolved `Actor.roles` omits `system:publish`
  requests `POST /processes`
- **AND** no grant admits that actor for that `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the store persists no definition, even if the request body would
  otherwise have been valid

#### Scenario: A grant admits a caller without the global role

- **WHEN** an actor lacking `system:publish` requests `POST /processes`
- **AND** the store holds a grant of `"publish"` to a role that actor holds
- **AND** that grant names the body's `processId` as its scope
- **THEN** the engine authorizes the publish

#### Scenario: That same grant admits no other process

- **WHEN** that same actor publishes a body naming a different `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: A malformed body from an unauthorized caller reports the body

- **WHEN** an actor the gate would refuse requests `POST /processes` with a
  body that is not valid JSON
- **THEN** the response is 400 with a typed error body
- **AND** the store persists no definition

#### Scenario: The gate still precedes the publish chain

- **WHEN** an actor whose resolved `Actor.roles` omits `system:publish`
  requests `POST /processes` with a well-formed body
- **AND** no grant admits that actor
- **THEN** the response is 403
- **AND** the definition store, the action registry and the CEL check are never
  reached

#### Scenario: A publisher off the Developer list gets 403

- **WHEN** an actor holding `system:author` and `system:publish` requests
  `POST /processes`
- **AND** the body's `processId` names a process with a published version
- **AND** the actor is not on that process's Developer list
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the store persists no definition

#### Scenario: A listed publisher publishes a new version

- **WHEN** an actor holding `system:author` and `system:publish` is on the
  Developer list of a published process
- **AND** the actor publishes a changed body for it through `POST /processes`
- **THEN** the response is 200 and carries the next version

#### Scenario: The first publish of a new process asks for no list entry

- **WHEN** an actor holding `system:publish` and not `system:admin` requests
  `POST /processes`
- **AND** the body's `processId` has no draft and no published version
- **THEN** the response is 200 and carries version 1

#### Scenario: An admin publishes without a list entry

- **WHEN** an actor holding `system:admin` and `system:publish` requests
  `POST /processes`
- **AND** the actor is not on the Developer list of the body's `processId`
- **THEN** the response is 200
