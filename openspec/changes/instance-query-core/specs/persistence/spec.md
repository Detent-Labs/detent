## ADDED Requirements

### Requirement: The current step predicate is a generated column

The datastore SHALL carry an `instances.current_step_id text` column. Postgres
SHALL derive its value from the instance body. The engine SHALL never write it:

`ALTER TABLE instances ADD COLUMN IF NOT EXISTS current_step_id text
GENERATED ALWAYS AS ((body->>'currentStepId')) STORED`

`initSchema` SHALL add the column with that additive pattern. Every prior
`instances` column already follows it. `initSchema` SHALL also declare an index
on the column.

A generated column, rather than a second write, closes a known hazard. Both
`transition_seq` and `redacted_at` live as a column and as a body key. The
engine writes both places. Two writers of one fact drift apart. A later write
site updates one and forgets the other.

A generated column cannot reach that state, because it has no writer. Postgres
recomputes it from `body` on every write.

The key `currentStepId` SHALL stay in the instance body. The body remains what
`parseInstance` reads back into an `Instance`. The generated column's
expression also reads that body key. Dropping the key would leave the column
nothing to derive from.

As with the instance population scan, this requirement asks only that the index
exist. It asserts no query plan.

#### Scenario: Initialisation adds the column

- **WHEN** `initSchema` runs against a database created before this capability
- **THEN** `instances` carries a `current_step_id text` column
- **AND** every existing row reads its own body's `currentStepId` through it

#### Scenario: Initialisation creates the current-step index

- **WHEN** `initSchema` runs
- **THEN** an index on `instances (current_step_id)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** `initSchema` runs twice
- **THEN** the second run changes nothing and raises no error

#### Scenario: A step transition updates the column with no engine write

- **WHEN** an instance transitions to another step
- **AND** the engine writes the instance body alone
- **THEN** `current_step_id` reads the new step id

#### Scenario: The column rejects a direct write

- **WHEN** a statement writes `current_step_id` directly
- **THEN** the datastore rejects that statement
