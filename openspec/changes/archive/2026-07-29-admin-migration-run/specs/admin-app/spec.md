<!-- antislop: allow-file passive-voice -->
<!-- Passive WHEN/THEN scenario phrasing matches the established Gherkin-style
     convention across every existing spec.md in openspec/specs/ (see
     admin-app's own base spec). SHALL-normative passive ("SHALL be shown")
     is that same file's existing requirement grammar. -->

## ADDED Requirements

### Requirement: A Migrations screen runs a registered plan

A `/migrations` screen SHALL let the operator pick a process, a
`fromVersion`, and a `toVersion`, then submit `POST /admin/migrations/run`.
The pick step SHALL populate its process list from the existing
`GET /processes` route. It SHALL populate its version choices from
`GET /processes/:id/versions`. Both routes are already open to any
authenticated actor. The picker SHALL NOT be more than a plain select.

Before submitting, the screen SHALL show a confirmation naming the process
and both versions. The confirmation SHALL state that the action migrates
running instances. It SHALL also name Studio's orphan-key dry run as the recommended
pre-flight check. It SHALL NOT link to or call that check directly. The
check (`GET /processes/:id/versions/:version/orphan-keys`) requires
`system:developer`, a role a `system:admin` actor does not necessarily
hold. The Migrations screen SHALL NOT add a second dry-run mode of its own.

After a run completes, the screen SHALL show the returned instance ids
grouped into four buckets: migrated, skipped, conflicted, failed. A 409
response (no plan registered for the pair) SHALL be shown as an inline
error, not a silent no-op.

The screen SHALL follow the same refresh convention as every other
Operations screen. It SHALL show no live progress during the run, since
`migrateInstances` runs to completion within the request.

#### Scenario: Running a plan and seeing the grouped result

- **WHEN** the operator confirms a migration run for a process/version pair
  with a registered plan
- **THEN** `POST /admin/migrations/run` is called, and the response's
  instance ids are shown grouped migrated/skipped/conflicted/failed

#### Scenario: The confirmation names what will be migrated

- **WHEN** the operator submits the pick step
- **THEN** a confirmation names the process, the `fromVersion`, and the
  `toVersion` before the request fires

#### Scenario: A missing plan surfaces inline

- **WHEN** the operator runs a migration for a pair with no registered plan
- **THEN** the 409 response is shown as an inline error, and no bucket list
  is rendered

#### Scenario: No forced transition or data edit is offered

- **WHEN** the Migrations screen is inspected for write actions
- **THEN** running a registered plan is the only one; no control edits
  instance `data` or forces a step transition directly
