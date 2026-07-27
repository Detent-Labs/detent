# end-user-app

## Purpose

The participant-facing web application (`packages/app`) for the people who
*do the work* a process describes: log in, see the tasks assigned to them
across every process, fill in a step's form and submit it, and start a new
process. A separate product from the admin/developer area (out of scope
here). Four screens — Login, My tasks (inbox), Task, Start a process — over a
small hand-written History-API routing hook, talking to the engine only
through the HTTP wrapper. Step forms render through the shared `form-ui`
package, so what an author previews in the editor's Player is what a
participant gets. Out of scope for v1: case history view, notifications,
attachments, comments, delegation, and role/group-based assignment.

## Requirements

### Requirement: Login screen authenticates against POST /auth/login

The app SHALL provide a login screen collecting email and password and
submitting them to `POST /auth/login`. On success it SHALL persist the
returned JWT to `localStorage` and navigate to the my-tasks screen (`/`). On
failure it SHALL display a generic login failure and persist no token.

#### Scenario: Successful login navigates to the inbox

- **WHEN** a user submits valid credentials on the login screen
- **THEN** the returned token is persisted to `localStorage` and the app
  navigates to `/`

#### Scenario: Failed login persists no token

- **WHEN** a user submits credentials `POST /auth/login` rejects
- **THEN** the app displays a generic login failure and `localStorage` holds
  no token

### Requirement: Routing is a hand-written History-API hook covering four routes

The app SHALL implement `/`, `/tasks/:instanceId`, `/start`, and `/login`
through a small hand-written History-API hook, with no routing library
dependency. Task URLs SHALL be directly shareable/bookmarkable.

#### Scenario: Navigating to a task URL directly loads that task

- **WHEN** a user loads `/tasks/:instanceId` directly (e.g. via a bookmarked
  or shared URL) with a valid session
- **THEN** the app renders that instance's task screen without first passing
  through the inbox

#### Scenario: No routing library is a dependency

- **WHEN** the app's `package.json` dependencies are inspected
- **THEN** no routing library (e.g. `react-router`) appears among them

### Requirement: Any 401 response returns the user to /login

The app SHALL treat a `401` response from any API call as an invalid session:
it SHALL discard the persisted token and navigate to `/login`. The app SHALL
NOT track the token's remaining lifetime client-side; a `401` is the sole
signal that a session has ended.

#### Scenario: A 401 anywhere in the app redirects to login

- **WHEN** any API call made by the app receives a `401` response
- **THEN** the app discards the persisted token and navigates to `/login`

#### Scenario: No client-side expiry check runs

- **WHEN** a persisted token is nearing or past its lifetime
- **THEN** the app performs no client-side expiry check and reacts only to a
  `401` response

### Requirement: My tasks screen lists the caller's inbox via scope=mine

The my-tasks screen (`/`) SHALL issue `GET /instances?scope=mine&limit=200`
and SHALL NOT send any client-derived actor id (e.g. `assignedTo=<my-id>`) —
the server resolves "mine" from the authenticated actor, so a later
group-based assignment extension stays entirely server-side. Each row SHALL
show the process label, step label, waiting time since the current step was
entered, and whether the task is unclaimed or claimed by the current user.

#### Scenario: The inbox request carries scope=mine, not an explicit actor id

- **WHEN** the my-tasks screen loads
- **THEN** it issues `GET /instances?scope=mine&limit=200` with no
  `assignedTo` parameter in the request

#### Scenario: A row shows process, step, waiting time, and claim state

- **WHEN** the inbox contains an instance parked on a step the current user
  is a candidate for
- **THEN** its row displays that instance's `processLabel`, `stepLabel`, the
  time elapsed since `currentStepEnteredAt`, and whether it is unclaimed or
  claimed by the current user

### Requirement: The inbox control bar filters, sorts, and groups client-side

The my-tasks screen SHALL provide a control bar to filter by process, sort by
waiting time / most recent / process, and group by process or ungrouped. All
three SHALL operate over the already-loaded set of rows with no additional
request, since a personal inbox is below the 200-row page limit in practice.

#### Scenario: Filtering by process narrows the visible rows

- **WHEN** a user selects a process in the filter control
- **THEN** only rows for that process remain visible, with no new request
  issued

#### Scenario: Sorting reorders the loaded rows

- **WHEN** a user selects a sort option
- **THEN** the visible rows reorder accordingly, computed from the already-
  loaded set

#### Scenario: Grouping by process clusters rows under process headers

- **WHEN** a user selects "group by process"
- **THEN** the visible rows render clustered under a heading per process

### Requirement: A returned cursor shows a load-more control with a stated scope caveat

If the inbox request returns a pagination cursor, the screen SHALL show a
"load more" control and SHALL state that client-side sort/filter/group apply
only to what has been loaded so far, rather than silently presenting a
partial page as a complete, correctly sorted set.

#### Scenario: A cursor triggers a load-more control

- **WHEN** `GET /instances?scope=mine&limit=200` returns a pagination cursor
- **THEN** the screen shows a "load more" control and a caveat that sorting
  applies only to the loaded rows

### Requirement: The inbox refetches on focus, on manual refresh, and after submission — never on a timer

The my-tasks screen SHALL refetch when the browser window regains focus, via
a visible refresh control, and after every successful task submission. It
SHALL NOT poll on a timer or subscription.

