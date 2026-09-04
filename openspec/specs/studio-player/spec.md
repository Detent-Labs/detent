<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo (see
     admin-app/spec.md). This new file follows the same convention for
     consistency with every sibling spec, rather than reading differently
     from the rest of openspec/specs/. -->

# studio-player Specification

## Purpose

A Player screen on the studio area of `packages/web` that drives a real, running instance
through the Runtime API Layer, shown beside that instance's merged
transition/event record — the developer's own point of difference from
the admin area of `packages/web`'s instance detail, which is the operator's read/cancel view
rather than an authoring aid. Reuses `packages/form-ui` for step forms, the
same package the end-user app uses, so what a developer previews is what a
participant gets. See `studio-app` for the shell navigation that reaches it,
`authorization` for the `system:developer` role and the additive
developer-record-read exception this screen relies on, and `studio-tools`
for the sibling read-only Tools screen.
## Requirements
### Requirement: A Player screen drives a real instance through the Runtime API Layer

The studio area SHALL offer a `/studio/processes/:processId/play` screen. It
creates a new instance (`POST /instances`) and opens an existing instance by
id. It renders the current step as a form via `packages/form-ui`. It submits
only the visible, editable fields for the chosen path
(`POST /instances/:id/submit`). It re-fetches the instance view after every
mutation, rather than updating optimistically.

Alongside the action that creates an instance of the process's newest
published version, the Player SHALL offer a separate "Create test instance"
action that creates a real, running instance from the process's current
draft body instead of a published version, via the studio-only creation
route. This action needs no published version to exist. The resulting
instance behaves exactly like any other from that point on: the screen
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
  no published version at all, and chooses "Create test instance" instead of
  "Create new instance"
- **THEN** a real, running instance is created from the draft body
- **AND** the Player renders that instance's initial step as a form, the
  same as it would for an instance created from a published version

#### Scenario: The published-version flow is unaffected

- **WHEN** a developer opens the Player for a process that has a published
  version and uses the existing "Create new instance" action
- **THEN** an ordinary instance is created against the newest published
  version, exactly as before, and is not marked as a test instance

### Requirement: The Player's step form falls back to the process's base locale

The Player renders `en` as its own fixed content locale. A field's
`LocalizedText` label, and each of its option labels, SHALL still fall back
to `InstanceView.baseLocale` whenever a label carries no `en` entry. This is
the same fallback rule the end-user app's Task screen applies. It keeps the
Player's preview faithful to what a participant sees. That faithfulness is
this capability's own "what a developer previews is what a participant gets"
purpose.

#### Scenario: A Player field label falls back to the process's base locale

- **WHEN** the Player renders a step whose field label has no `en` entry
- **THEN** the label renders the process's `baseLocale` text rather than the
  field's raw `key`

### Requirement: The Player visibly marks a test instance as such

An instance the Player created via "Create test instance" SHALL be visibly
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

### Requirement: Player is one of the edit screen's togglable surfaces

The studio area's edit screen already toggles between Structure (Canvas +
Panels) and JSON. Player and Tools are additional, mutually-independent
navigation destinations, not additional toggle states of the same screen,
since neither drives a Draft the way Structure/JSON do. Switching to Player
or Tools while the draft carries an unsaved change goes through the
`studio-app` capability's unsaved-changes guard (Requirement: "Leaving the
edit screen with unsaved changes prompts first"): confirming the prompt
discards the in-progress edits, the same way an explicit Discard already
does; canceling leaves the developer on the edit screen with the draft
untouched. Switching to Player or Tools with a clean draft (nothing unsaved)
SHALL NOT discard it; returning to the edit screen SHALL show that unchanged
draft exactly as it was left.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer with no unsaved edits navigates to Player and back to
  the edit screen
- **THEN** the draft is unchanged from before the round trip

#### Scenario: Unsaved edits on a Player navigation are lost only after confirming

- **WHEN** a developer has unsaved edits on a draft, navigates to Player, and
  confirms the unsaved-changes prompt
- **THEN** the edits are discarded, the same way an explicit Discard already
  discards them

### Requirement: The Player's form pane reflows to one column under a width threshold

<!-- The quoted requirement title below is an existing spec heading and must
     match it word for word to stay a usable cross-reference. -->
<!-- antislop: allow passive-voice -->
The Player already puts the form beside the merged record. The
requirement titled "The Player is shown beside the instance's merged
transition/event record" owns that layout. This one adds only what
happens when there is no room for it.

Under a width threshold, the layout SHALL collapse to one column. The
order is instance access, the form and its controls, then the record
last.

The threshold SHALL come from the form's own comfortable measure, not
a fixed device width. This requirement governs the Player's own two
panes. The form's internal grid carries its own collapse rule. The
`form-ui` capability owns that rule, so both consumers get it at the
same point. The participant's Task screen has no second pane to fold,
so it needs nothing here.

The form itself renders through `form-ui`'s `FieldForm`, honoring the
current step's `columns` and each field's `span` (see the `form-ui`
capability). A field's own span never changes across this reflow. Only
the page's two panes fold into one.

#### Scenario: Above the threshold the side-by-side layout holds

- **WHEN** the Player renders above the width threshold
- **THEN** the form and the record sit side by side, exactly as the
  existing side-by-side requirement already specifies

#### Scenario: Narrow, the layout stacks with the record last

- **WHEN** the Player renders below the width threshold
- **THEN** instance access, then the form, then the record render in
  that order, stacked in one column

#### Scenario: A spanning field keeps its span through the reflow

- **WHEN** the Player collapses to one column and a resolved field's
  `span` is `2` on a `columns: 2` view
- **THEN** that field still renders across both of the form's own
  columns. The reflow folds the page's panes, not the form's internal
  grid

### Requirement: The Player screen renders from compiled styles

`screens/PlayerScreen.tsx` SHALL render from compiled component
styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration. That
includes the reflow to one column under its own width threshold.

#### Scenario: The Player screen keeps its look at both widths

- **WHEN** a browser renders the Player screen above and below its own
  reflow width threshold
- **THEN** each width's computed layout, spacing, color and border
  equal the values the deleted stylesheet declared
