## MODIFIED Requirements

### Requirement: A Player screen drives a real instance through the Runtime API Layer

The studio area SHALL offer a `/studio/processes/:processId/play` screen. It
creates a new instance (`POST /instances`) and opens an existing instance by
id. It renders the current step as a form via `packages/form-ui`. It submits
only the visible, editable fields for the chosen path
(`POST /instances/:id/submit`). It re-fetches the instance view after every
mutation, rather than updating optimistically.

The screen SHALL support manual refresh with no polling. Every HTTP error type
SHALL map to a distinct, named message.

This screen SHALL use the studio shell's existing session and HTTP-client
modules, not a separate credential store. An authenticated actor holding
`system:developer` or `system:author` SHALL reach it. The shell gates it
presentationally, and every route it calls gates it authoritatively. An author
checks a step form in the Player before publishing, so the authoring role
reaches it.

#### Scenario: Creating an instance starts the Player

- **WHEN** a developer creates a new instance from a published process version
- **THEN** the Player renders that instance's initial step as a form

#### Scenario: An author reaches the Player

- **WHEN** an actor holding only `system:author` opens the Player for a
  published process version
- **THEN** the screen renders rather than the explanatory state

#### Scenario: Submitting a step re-fetches the view

- **WHEN** a developer submits a step's visible fields via one of its
  available paths
- **THEN** the Player re-fetches the instance view
- **AND** it renders whatever step is current afterward, rather than assuming
  the engine took the submitted path

#### Scenario: A wait-state renders with no available path

- **WHEN** the Player opens an instance whose current step has no
  currently-matching manual path
- **THEN** the form renders read-only with no submit action, per `form-ui`'s
  existing `availablePaths`-driven rendering

#### Scenario: An HTTP error renders as a named state, not a crash

- **WHEN** any Player request fails
- **THEN** a distinct, named error state renders for that error type
- **AND** it matches `spa-error-reporting`'s existing rule that no screen
  rethrows a non-401 error out of an async handler

<!-- antislop: allow passive-voice -->
### Requirement: The Player is shown beside the instance's merged transition/event record

The Player screen SHALL fetch and display the driven instance's merged
history/event record (`GET /instances/:id/record`) alongside the form. It SHALL
refetch that record whenever it refetches the instance view. An author watches
a definition run. That author sees its full audit trail in the same screen.
The admin area's instance detail differs: it is the operator's read and cancel
view rather than an authoring aid.

Reading the record of an instance the actor did not start still needs
`system:admin`. This screen only widens access to instances the actor's own
Player session created. The `authorization` capability's record-read
requirement carries that rule, and it admits `system:developer` and
`system:author` alike. This screen does not turn the Player into a general
record browser.

#### Scenario: The record renders beside a Player-created instance

- **WHEN** a developer creates an instance through Player and it transitions
  at least once
- **THEN** the merged record panel shows at least one entry, without the
  developer holding `system:admin`

#### Scenario: The record renders for an author's own Player instance

- **WHEN** an actor holding only `system:author` creates an instance through
  Player and it transitions at least once
- **THEN** the merged record panel shows at least one entry, without that actor
  holding `system:admin`

#### Scenario: An instance the actor did not start is still refused

- **WHEN** an actor who lacks `system:admin` opens Player against an
  instance id they did not start
- **THEN** the record panel shows the same 403 error state
  `spa-error-reporting` already defines for any other refused read