#### Scenario: Regaining window focus refetches the inbox

- **WHEN** the browser window regains focus while the my-tasks screen is open
- **THEN** the screen issues a fresh `GET /instances?scope=mine&limit=200`
  request

#### Scenario: No background polling occurs

- **WHEN** the my-tasks screen is open and the window keeps focus with no
  user action
- **THEN** no further inbox request is issued until focus changes, a manual
  refresh, or a submission occurs

### Requirement: Task screen opens read-only with an explicit Claim step

`GET /instances/:instanceId` SHALL render through `form-ui`, initially
read-only with a **Claim** button (`POST /instances/:id/claim`). The task
SHALL NOT be claimed merely by opening it — a user MUST be able to view
whether a task concerns them before claiming it. After a successful claim the
form SHALL become editable and its path buttons SHALL submit
(`POST /instances/:id/submit`).

#### Scenario: Opening a task does not claim it

- **WHEN** a user opens `/tasks/:instanceId` for an unclaimed task
- **THEN** the form renders read-only with a Claim button, and no claim
  request has been sent

#### Scenario: Claiming makes the form editable

- **WHEN** a user clicks Claim and the claim succeeds
- **THEN** the form becomes editable and its path buttons become active
  submit actions

### Requirement: Release is available at any time; submitting returns to the list

`POST /instances/:id/release` SHALL be available from the task screen at any
time a claim is held. A successful submission SHALL navigate back to the
my-tasks screen without requiring an explicit release first, since the
step changes as part of the submission.

#### Scenario: Release drops the claim without submitting

- **WHEN** a user who holds the claim clicks Release
- **THEN** the claim is released and the form returns to its read-only,
  unclaimed presentation

#### Scenario: A successful submission returns to the inbox

- **WHEN** a user submits an available path successfully
- **THEN** the app navigates back to `/` with no separate release step
  required

### Requirement: Start-a-process screen creates on selection

`/start` SHALL issue `GET /processes` and list every process with a
published version by its `label` and `baseLocale`. Selecting a process SHALL
immediately call `POST /processes/:id/instances` and navigate to the created
instance's task screen — the app SHALL NOT render the initial step's form
before an instance exists.

#### Scenario: Selecting a process creates an instance and navigates to it

- **WHEN** a user selects a process on the start screen
- **THEN** `POST /processes/:id/instances` is called and, on success, the app
  navigates to `/tasks/:instanceId` for the newly created instance

### Requirement: A case's starter may discard it

The task screen SHALL offer a "Discard case" control that calls
`POST /instances/:id/cancel`. This control SHALL be available to the actor who
started the instance, consistent with the engine now authorizing a case's own
starter to cancel it in addition to `system:cancel-any`.

#### Scenario: The starter discards their own case

- **WHEN** the actor who started an instance clicks "Discard case"
- **THEN** `POST /instances/:id/cancel` is called and succeeds

### Requirement: The app carries exactly one active locale, resolved with fallback

The app SHALL hold exactly one active locale and pass it to every
`LocalizedText` resolution and to `form-ui`. Process content SHALL resolve
against the active locale, falling back to the process's `baseLocale` when
the active locale has no entry. UI chrome strings SHALL be looked up from a
catalog shaped `locale → (key → text)`, shipping `de` and `en`. The initial
locale SHALL come from `navigator.language`; a header switcher SHALL change it
and persist the choice.

#### Scenario: Process content falls back to baseLocale

- **WHEN** a `LocalizedText` value has no entry for the active locale
- **THEN** it resolves using the process's `baseLocale` entry instead

#### Scenario: Initial locale comes from the browser

- **WHEN** the app loads with no previously persisted locale choice
- **THEN** the active locale is derived from `navigator.language`

#### Scenario: The locale switcher persists a choice

- **WHEN** a user changes locale via the header switcher
- **THEN** subsequent loads use that chosen locale rather than
  `navigator.language`

### Requirement: Typed engine errors map to a legible, distinct UI treatment

The app SHALL map each of the following conditions to the stated behavior,
rather than a generic failure message:

| Condition | Behaviour |
|---|---|
| `AlreadyClaimedError` | Refresh the row; the task leaves the inbox |
| `NotACandidateError` | Explain the task is not assigned to this user |
| `NotClaimantError` / `NotClaimedError` | Prompt to claim, or report the claim was lost |
| `SubmissionValidationError` | Attach each issue to its field via `form-ui` |
| Concurrent transition (OCC conflict) | Reload the view and report the task moved on |
| `401` | Return to `/login` |

#### Scenario: AlreadyClaimedError removes the task from view

- **WHEN** a claim attempt fails with `AlreadyClaimedError`
- **THEN** the task screen refreshes and the task no longer appears as
  claimable by the current user

#### Scenario: NotACandidateError explains the mismatch

- **WHEN** a claim attempt fails with `NotACandidateError`
- **THEN** the app displays that the task is not assigned to this user

#### Scenario: A lost claim is reported distinctly from a normal prompt-to-claim

- **WHEN** a submit attempt fails with `NotClaimantError` or
  `NotClaimedError`
- **THEN** the app either prompts the user to claim the task or reports that
  the claim was lost, distinct from the initial unclaimed state

#### Scenario: A concurrency conflict prompts a reload

- **WHEN** a submission fails due to a concurrent transition (OCC conflict)
- **THEN** the app reloads the instance view and reports that the task moved
  on
