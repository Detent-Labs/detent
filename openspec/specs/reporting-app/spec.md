<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

# reporting-app Specification

## Purpose

The process-owner frontend, the reporting area of `packages/web`: a workspace package
mirroring the admin area of `packages/web`'s shape, reaching the engine only over the HTTP
wrapper, presenting the cycle-time, bottleneck and SLA views for one selected
process behind a shared date-range filter. Read-only throughout — it offers no
way to change anything in the engine.
## Requirements
### Requirement: The reporting frontend is a separate workspace package reaching the engine only over HTTP

The reporting frontend SHALL live at `packages/web/src/areas/reporting`, inside
the one workspace package that produces a browser bundle (see the
`unified-shell` capability), and SHALL NOT carry a build, typecheck or dev
server of its own. At runtime it SHALL reach the engine exclusively through the
HTTP wrapper and SHALL open no database connection of its own. At compile time
it SHALL import from the engine package only the definition-contract types it
renders, and SHALL NOT import the compile or expression-checking entry points
that the authoring area uses. It SHALL NOT consume the shared step-form
renderer, since it renders aggregated numbers and never a step form, and it
SHALL NOT import from another area's directory.

#### Scenario: The package builds and typechecks on its own

- **WHEN** the workspace build and typecheck commands run
- **THEN** `packages/web` builds and typechecks as one unit, with the reporting
  area needing no build of its own

#### Scenario: The package reaches the engine only over HTTP

- **WHEN** the area's runtime imports are inspected
- **THEN** none of them reaches the engine's database layer or its in-process
  runtime API directly

#### Scenario: The form renderer is not consumed

- **WHEN** the reporting area's imports are inspected
- **THEN** the shared step-form renderer is absent from them

#### Scenario: The authoring entry points stay out

- **WHEN** the reporting area's imports are inspected
- **THEN** neither the compile nor the expression-checking entry point appears

### Requirement: Access requires signing in and holding the reports role

The shell SHALL authenticate through the engine's existing login endpoint and
persist the resulting session under the one shared storage key (see the
`unified-shell` capability); the reporting area SHALL hold no storage key of
its own and SHALL send that session's token on every request. An
unauthenticated visitor SHALL be shown the login screen and no reporting data.
A signed-in actor lacking the reports role SHALL be shown an explicit refusal
naming the missing role rather than an empty report, a blank screen or a
generic failure.

#### Scenario: An unauthenticated visitor sees the login screen

- **WHEN** a visitor with no stored session opens any reporting screen
- **THEN** the login screen is shown and no reporting request is sent

#### Scenario: A signed-in actor without the role is told which role is missing

- **WHEN** an actor without the reports role signs in and the area receives
  `403` from a reporting route
- **THEN** the screen states that the reports role is required, and shows no
  report data

#### Scenario: A signed-in actor with the role reaches the views

- **WHEN** an actor holding the reports role signs in
- **THEN** the process picker is shown

#### Scenario: No second sign-in

- **WHEN** an actor holding the reports role is signed in under another area
  and navigates to `/reporting`
- **THEN** no login screen appears

### Requirement: A process is selected before any view is shown

The frontend SHALL require the process owner to select exactly one process
before showing any of the three views, mirroring the process-first shape the
authoring frontend's version and migration screens already use. The selected
process SHALL remain selected while switching between the three views, so
switching views does not re-ask for the process.

#### Scenario: No view renders before a process is chosen

- **WHEN** the app opens with no process selected
- **THEN** the process picker is shown and none of the three views renders

#### Scenario: The selection survives a view switch

- **WHEN** a process is selected and the process owner switches from one view
  to another
- **THEN** the same process stays selected and the new view loads for it

### Requirement: Every view shares one date-range filter defaulting to the last thirty days

The three views SHALL share one date-range control. When the process owner has
not chosen a range, the frontend SHALL send an explicit range covering the
last thirty days, computed in the frontend — it SHALL NOT omit the range and
rely on a server-side default. Changing the range SHALL reload the current
view for the same process, and the chosen range SHALL persist while switching
views.

#### Scenario: The default range is sent explicitly

- **WHEN** the process owner opens a view without touching the date control
- **THEN** the outgoing request carries explicit range bounds covering the last
  thirty days

#### Scenario: Changing the range reloads the current view

- **WHEN** the process owner changes the range
- **THEN** the current view reloads for the same process with the new bounds

#### Scenario: The range persists across a view switch

- **WHEN** the process owner sets a range and switches to another view
- **THEN** the new view loads with the same range

### Requirement: The three views present their numbers with their scope stated

The cycle-time view SHALL present the total-duration percentiles and the
per-step average dwell times, and SHALL state that both cover completed
instances only. The bottleneck view SHALL present the steps ranked by median
dwell time together with each step's current work-in-progress count, and SHALL
state that the ranking covers instances of every status while the
work-in-progress count ignores the date range. The SLA view SHALL present the
per-step breach rate and SHALL state that steps without a declared timer are
absent rather than passing.

A step SHALL be identified to the reader by its label from the process's
latest published version. A view whose result is empty SHALL say so in words
rather than rendering an empty table or an error.

#### Scenario: The cycle-time view states its completed-only scope

- **WHEN** the cycle-time view renders
- **THEN** it shows the percentiles and per-step averages, and states that both
  cover completed instances only

#### Scenario: The bottleneck view separates the ranking from the live count

- **WHEN** the bottleneck view renders
- **THEN** the ranking and the current work-in-progress count are
  distinguishable, and the differing scope of each is stated

#### Scenario: The SLA view explains an absent step

- **WHEN** the SLA view renders for a process where some steps declare no timer
- **THEN** it states that steps without a declared timer carry no SLA and are
  absent

#### Scenario: An empty result is stated in words

- **WHEN** a view's result contains no rows
- **THEN** the screen says so rather than showing an empty table or an error

### Requirement: The frontend offers no way to change anything

The reporting frontend SHALL issue only read requests. It SHALL present no
control that publishes, cancels, migrates, edits a definition, administers a
user, or changes an instance, and SHALL NOT reach any route outside the
reporting prefix other than the login endpoint.

#### Scenario: Only read requests are issued

- **WHEN** every request the frontend can issue is inspected
- **THEN** each is a read request against a reporting route, apart from the
  login request

#### Scenario: No mutating control is offered

- **WHEN** any reporting screen is inspected
- **THEN** it presents no control that changes engine state

### Requirement: The view-model computations are pure and tested

The percentile formatting, the ranking presentation and the default-range
computation SHALL live in pure modules that the components consume, matching
the convention the operator area's migration logic already uses, and SHALL
carry their own tests. Components themselves SHALL NOT be tested, per the
existing repository convention.

#### Scenario: The default range computation is tested against a fixed instant

- **WHEN** the default-range module is given a fixed reference instant
- **THEN** it returns bounds covering the thirty days before it, and a test
  asserts this

#### Scenario: The ranking presentation is tested independently of rendering

- **WHEN** the ranking module is given an unordered set of per-step medians
- **THEN** it returns them ordered longest-first, asserted without rendering a
  component

