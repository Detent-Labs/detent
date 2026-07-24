# editor-player Specification

## Purpose

A Player/preview screen in `packages/editor` that drives a real, running
process instance through the HTTP wrapper: connect to a server, create or
open an instance of an already-published process, render its current step
as a form from `getInstanceView`, and submit manual-path transitions via
`submitAndTransition` — distinct from the editor's read-only structural
graph view, which shows the FSM *shape*, not a running instance.

## Requirements

### Requirement: Player connects to a running HTTP server with a persisted actor

The editor SHALL provide a Player screen where an author sets a server URL
and an actor (`id` + `roles`), used as the `actor` on every subsequent
Runtime API Layer call made through the HTTP wrapper. `serverUrl`,
`actorId`, and `actorRoles` SHALL persist to `localStorage` so they survive
a page reload without being re-entered.

#### Scenario: Actor persists across a reload
- **WHEN** an author sets a server URL and actor in the Player and reloads
  the page
- **THEN** the Player restores the same server URL and actor without the
  author re-entering them

#### Scenario: Every call uses the configured actor
- **WHEN** an author creates an instance, opens an instance, or submits a
  transition
- **THEN** the request sent to the HTTP wrapper carries the actor currently
  configured in the Player

### Requirement: Player creates a new process instance

The Player SHALL let an author create a new instance of an already-published
process by `processId`, with an optional explicit `version` and optional
raw-JSON seed data, via `POST /processes/:processId/instances`. On success
the Player SHALL load and display that instance's current view.

#### Scenario: Creating an instance with no seed data
- **WHEN** an author submits a `processId` with no seed data
- **THEN** the Player calls the create-instance route with only `actor`
  (and `version` if provided) and, on success, displays the created
  instance's current step

#### Scenario: Creating an instance with seed data
- **WHEN** an author submits a `processId` and a raw-JSON seed data object
- **THEN** the Player calls the create-instance route with that data as the
  `data` field

#### Scenario: Invalid seed JSON is rejected before sending
- **WHEN** an author submits seed data that is not valid JSON
- **THEN** the Player reports a validation error and does not send a
  request

### Requirement: Player opens an existing instance by id

The Player SHALL let an author load an already-known instance by pasting its
`instanceId`, via `GET /instances/:instanceId`, and display its current
view.

#### Scenario: Opening a known instance
- **WHEN** an author pastes a valid `instanceId` and opens it
- **THEN** the Player fetches and displays that instance's current step and
  available paths

#### Scenario: Opening an unknown instance surfaces an error
- **WHEN** an author pastes an `instanceId` the server does not recognize
- **THEN** the Player displays the resulting error rather than a blank or
  stale view

### Requirement: Player renders the current step as a form

Once an instance is loaded, the Player SHALL render the current step's
resolved view fields (`ResolvedViewField[]` from `getInstanceView`) as a
form, and render `availablePaths` as submit actions.

#### Scenario: Step fields render as inputs
- **WHEN** an instance's current step has resolved view fields
- **THEN** the Player renders one input per field, matched to the field's
  `BaseFieldType`

#### Scenario: Available paths render as submit actions
- **WHEN** an instance's current step view includes one or more
  `availablePaths`
- **THEN** the Player renders one submit action per available path

#### Scenario: No available paths renders no submit action
- **WHEN** an instance's current step view has no `availablePaths` (a
  wait-state with no currently-matching manual path)
- **THEN** the Player renders the form read-only with no submit action,
  rather than an action that would fail

### Requirement: Field rendering covers every BaseFieldType

The Player's field renderer SHALL render a usable input for every
`BaseFieldType`: `string`, `number`, `date`, and `datetime` as native text/
number/date/datetime-local inputs; `boolean` as a checkbox;
`select`/`multiselect` as a `select` built from `field.options` when
present — populated for both static `FieldDef.options` fields and
`dataSource`-bound fields alike, since `getInstanceView` now resolves
`options` for both, per the `data-source-resolution` capability; `group` as
a nested container housing the fields that carry its key in
`ResolvedViewField.group`. A field of type `reference`, `file`, or a
`Plugin` envelope type SHALL render as a free-text input, since no dedicated
widget, reference picker, or file upload exists in this preview tool — this
fallback no longer applies to a `select`/`multiselect` field solely because
it carries `field.dataSource` instead of static `field.options`.

#### Scenario: Every BaseFieldType renders without error
- **WHEN** the Player renders a step whose view includes at least one field
  of each `BaseFieldType`
- **THEN** every field renders a corresponding input with no rendering
  error

#### Scenario: A dataSource-bound field renders using its resolved options
- **WHEN** a `select` or `multiselect` field declares `field.dataSource`
  instead of `field.options`
