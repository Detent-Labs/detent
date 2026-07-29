<!-- antislop: allow-file passive-voice -->
<!-- Passive WHEN/THEN scenario phrasing ("is requested", "is refused") matches
     the established Gherkin-style convention across every existing spec.md
     in openspec/specs/ (see admin-operations-api's own base spec). Rewriting
     just the new scenarios to active voice would break that consistency.
     SHALL-normative passive ("SHALL be gated", "SHALL be coerced") is the
     same fixed requirement grammar every existing spec.md in this repo uses. -->

## ADDED Requirements

### Requirement: A registered migration plan can be run from the admin area

`src/http/admin-routes.ts` SHALL expose `POST /admin/migrations/run`. It
SHALL be gated by `system:admin`, like every other `/admin/*` route. It
SHALL accept a JSON body `{ processId, fromVersion, toVersion }`.

The handler SHALL call the existing
`migrateInstances(processId, fromVersion, toVersion, db)`
(`src/engine/migration.ts`) unchanged. It SHALL return that call's
`MigrationResult` (`migrated`/`skipped`/`conflicted`/`failed` instance-id
arrays) as the response body, with status 200.

`fromVersion` and `toVersion` SHALL be coerced to integers with the same
rejection rule `parseVersion` already applies to path segments in
`studio-routes.ts`. A non-integer value SHALL raise `RequestShapeError`,
mapped to a request error. It SHALL NOT be silently coerced or defaulted.

The handler SHALL introduce no new engine logic. Every error
`migrateInstances` raises SHALL pass through the existing `mapError` mapping
unchanged, including `MigrationPlanError` for an unregistered or
unpublished `fromVersion`/`toVersion` pair.

#### Scenario: Running a registered plan

- **WHEN** `POST /admin/migrations/run` is requested by an actor holding
  `system:admin`, naming a `processId`/`fromVersion`/`toVersion` plan
  already registered and frozen (by a prior run, or by
  `PUT /migration-plans/...`)
- **THEN** the response is 200 and its body is the `MigrationResult`
  `migrateInstances` returned, with instance ids grouped
  `migrated`/`skipped`/`conflicted`/`failed`

#### Scenario: No plan registered for the pair

- **WHEN** `POST /admin/migrations/run` is requested for a `processId`/
  `fromVersion`/`toVersion` with no registered migration plan
- **THEN** the response is 409, the same `migration-plan` error type
  `PUT /migration-plans/...` already returns for a `MigrationPlanError`

#### Scenario: A non-integer version is rejected

- **WHEN** `POST /admin/migrations/run` is requested with a `fromVersion` or
  `toVersion` that is not an integer
- **THEN** the response is a request error and `migrateInstances` is not
  called

#### Scenario: An actor without the admin role is refused

- **WHEN** `POST /admin/migrations/run` is requested by an actor whose roles
  do not include `system:admin`
- **THEN** the response is 403 and no instance is migrated
