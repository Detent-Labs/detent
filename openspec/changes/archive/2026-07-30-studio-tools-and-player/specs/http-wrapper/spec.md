<!-- antislop: allow-file all -->

## MODIFIED Requirements

### Requirement: Read an instance's record over HTTP

The HTTP wrapper SHALL expose the merged history/event record read as
`GET /instances/:instanceId/record`, accepting `limit` and `cursor`, and
returning the ordered, discriminated sequence the read produces. Like every
other route, it SHALL first resolve the actor through the injected
`ActorResolver`.

It SHALL then authorize the resolved actor through `getInstanceRecord`'s own
two-path check (see the `authorization` capability): `ADMIN_ROLE` on its own,
unconditionally, OR `DEVELOPER_ROLE` together with `instance.startedBy`
matching the actor's id. There is no broader "the record of an instance I am
assigned to" carve-out beyond those two paths. The record is the audit
backbone: it carries actor ids, action outcomes and resolved handler builds
across every participant of the instance. Requiring `ADMIN_ROLE`
unconditionally was originally a **BREAKING** tightening of a route that had
been open to every authenticated actor; the developer-and-starter path added
here is additive on top of that tightening, not a reopening of it.

An unknown instance id SHALL return 200 with an empty sequence, consistent
with the read itself and with the wrapper's existing choice not to invent
404s for absent instances — but only once the actor resolves and the
authorization check passes.

#### Scenario: Reading a record as an admin

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an instance that has transitioned
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: Reading a record as the instance's developer starter

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:developer` but not `system:admin`, for an
  instance whose `startedBy` matches that credential's actor id
- **THEN** the response is 200 and carries the merged, ordered record

#### Scenario: An actor satisfying neither path is refused

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential that does not hold `system:admin`, and either lacks
  `system:developer` or did not start the target instance
- **THEN** the response is 403 and no record read is performed

#### Scenario: Reading the record of an unknown instance

- **WHEN** `GET /instances/:id/record` is requested with a resolvable
  credential holding `system:admin` for an id that does not exist
- **THEN** the response is 200 with an empty sequence

#### Scenario: An unresolvable credential is rejected regardless of whether the instance exists

- **WHEN** `GET /instances/:id/record` is requested with no resolvable credential
- **THEN** the response is 401, whether or not `:id` names a real instance
