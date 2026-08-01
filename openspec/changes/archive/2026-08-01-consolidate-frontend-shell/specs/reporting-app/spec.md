<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

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
