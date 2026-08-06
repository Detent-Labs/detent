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

The studio area SHALL offer a `/studio/processes/:processId/play` screen: it
creates a new instance (`POST /instances`), opens an existing instance by
id, renders the current step as a form via `packages/form-ui`, submits only
the visible, editable fields for the chosen path
(`POST /instances/:id/submit`), and re-fetches the instance view after every
mutation rather than optimistically updating. It SHALL support manual
refresh with no polling. Every HTTP error type SHALL map to a distinct,
named message.

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
refetching it whenever the Player refetches the instance view: a developer
watches a definition run and sees its full audit trail in the same screen,
distinct from the admin area's instance detail, which is the operator's
read/cancel view rather than an authoring aid.

Reading the record of an instance the developer did not start still requires
`system:admin` — this screen only widens access to instances the developer's
own Player session created (see the `authorization` capability's
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

The studio area's edit screen already toggles between Structure (Canvas +
Panels) and JSON. Player and Tools are additional, mutually-independent
navigation destinations, not additional toggle states of the same screen,
since neither drives a Draft the way Structure/JSON do. Switching to Player
or Tools SHALL NOT discard in-progress draft edits on the process the
developer was editing; returning to the edit screen SHALL show the draft
exactly as it was left.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer has unsaved edits on a draft, navigates to Player, and
  navigates back to the edit screen
- **THEN** the unsaved edits are still present, unsaved

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
