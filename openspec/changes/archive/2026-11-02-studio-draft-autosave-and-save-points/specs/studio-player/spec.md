<!-- antislop: allow-file sentence-length passive-voice negation-habit trailing-negation long-words synonym-rotation -->
<!-- Why: the MODIFIED blocks copy the live spec's older text word for word. -->

## MODIFIED Requirements

### Requirement: A Player screen drives a real instance through the Runtime API Layer

The studio area SHALL offer a `/studio/processes/:processId/play` screen. It
creates a new instance (`POST /instances`) and opens an existing instance by
id. It renders the current step as a form via `packages/form-ui`. It submits
only the visible, editable fields for the chosen path
(`POST /instances/:id/submit`). It re-fetches the instance view after every
mutation, rather than updating optimistically.

The Player SHALL offer two actions, each naming its run. An outlined
"Start a case from the published version" action creates an instance of the process's
newest published version. A filled "Test this draft" action creates a real, running instance from the process's current
draft body instead of a published version, via the studio-only creation
route. This action needs no published version to exist. The resulting
instance behaves like any other from that point on, except that its claim
also admits its starter and a `system:admin` holder (see
`draft-test-instances`). The screen
renders its current step as a form, accepts submissions through the same
path-submission flow, and re-fetches the view the same way after every
mutation.

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

#### Scenario: A draft with no published version can still be played

- **WHEN** a developer opens the Player for a process that has a draft but
  no published version at all, and chooses "Test this draft" instead of
  "Start a case from the published version"
- **THEN** a real, running instance is created from the draft body
- **AND** the Player renders that instance's initial step as a form, the
  same as it would for an instance created from a published version

#### Scenario: The published-version flow is unaffected

- **WHEN** a developer opens the Player for a process that has a published
  version and uses the "Start a case from the published version" action
- **THEN** an ordinary instance is created against the newest published
  version, exactly as before, and is not marked as a test instance

#### Scenario: The two buttons name their runs

- **WHEN** an author reads the Player's instance access
- **THEN** the filled control reads "Test this draft"
- **AND** the outlined control reads "Start a case from the published version"

### Requirement: The Player visibly marks a test instance as such

An instance the Player created via "Test this draft" SHALL be visibly
distinguished from an ordinary instance in the Player's own view, so a
developer mid-session can tell which kind they are running without
consulting the admin area.

#### Scenario: A test instance is marked in the Player

- **WHEN** a developer creates a test instance through the Player, or opens
  an existing test instance by id
- **THEN** the Player's view of that instance shows a visible marker
  identifying it as a test instance

#### Scenario: An ordinary instance carries no test marker

- **WHEN** a developer creates or opens an ordinary, published-version
  instance through the Player
- **THEN** the Player's view of that instance shows no test-instance marker

### Requirement: Player is one of the edit screen's togglable surfaces

The studio area's edit screen already toggles between Structure (Canvas +
Panels) and JSON. Player and Tools are additional, mutually-independent
navigation destinations, not additional toggle states of the same screen,
since neither drives a Draft the way Structure/JSON do. Switching to Player
or Tools with a change that has not landed saves that change first, with no
prompt (`studio-app`, Requirement: "Leaving the draft saves first"). A test instance therefore runs the author's latest work.
Only a failed save asks: confirming drops the change, and canceling leaves the
developer on the edit screen with the draft untouched. Switching to Player or Tools with a clean draft (nothing unsaved)
SHALL NOT discard it; returning to the edit screen SHALL show that unchanged
draft exactly as it was left.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer with no unsaved edits navigates to Player and back to
  the edit screen
- **THEN** the draft is unchanged from before the round trip

#### Scenario: Unsaved edits on a Player navigation are lost only after confirming

- **WHEN** a developer's latest edit fails to save on the way to the Player, and
  the developer confirms the dialog
- **THEN** the draft on the server lacks that edit

#### Scenario: Test saves first and asks nothing

- **WHEN** an author changes a label and presses Test within the pause
- **THEN** a save carries the change and the Player opens with no dialog
- **AND** a test instance created there prints the new label
