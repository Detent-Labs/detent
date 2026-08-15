<!-- antislop: allow-file passive-voice -->
## MODIFIED Requirements

### Requirement: Publish a process body over HTTP

The HTTP wrapper SHALL expose `POST /processes`. It SHALL accept an authored
process body, and SHALL publish it through the existing publish operation of
the definition store. The response SHALL carry `processId`, `version`,
`definitionHash` and `status`.

Publishing SHALL need the `system:publish` role on the caller's resolved
`Actor`. The `authorization` capability states that role. The gate SHALL put
that question through `requirePermission(actor, "publish", processId)`.

That call needs the target process id, and the request body carries it. The
gate SHALL therefore run after the body parse and the shape check. It SHALL run
before anything else.

The shape check proves only that the body's `processId` is a string. The
publish chain checks the `proc_` prefix later. The gate SHALL NOT treat that
string as a process the store already holds.

The property that the earlier ordering protected SHALL hold. A caller without
the role SHALL never reach the definition store, the registry, or the CEL
check. Such a call SHALL consume no version and SHALL persist no definition.

One response changes. Take a caller who lacks the role. Two bodies from that
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
  `Actor.roles` does not include `system:publish`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** no definition is persisted, even if the request body would
  otherwise have been valid

#### Scenario: A malformed body from an unauthorized caller reports the body

- **WHEN** `POST /processes` is requested with a body that is not valid JSON,
  by an actor whose resolved `Actor.roles` does not include `system:publish`
- **THEN** the response is 400 with a typed error body
- **AND** no definition is persisted

#### Scenario: The gate still precedes the publish chain

- **WHEN** `POST /processes` is requested with a well-formed body by an actor
  whose resolved `Actor.roles` does not include `system:publish`
- **THEN** the response is 403
- **AND** the definition store, the action registry and the CEL check are never
  reached
