# browser-smoke-suite

## Purpose

A committed browser suite drives the production web build through a small set
of flows. It gives stale UI state, route collisions and hidden dialogs a
mechanical gate on every push.

## Requirements

### Requirement: The smoke suite runs against a database of its own

A smoke suite run SHALL use a database no other process drives. The run SHALL
derive the name from `DATABASE_URL` by appending `_e2e` to its database name.
Before its first flow, the run SHALL drop that database and make a new one.
Every run then starts from the same seeded state.

The suite SHALL NOT use the `_test` database. A running HTTP server takes outbox
rows a `bun test` run is driving. The suite SHALL NOT use the development
database either, because the run drops its own database.

A run with `DATABASE_URL` unset SHALL fail and name the variable. It SHALL NOT
skip and report a pass.

#### Scenario: A smoke run leaves the other databases alone

- **WHEN** the smoke suite runs while a dev server drives the development
  database
- **THEN** every write of the run lands in the `_e2e` database
- **AND** the development and `_test` databases keep their rows

#### Scenario: A second run starts from the same state

- **WHEN** a smoke run finishes and a second run starts
- **THEN** the second run drops the `_e2e` database and makes a new one before
  its first flow

#### Scenario: No connection string fails the run

- **WHEN** the smoke suite starts with `DATABASE_URL` unset
- **THEN** the run exits non-zero and names `DATABASE_URL`

### Requirement: The smoke suite drives the production build on an ephemeral port

The suite SHALL drive the engine serving the production web build, never the
Vite dev server. A run SHALL fail and name the build command when the web build
is absent.

The run SHALL start the engine with a port the operating system chooses. It
SHALL learn that port from the engine's own report. The run SHALL stop the
engine on every path out, a failed flow included.

The browser SHALL reach the engine at `127.0.0.1`, never `localhost`. The
browser locale SHALL be `en-US`, so the flows read the English catalog.

#### Scenario: A missing build fails with the command that fixes it

- **WHEN** the smoke suite starts and `packages/web/dist` does not exist
- **THEN** the run exits non-zero and names `bun run build`

#### Scenario: A failed flow leaves no engine behind

- **WHEN** a flow fails
- **THEN** the run stops the engine it started before it exits

#### Scenario: Two runs do not collide on a port

- **WHEN** a run leaves an engine alive, and the suite runs again
- **THEN** the second run starts its own engine on another port and proceeds

### Requirement: The smoke suite covers four flows

The suite SHALL hold at least the four flows below. Each flow SHALL fail on an
uncaught page exception, as well as on its own assertions.

A flow that checks a list after a mutation SHALL read the list the UI shows. It
SHALL NOT read the list from the HTTP API. The API answers with fresh state
while the screen can still show stale state.

#### Scenario: Every area loads after a login

- **WHEN** an operator holding the roles of all four areas logs in through the login
  screen
- **AND** the operator opens `/app`, `/admin`, `/studio` and `/reporting` in turn
- **THEN** each area renders its own navigation
- **AND** no area renders the error boundary

#### Scenario: A completed task leaves My tasks

- **WHEN** a participant starts Expense Approval from "Start a process"
- **AND** the participant claims the task, fills its required fields, and
  submits it
- **THEN** My tasks shows one Expense Approval row fewer than it showed after
  the start

#### Scenario: A cancelled instance shows as cancelled in the admin list

- **WHEN** an operator cancels a running instance from its admin detail screen
- **AND** the operator returns to the instances list through the UI
- **THEN** the list shows that instance as `cancelled`, with no page reload

#### Scenario: A publish adds a version

- **WHEN** a developer opens a draft that differs from the published version
- **AND** the developer publishes it through the publish dialog
- **THEN** the dialog closes and the header shows the new version
- **AND** the Versions screen lists that version

#### Scenario: A refused publish shows its reason inside the dialog

- **WHEN** the publish request fails while the publish dialog is open
- **THEN** the refusal message renders inside the open dialog
- **AND** no refusal message renders behind it

### Requirement: CI runs the smoke suite on every push and pull request

The CI workflow SHALL run the smoke suite on every push and every pull request.
It SHALL run it in a job of its own, beside the job that runs `bun run check`.
The suite SHALL run inside the devcontainer, like `bun run check`.

A failed flow SHALL fail the job. The job SHALL keep the failed flow's trace as
a downloadable artifact. A run that executes no flow SHALL fail the job.

The suite SHALL NOT retry a failed flow. A retry turns a flaky flow into a
pass.

#### Scenario: A failed flow blocks the pull request

- **WHEN** a pull request breaks one of the four flows
- **THEN** the smoke job fails, and the pull request shows a red check

#### Scenario: A failed flow leaves a trace to read

- **WHEN** a flow fails in CI
- **THEN** the job uploads that flow's trace as an artifact

#### Scenario: An empty run is not a pass

- **WHEN** the suite finds no flow to run
- **THEN** the job fails
