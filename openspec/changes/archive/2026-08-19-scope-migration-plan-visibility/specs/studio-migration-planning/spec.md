## MODIFIED Requirements

<!-- antislop: allow passive-voice (title matches the archived requirement verbatim) -->
### Requirement: A migration plan can be authored and read over HTTP, gated to developers

`PUT /migration-plans/:processId/:fromVersion/:toVersion` and
`GET /migration-plans/:processId/:fromVersion/:toVersion` SHALL both admit
`system:developer` or a scoped `migrate` grant naming the process (see
`authorization`). Each SHALL wrap the existing `registerMigrationPlan` /
`resolveMigrationPlan` unchanged. The route layer SHALL add no new
validation beyond checking the JSON body's shape. `PUT` SHALL free-edit an
unapplied plan. `PUT` SHALL reject an applied plan with the engine's
existing frozen-plan error (see the shared `MigrationPlanError` mapping
below). `GET` SHALL answer 404 for a key that carries no registered plan.

#### Scenario: Registering a plan against two published versions succeeds

- **WHEN** a caller sends a structurally valid spec to `PUT
  /migration-plans/:processId/:fromVersion/:toVersion` naming two published
  versions
- **THEN** the engine stores the plan, and a subsequent `GET` for the same
  key returns it

#### Scenario: Re-registering an unapplied plan overwrites the spec

- **WHEN** a caller sends two different specs to `PUT` for the same
  unapplied key
- **THEN** the second call succeeds, and `GET` returns the second spec

<!-- antislop: allow passive-voice (title matches the archived scenario verbatim) -->
#### Scenario: Registering against an already-applied plan is rejected

- **WHEN** a caller sends `PUT` for a key whose plan already applied to at
  least one instance
- **THEN** the engine rejects the request with the frozen-plan error and
  leaves the stored spec unchanged

#### Scenario: Reading a plan that was never registered is a 404

- **WHEN** a caller sends `GET` for a `(processId, fromVersion, toVersion)`
  key that holds no stored row
- **THEN** the engine answers 404

<!-- antislop: allow passive-voice (title matches the archived scenario verbatim) -->
#### Scenario: An actor without system:developer is rejected

- **WHEN** an actor lacking `system:developer`, and holding no scoped
  `migrate` grant for the named process, calls either route
- **THEN** the engine rejects the request

#### Scenario: An actor holding a scoped grant succeeds without the role

- **WHEN** an actor lacking `system:developer`, but holding a scoped
  `migrate` grant for the named process, calls either route
- **THEN** the engine accepts the request

<!-- antislop: allow passive-voice (title matches the archived requirement verbatim) -->
### Requirement: A published version's orphan keys can be scanned read-only over HTTP

`GET /processes/:processId/versions/:version/orphan-keys` SHALL admit
`system:developer` or a scoped `migrate` grant naming the process (see
`authorization`). It SHALL wrap the existing `findOrphanKeys` unchanged.
That function runs a read-only, keyset-paginated scan of instances pinned
to that version against that version's own field catalog. This route is
version-keyed, not plan-keyed. It takes no `toVersion`, since the scan does
not depend on any specific migration target.

#### Scenario: Scanning a version with orphan data returns the offending entries

- **WHEN** a caller scans a published version whose live instances hold
  data keys absent from that version's field catalog
- **THEN** the response lists the affected instance ids and their orphan
  keys

#### Scenario: Scanning a version with no orphan data returns an empty result

- **WHEN** a caller scans a published version with no orphan keys among its
  live instances
- **THEN** the response is an empty result, not an error

<!-- antislop: allow passive-voice (title matches the archived scenario verbatim) -->
#### Scenario: Scanning an unpublished version is rejected

- **WHEN** a caller names a version number the process never published
- **THEN** the engine rejects the request with the same error
  `findOrphanKeys` already raises for an unpublished version

#### Scenario: An actor holding a scoped grant scans without the developer role

- **WHEN** an actor lacking `system:developer`, but holding a scoped
  `migrate` grant for the named process, calls the route
- **THEN** the engine runs the scan and returns its result
