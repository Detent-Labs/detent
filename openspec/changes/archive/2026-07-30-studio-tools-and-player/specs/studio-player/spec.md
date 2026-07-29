<!-- antislop: allow-file all -->

## ADDED Requirements

### Requirement: A Player screen drives a real instance through the Runtime API Layer

`packages/studio` SHALL offer a `/processes/:processId/play` screen, carried
over from `packages/editor`'s Player rather than rewritten: it creates a new
instance (`POST /instances`), opens an existing instance by id, renders the
current step as a form via `packages/form-ui` (the same package the
end-user app uses, so what a developer previews is what a participant
gets), submits only the visible, editable fields for the chosen path
(`POST /instances/:id/submit`), and re-fetches the instance view after every
mutation rather than optimistically updating. It SHALL support manual
refresh with no polling. Every HTTP error type SHALL map to a distinct,
named message, the same mapping `packages/editor`'s Player already used.

This screen SHALL use the studio shell's existing session/HTTP-client
modules, not a separate credential store, and SHALL be reachable only to an
authenticated actor holding `system:developer`, presentationally by the
shell and authoritatively by every route it calls.

#### Scenario: Creating an instance starts the Player

- **WHEN** a developer creates a new instance from a published process version
- **THEN** the Player renders that instance's initial step as a form

#### Scenario: Submitting a step re-fetches the view

- **WHEN** a developer submits a step's visible fields via one of its
  available paths
- **THEN** the Player re-fetches the instance view and renders whatever step
  is current afterward, rather than assuming the submitted path was taken

#### Scenario: A wait-state renders with no available path

- **WHEN** the Player opens an instance whose current step has no
  currently-matching manual path
- **THEN** the form renders read-only with no submit action, per `form-ui`'s
  existing `availablePaths`-driven rendering

#### Scenario: An HTTP error renders as a named state, not a crash

- **WHEN** any Player request fails
- **THEN** a distinct, named failure state renders for that error type,
  matching `spa-error-reporting`'s existing requirement that no screen
  rethrows a non-401 error out of an async handler

### Requirement: The Player is shown beside the instance's merged transition/event record

The Player screen SHALL fetch and display the driven instance's merged
history/event record (`GET /instances/:id/record`) alongside the form,
refetching it whenever the Player refetches the instance view. This is
`packages/studio`'s point of difference from `packages/editor`'s Player,
which had no such view: a developer watches a definition run and sees its
full audit trail in the same screen, distinct from `packages/admin`'s
instance detail, which is the operator's read/cancel view rather than an
authoring aid.

Reading the record of an instance the developer did not start still requires
`system:admin` — this screen only widens access to instances the developer's
own Player session created (see the `authorization` capability's new
developer-record-read requirement); it does not turn Player into a general
record browser.

#### Scenario: The record renders beside a Player-created instance

- **WHEN** a developer creates an instance through Player and it transitions
  at least once
- **THEN** the merged record panel shows at least one entry, without the
  developer holding `system:admin`

#### Scenario: An instance the developer did not start is still refused

- **WHEN** a developer who lacks `system:admin` opens Player against an
  instance id they did not start
- **THEN** the record panel shows the same 403 failure state
  `spa-error-reporting` already defines for any other refused read

### Requirement: Player is one of the edit screen's togglable surfaces

`packages/studio`'s edit screen already toggles between Structure (Canvas +
Panels) and JSON. This change adds Player and Tools as additional,
mutually-independent navigation destinations — not additional toggle states
of the same screen, since neither drives a Draft the way Structure/JSON do.
Switching to Player or Tools SHALL NOT discard in-progress draft edits on
the process the developer was editing; returning to the edit screen SHALL
show the draft exactly as it was left.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer has unsaved edits on a draft, navigates to Player, and
  navigates back to the edit screen
- **THEN** the unsaved edits are still present, unsaved
