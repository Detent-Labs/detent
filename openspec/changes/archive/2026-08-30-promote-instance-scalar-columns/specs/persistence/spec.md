<!-- antislop: allow-file passive-voice -->
<!-- Matches the base persistence spec.md's own directive: Gherkin-style scenarios ("WHEN the schema is initialised") read naturally as passive and that file already permits it. -->
## ADDED Requirements

### Requirement: Six standardized instance keys are generated columns

The datastore SHALL carry six more `instances` columns, each a
`GENERATED ALWAYS AS (...) STORED` projection of a key already present in
the jsonb `body`:

- `process_id text GENERATED ALWAYS AS ((body->>'processId')) STORED`
- `version integer GENERATED ALWAYS AS (((body->>'version')::integer)) STORED`
- `status text GENERATED ALWAYS AS ((body->>'status')) STORED`
- `current_step_id text GENERATED ALWAYS AS ((body->>'currentStepId')) STORED`
- `started_by text GENERATED ALWAYS AS ((body->>'startedBy')) STORED`
- `started_at text GENERATED ALWAYS AS ((body->>'startedAt')) STORED`

`initSchema` SHALL add each with `ALTER TABLE instances ADD COLUMN IF NOT
EXISTS`, the same additive pattern `redacted_at` and every other `instances`
column already follows.

`started_at` SHALL be `text`, not `timestamptz`. Every writer produces
`startedAt` as `new Date().toISOString()`, a fixed-width ISO-8601 string in
UTC. A `text` column therefore ranges and sorts the same way a `timestamptz`
column would.

A generation expression casting to `timestamptz` is not usable here.
Postgres rejects it as not immutable, because that cast reads session
`DateStyle` and `TimeZone`.

The jsonb key backing each column SHALL remain in `body`, unchanged. No read
path has to switch to the generated column. The six columns exist so a
query MAY use one directly.

#### Scenario: Initialisation adds the six columns

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `instances` gains `process_id`, `version`, `status`,
  `current_step_id`, `started_by` and `started_at`, each generated from the
  matching `body` key

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the six columns are unchanged

#### Scenario: A pre-existing row backfills on column addition

- **WHEN** the six columns are added to a table already holding instance
  rows
- **THEN** every existing row's new columns read back the value already
  present at that key in `body`

#### Scenario: A generated column tracks its body key

- **WHEN** an instance's `body` is updated so that one of the six keys
  changes (for example a transition changes `currentStepId` and `status`)
- **THEN** the matching generated column reads the new value, in the same
  row, with no separate write

### Requirement: The `started_at` predicate is indexed

The datastore SHALL carry `CREATE INDEX IF NOT EXISTS instances_started_idx
ON instances (started_at)`. This is a plain btree index over the generated
column the requirement above adds.

`selectInRange` (`src/engine/reporting.ts`) SHALL filter on `started_at`
directly, as `started_at >= range.from AND started_at <= range.to`, rather
than casting `body->>'startedAt'` to `timestamptz`. A query naming the
original jsonb expression cannot use an index built over the generated
column. The planner does not substitute one for the other, so the rewrite
is what makes the new index usable.

#### Scenario: Initialisation creates the started_at index

- **WHEN** `initSchema` runs
- **THEN** an index over `instances (started_at)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run succeeds and `instances_started_idx` is unchanged

#### Scenario: A cycle-time query filters through the generated column

- **WHEN** `selectInRange` runs for a process and a date range
- **THEN** its query filters on `started_at`, not on a `timestamptz` cast of
  `body->>'startedAt'`, and returns the same instances a range check against
  `startedAt` would