- **THEN** the Player renders it as a `select` built from the field's
  resolved `options`, the same as a static-`options` field, with no free-text
  fallback or "not yet supported" note

#### Scenario: A group field nests its member fields
- **WHEN** a step view includes a `group` field and other fields whose
  `ResolvedViewField.group` names that group's key
- **THEN** the Player renders the member fields nested within the group's
  container, not flattened alongside it

#### Scenario: A readonly field's input is disabled
- **WHEN** a resolved view field has `readonly` set
- **THEN** the Player renders its input in a disabled state

#### Scenario: A required field displays a required marker
- **WHEN** a resolved view field has `required` set
- **THEN** the Player renders a visible marker on that field, with no
  client-side submission enforcement — requiredness is validated
  server-side by `submitAndTransition`

### Requirement: Player submits only visible, editable fields

Submitting a manual path SHALL send only the current step's visible and
non-readonly fields, keyed by `field.id`, via `POST
/instances/:instanceId/submit`.

#### Scenario: Readonly fields are excluded from the submission
- **WHEN** an author submits a manual path from a step whose view includes
  a `readonly` field
- **THEN** the submitted `data` does not include that field's id

#### Scenario: Submission keys match field ids, not keys
- **WHEN** an author submits a manual path
- **THEN** every entry in the submitted `data` is keyed by the field's `id`

### Requirement: Player always re-fetches the instance view after a mutation

After a successful create or submit call, the Player SHALL issue a
follow-up `GET /instances/:instanceId` and render the result, regardless of
whether the mutation response body was an `Instance` or (for a submit that
resolved via the automatic-cascade case) already an `InstanceView`.

#### Scenario: Create is followed by a view fetch
- **WHEN** an instance is successfully created
- **THEN** the Player issues a `GET /instances/:instanceId` for the new
  instance before rendering its step

#### Scenario: Submit is followed by a view fetch regardless of response shape
- **WHEN** a submit call succeeds, whether or not the response already
  contains an `InstanceView`
- **THEN** the Player issues a `GET /instances/:instanceId` and renders
  that result as the displayed view

### Requirement: Player supports manual refresh with no polling

The Player SHALL provide a manual Refresh action that re-fetches the
current instance's view. The Player SHALL NOT poll or otherwise
automatically re-fetch the view on a timer or subscription.

#### Scenario: Refresh re-fetches the current instance
- **WHEN** an author clicks Refresh while an instance is loaded
- **THEN** the Player issues a `GET /instances/:instanceId` for that
  instance and updates the displayed view

#### Scenario: No background polling occurs
- **WHEN** an instance is loaded and the author takes no action
- **THEN** the Player issues no further requests for that instance until
  the author explicitly refreshes, submits, or reopens it

### Requirement: Player maps and displays each HTTP error type distinctly

The Player SHALL map each HTTP wrapper error response to a distinct display:
a `validation` error (422) as a per-field issue list matched to inputs by
`fieldId` where possible; a `guard-refused` error (409) as an inline message
suggesting Refresh; a `concurrency-conflict` error (409) as an inline
message suggesting Refresh and retry; and an `internal` error (500, or a
network failure) as the raw error message.

#### Scenario: Validation errors are shown per field
- **WHEN** a submit call returns a `validation` error with issues for
  specific field ids
- **THEN** the Player displays each issue attached to its matching field's
  input where a match exists

#### Scenario: A guard-refused error suggests refreshing
- **WHEN** a submit call returns a `guard-refused` error
- **THEN** the Player displays a message that the selected path is no
  longer available and suggests refreshing

#### Scenario: A concurrency conflict suggests refresh and retry
- **WHEN** a submit call returns a `concurrency-conflict` error
- **THEN** the Player displays a message that the instance changed
  concurrently and suggests refreshing and retrying

#### Scenario: A network failure is shown as-is
- **WHEN** a request fails before receiving an HTTP response (e.g. the
  server is unreachable)
- **THEN** the Player displays the resulting error message unmodified

### Requirement: Player and Structure editor are independent, togglable modes

`App.tsx` SHALL provide a local-state toggle between the existing
"Structure" editor and the Player, with no routing dependency. The
Player's state provider SHALL wrap only the Player mode and SHALL be
independent of the Draft provider used by the Structure editor.

#### Scenario: Switching to Player mode does not affect the open Draft
- **WHEN** an author has an unsaved Draft open in Structure mode and
  switches to Player mode
- **THEN** the open Draft's state is unchanged, and switching back to
  Structure mode shows it exactly as left

#### Scenario: Player mode requires no open Draft
- **WHEN** an author switches to Player mode with no Draft loaded
- **THEN** the Player screen renders and functions using only its own
  server/actor/instance state
