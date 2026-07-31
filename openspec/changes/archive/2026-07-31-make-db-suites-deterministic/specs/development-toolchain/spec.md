<!-- antislop: allow-file passive-voice -->
<!-- WHEN/THEN scenarios name a condition, not an actor. Every spec under
     openspec/specs/ carries the same passive phrasing. -->

## ADDED Requirements

### Requirement: The suite runs against a database no other process drives

A `bun test` run SHALL use a database of its own, separate from the one
`bun run serve`, `bun run seed` and the auth CLI use. The test database SHALL
be derived from `DATABASE_URL`, by appending `_test` to its database name. A
name that already ends in `_test` SHALL stay unchanged. The database SHALL be
created on demand when it does not exist.

The choice SHALL happen in a `bun test` preload, wired through the
repository-root `bunfig.toml`. It SHALL NOT depend on a caller running a
particular script name.

That wiring reaches every `bun test` started from the repository root, which
is what both gates and the documented workflow do. Bun reads `bunfig.toml`
from the working directory, so a run started inside a package directory does
not get the preload. No suite under `packages/*/test/` touches a database
today, and none SHALL: a DB-backed suite belongs in `test/`.

The reason is measured, not theoretical. The HTTP server starts background
pollers through `startEngine`, one claiming outbox rows every 500 ms. Against
one shared database those pollers take rows the suite is driving. Twenty runs
with a dev server up produced three red runs. Twenty with none produced zero.

Separation SHALL hold in both directions. A test run SHALL NOT truncate the
tables a dev server, a seed or a browser session is using.

When `DATABASE_URL` is unset, the preload SHALL leave it unset. The DB-backed
suites then skip, as they do today, rather than failing on a derived name.

#### Scenario: A test run does not touch the development database

- **WHEN** the suite runs while a dev server drives the development database
- **THEN** the suite's writes land in the `_test` database, and the
  development database keeps its rows

#### Scenario: The test database is created on demand

- **WHEN** the suite runs and the `_test` database does not exist
- **THEN** it is created, and the run proceeds

#### Scenario: No connection string still skips rather than fails

- **WHEN** the suite runs with `DATABASE_URL` unset
- **THEN** the DB-backed suites skip, and no derived database name is used

### Requirement: A run names the database it used

Each `bun test` run SHALL print the database it connected to, before the
first suite runs. A run against the wrong database is then visible at once,
in either direction.

#### Scenario: The run states its database

- **WHEN** the suite starts with `DATABASE_URL` set
- **THEN** its output names the database the run will use

### Requirement: A wandering test result counts as a defect

`bun run check` gates every push, through `.githooks/pre-push`. That gate
reads a pass as evidence that the tree is sound.

Take an unchanged tree. A test that fails on one run and passes on the next
SHALL count as a defect. It lives in the suite, in the code it covers, or in
the environment the run shares. It is never noise to rerun past.

A defect of that kind SHALL NOT be answered by a retry wrapper, a widened
timeout, or a skipped test. Each of those leaves the gate green over the same
defect. The suite is the only evidence either gate has.

Diagnosis SHALL rest on a captured assertion, not on a test name alone. A name
records that something broke. Only the assertion, with its expected and
received values, says what.

#### Scenario: A wandering result is not rerun past

- **WHEN** a test fails on one run and passes on the next, against an
  unchanged tree
- **THEN** it is treated as a defect to diagnose, and neither a retry nor a
  skip closes it

#### Scenario: A name alone does not close a diagnosis

- **WHEN** a run reports a failing test but its assertion text goes uncaptured
- **THEN** the diagnosis stays open until a run captures the assertion
