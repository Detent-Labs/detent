# studio-migration-planning Specification

## Purpose

Exposes the engine's existing migration-plan store and orphan-key scan
(`registerMigrationPlan`, `resolveMigrationPlan`, `findOrphanKeys` — see
`instance-migration`, `orphan-key-inspection`) over HTTP for the first time,
`system:developer`-gated, as unprefixed routes (studio-only by role gate, not
by URL prefix — the same pattern `process-drafts`'s `/drafts` routes
establish, not under `/admin`). Backs a Studio migration-plan authoring
screen: author/inspect a `(processId, fromVersion, toVersion)` plan and run a
read-only orphan-key dry run against a published version before writing
transforms against it. Deliberately excludes *executing* a plan
(`migrateInstances`) — that stays `admin-migration-run`'s
`POST /admin/migrations/run`, an operator action reached from the admin area of `packages/web`,
not a developer one.

## Requirements

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

- **WHEN** `PUT /migration-plans/:processId/:fromVersion/:toVersion` is called
  with a structurally valid spec against two published versions
- **THEN** the plan is stored and a subsequent `GET` for the same key returns
  it

#### Scenario: Re-registering an unapplied plan overwrites the spec

- **WHEN** `PUT` is called twice for the same unapplied key with different
  specs
- **THEN** the second call succeeds and `GET` returns the second spec

#### Scenario: Registering against an already-applied plan is rejected

- **WHEN** `PUT` is called for a key whose plan has already been applied to at
  least one instance
- **THEN** the request is rejected with the frozen-plan error, and the stored
  spec is unchanged

#### Scenario: Reading a plan that was never registered is a 404

- **WHEN** `GET` is called for a `(processId, fromVersion, toVersion)` key
  with no stored row
- **THEN** the response is 404

#### Scenario: An actor without system:developer is rejected

- **WHEN** an actor lacking `system:developer`, and holding no scoped
  `migrate` grant for the named process, calls either route
- **THEN** the engine rejects the request

#### Scenario: An actor holding a scoped grant succeeds without the role

- **WHEN** an actor lacking `system:developer`, but holding a scoped
  `migrate` grant for the named process, calls either route
- **THEN** the engine accepts the request

### Requirement: A published version's orphan keys can be scanned read-only over HTTP

`GET /processes/:processId/versions/:version/orphan-keys` SHALL admit
`system:developer` or a scoped `migrate` grant naming the process (see
`authorization`). It SHALL wrap the existing `findOrphanKeys` unchanged.
That function runs a read-only, keyset-paginated scan of instances pinned
to that version against that version's own field catalog. This route is
version-keyed, not plan-keyed. It takes no `toVersion`, since the scan does
not depend on any specific migration target.

#### Scenario: Scanning a version with orphan data returns the offending entries

- **WHEN** the route is called for a published version whose live instances
  hold data keys absent from that version's field catalog
- **THEN** the response lists the affected instance ids and their orphan keys

#### Scenario: Scanning a version with no orphan data returns an empty result

- **WHEN** the route is called for a published version with no orphan keys
  among its live instances
- **THEN** the response is an empty result, not an error

#### Scenario: Scanning an unpublished version is rejected

- **WHEN** the route is called with a version number never published for that
  process
- **THEN** the request is rejected with the same error `findOrphanKeys`
  already raises for an unpublished version

#### Scenario: An actor holding a scoped grant scans without the developer role

- **WHEN** an actor lacking `system:developer`, but holding a scoped
  `migrate` grant for the named process, calls the route
- **THEN** the engine runs the scan and returns its result

### Requirement: MigrationPlanError is mapped to a stable HTTP status

`src/http/errors.ts` SHALL map `MigrationPlanError` to HTTP 409 with type
`migration-plan`, carrying the original error's `message` — the single class
covers several distinct causes (equal from/to versions, an unpublished
version, a structural plan-vs-catalog mismatch, or a frozen/already-applied
plan) and is disambiguated by `message`, not by a split status per cause.

#### Scenario: A MigrationPlanError answers 409 with its message intact

- **WHEN** any migration-plan or orphan-keys route throws `MigrationPlanError`
- **THEN** the HTTP response is 409 with `error.type` `migration-plan` and
  `error.message` equal to the thrown error's message
