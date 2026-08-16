## MODIFIED Requirements

<!-- Why: a MODIFIED requirement replaces the whole block, so every scenario
     below is carried over from the live spec. "`POST /processes` is
     requested" is that file's own wording, and the archive step compares the
     two. Rewriting it to the active voice here would leave the live spec
     alone and change nothing but this file's finding count. No other rule is
     silenced. -->
<!-- antislop: allow-file passive-voice -->

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

- **WHEN** `POST /processes` is requested with a valid authored body by an
  actor carrying the `system:publish` role
- **THEN** the response is 200 and carries version 1 and its hash
- **AND** the version is readable from the definition store

#### Scenario: Re-publishing an identical body

- **WHEN** the same body is published again
- **THEN** the response carries the same version and hash as the first publish

#### Scenario: Publishing a changed body

- **WHEN** a changed body for the same process is published
- **THEN** the response carries version 2

#### Scenario: A malformed request body is rejected

- **WHEN** `POST /processes` is requested with a body that is not valid JSON
- **THEN** the response is 400 with a typed error body

#### Scenario: Publishing without the required role is rejected

- **WHEN** `POST /processes` is requested by an actor whose resolved
  `Actor.roles` omits `system:publish`
- **AND** no grant admits that actor for that `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** no definition is persisted, even if the request body would
  otherwise have been valid

#### Scenario: A grant admits a caller without the global role

- **WHEN** `POST /processes` is requested by an actor lacking `system:publish`
- **AND** the store holds a grant of `"publish"` to a role that actor holds
- **AND** that grant is scoped to the body's `processId`
- **THEN** the engine authorizes the publish

#### Scenario: That same grant admits no other process

- **WHEN** that same actor publishes a body naming a different `processId`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: A malformed body from an unauthorized caller reports the body

- **WHEN** `POST /processes` is requested with a body that is not valid JSON,
  by an actor the gate would refuse
- **THEN** the response is 400 with a typed error body
- **AND** no definition is persisted

#### Scenario: The gate still precedes the publish chain

- **WHEN** `POST /processes` is requested with a well-formed body by an actor
  whose resolved `Actor.roles` omits `system:publish`
- **AND** no grant admits that actor
- **THEN** the response is 403
- **AND** the definition store, the action registry and the CEL check are never
  reached
