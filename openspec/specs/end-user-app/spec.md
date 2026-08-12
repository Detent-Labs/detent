<!-- antislop: allow-file passive-voice -->
# end-user-app

## Purpose

The participant-facing web application (the app area of `packages/web`) for the people who
*do the work* a process describes: log in, see the tasks assigned to them
across every process, fill in a step's form and submit it, and start a new
process. A separate product from the admin/developer area (out of scope
here). Four screens — Login, My tasks (inbox), Task, Start a process — over a
small hand-written History-API routing hook, talking to the engine only
through the HTTP wrapper. Step forms render through the shared `form-ui`
package, so what an author previews in the editor's Player is what a
participant gets. The Task screen also shows a comment thread and an
attachment list with an upload control. Out of scope for v1: case history
view, notifications, and a dedicated `groups` assignment filter (distinct
from `Step.assignment.candidates`, which already matches by an actor's id
or any of their roles — see `instance-query`).
## Requirements
### Requirement: Login screen authenticates against POST /auth/login

The shell, not the app area, SHALL provide the one login screen collecting
email and password and submitting them to `POST /auth/login` (see the
`unified-shell` capability). On success it SHALL persist the returned session
to `localStorage` and navigate to the area the actor's roles select, which for
an actor holding no reserved role is the app area's my-tasks screen (`/app`).
On failure it SHALL display a generic login failure and persist no token.

The app area SHALL NOT carry a login screen of its own.

#### Scenario: Successful login navigates to the inbox

- **WHEN** a participant submits valid credentials on the login screen
- **THEN** the returned session is persisted to `localStorage` and the browser
  navigates to `/app`

#### Scenario: Failed login persists no token

- **WHEN** a user submits credentials `POST /auth/login` rejects
- **THEN** the login screen displays a generic login failure and `localStorage`
  holds no token

### Requirement: Routing is a hand-written History-API hook covering five routes

The app area SHALL implement `/app`, `/app/tasks/:instanceId`, `/app/start`
and `/app/started`, with `/login` owned by the shell, through the shell's one
small hand-written History-API hook and with no routing library dependency.
Task URLs SHALL be directly shareable and bookmarkable.

The area's own matcher and path builder SHALL work in paths relative to the
`/app` prefix and SHALL NOT know the prefix themselves. The shell strips it on
the way in and prepends it on the way out.

#### Scenario: Navigating to a task URL directly loads that task

- **WHEN** a user loads `/app/tasks/:instanceId` directly (for example via a
  bookmarked or shared URL) with a valid session
- **THEN** the app area renders that instance's task screen without first
  passing through the inbox

#### Scenario: The area matcher never sees the prefix

- **WHEN** the browser is at `/app/tasks/inst_x`
- **THEN** the app area's matcher receives `/tasks/inst_x`, unchanged from what
  it matched before the consolidation

#### Scenario: No routing library is a dependency

- **WHEN** `packages/web/package.json` dependencies are inspected
- **THEN** no routing library (for example `react-router`) appears among them

#### Scenario: The started-cases URL is directly loadable

- **WHEN** a participant loads `/app/started` directly with a valid session
- **THEN** the app area renders the started-cases screen, without first passing
  through the inbox

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

### Requirement: Task screen opens with an explicit Claim step; submission (not field editing) is claim-gated

`GET /instances/:instanceId` SHALL render through `form-ui` with a **Claim**
button (`POST /instances/:id/claim`) when the task is unclaimed. The task
SHALL NOT be claimed merely by opening it — a user MUST be able to view
whether a task concerns them before claiming it. Field editability is
governed solely by `form-ui`'s own `readonly`/`required` handling of the
resolved view (see `form-ui`), independent of claim state — `TaskScreen.tsx`
passes no claim-derived disabled/readonly prop, so an unclaimed task's
non-readonly fields ARE typeable before claiming. What claim state actually
gates is submission: path-submit buttons only become active, sending
`POST /instances/:id/submit`, once the claim succeeds — `submitAndTransition`
itself requires the calling actor hold the claim on an assignment-bearing
step (`NotClaimedError`/`NotClaimantError`), so an unclaimed edit is
inert — typing does not persist anything until a submit the server would
accept.

The screen SHALL choose its claim controls from `assignment` on the loaded
instance view and the authenticated actor id. Five states cover every case:

| Assignment state | Claim controls |
|---|---|
| absent | none |
| present, unclaimed, actor is a candidate | Claim, enabled |
| present, unclaimed, actor is not a candidate | Claim, disabled, visible reason |
| present, claimed by another actor | Claim, disabled, visible reason |
| present, claimed by the actor | Release and Delegate-to |

The table applies to a running instance. The screen SHALL render no claim
control at all on an instance in any other status. Nothing forbids an
`assignment` on a terminal step, so a completed instance can still carry a
claim. Claim, release and delegate all refuse a non-running instance
(`InstanceNotRunningError`). Any control there would always fail.

The screen SHALL NOT display a claimant's actor id. The id identifies an
account, and it means nothing to a reader. The reason for a claimed task
therefore reports that another actor holds it, without naming them.

An absent `assignment` means the step declares none. Nothing exists to claim,
so the screen SHALL render no claim control at all. A disabled control would
state that the action exists, which is false.

That state is the one exception to the claim gate on submission stated above.
No claim exists to gate on. The screen SHALL therefore offer the path-submit
buttons directly, without a claim. `submitAndTransition` accepts a submission
there. It takes one from the instance starter or from a holder of
`system:admin`. Withholding the buttons would leave the task unfinishable
through the screen.

The screen SHALL name the reason in visible text whenever it disables Claim.
It SHALL NOT carry that reason in a `title` tooltip alone. A `disabled`
button suppresses pointer events. Touch devices have no hover. Assistive
technology skips disabled controls.

The screen's own candidate test governs presentation only. `claimStep` stays
the enforcement point, because a caller reaches
`POST /instances/:id/claim` without this screen.

The screen SHALL derive claim presentation from the loaded view on every
mount. It SHALL NOT seed that state to "unclaimed". A user who claims a task,
leaves the screen and returns therefore sees the claim they hold.

#### Scenario: Opening a task does not claim it

- **WHEN** a user opens `/tasks/:instanceId` for an unclaimed task
- **THEN** the form renders with a Claim button, and no claim request has
  been sent

#### Scenario: An unclaimed task's fields are visible and typeable, but not submittable

- **WHEN** a user opens `/tasks/:instanceId` for an unclaimed,
  assignment-bearing task and edits a non-readonly field
- **THEN** the input accepts the edit, but no path-submit action is
  available until the task is claimed

#### Scenario: Claiming enables submission

- **WHEN** a user clicks Claim and the claim succeeds
- **THEN** the form's path buttons become active submit actions

#### Scenario: A step with no assignment offers no claim control

- **WHEN** a user opens a task whose current step declares no `assignment`
- **THEN** the screen renders neither an enabled nor a disabled Claim
  control, and no `POST /instances/:id/claim` can originate from it

#### Scenario: A step with no assignment is submittable without a claim

- **WHEN** the instance starter opens a task whose current step declares no
  `assignment` and whose `availablePaths` is not empty
- **THEN** the screen renders the path-submit buttons as active actions,
  with no claim first

#### Scenario: A non-candidate sees why Claim is unavailable

- **WHEN** the instance starter opens an unclaimed, assignment-bearing task
  and is not a candidate on it
- **THEN** the screen renders Claim as disabled, next to visible text saying
  the task waits for another group
- **AND** that text names neither an actor nor a role

#### Scenario: A task another actor holds reports the claim without an id

- **WHEN** a user opens an assignment-bearing task that another actor has
  claimed
- **THEN** the screen renders Claim as disabled, next to visible text
  reporting that another actor holds it
- **AND** that text contains no actor id

#### Scenario: A non-running instance offers no claim control

- **WHEN** a user opens a completed or cancelled instance whose current step
  declares an `assignment` that still names a claimant
- **THEN** the screen renders no Claim, no Release and no Delegate-to control

#### Scenario: The reason survives without a pointer

- **WHEN** the screen disables Claim for any reason
- **THEN** the reason reads from the rendered text alone, with no hover and
  no pointer event

#### Scenario: Returning to a held task shows the claim

- **WHEN** a user claims a task, navigates to another screen, and reopens the
  same task
- **THEN** the screen renders Release and Delegate-to, and renders no Claim
  control

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

### Requirement: Claimed tasks offer a Delegate-to action

The task screen SHALL offer a "Delegate to" control whenever the current
user holds the claim. It is a text input for a target actor id, plus a
submit action calling `POST /instances/:id/delegate`. On success the
form returns to its claimed presentation, with the new claimant
reflected. The current user can no longer submit or release the task,
once delegated away.

#### Scenario: The claimant delegates to another actor

- **WHEN** a user who holds the claim enters a target actor id and submits
  the Delegate-to control
- **THEN** `POST /instances/:id/delegate` is called and, on success, the
  claim moves to the named actor

#### Scenario: A delegated-away task no longer belongs to the delegator

- **WHEN** a user who just delegated their claim away re-opens the same
  task
- **THEN** the form reflects an unclaimed-by-them state, with no Release
  or path-submit action available to them

#### Scenario: The Delegate-to control is unavailable before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task
- **THEN** no Delegate-to control is shown until the task is claimed

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

The shell SHALL hold exactly one active locale and pass it to every
`LocalizedText` resolution and to `form-ui`. Locale selection and persistence
SHALL live in `packages/web/src/i18n/`, shared by every area; the chrome string
catalogs SHALL stay per area. Process content SHALL resolve against the active
locale, falling back to the process's `baseLocale` when the active locale has
no entry. UI chrome strings SHALL be looked up from a catalog shaped `locale →
(key → text)`, shipping `de` and `en`. The initial locale SHALL come from
`navigator.language`; a header switcher SHALL change it and persist the choice.

Switching locale SHALL apply across areas, not per area.

#### Scenario: Process content falls back to baseLocale

- **WHEN** a `LocalizedText` value has no entry for the active locale
- **THEN** it resolves using the process's `baseLocale` entry instead

#### Scenario: Initial locale comes from the browser

- **WHEN** the shell loads with no previously persisted locale choice
- **THEN** the active locale is derived from `navigator.language`

#### Scenario: The locale switcher persists a choice

- **WHEN** a user changes locale via the header switcher
- **THEN** subsequent loads use that chosen locale rather than
  `navigator.language`

#### Scenario: One locale choice spans the areas

- **WHEN** a user changes locale under `/app` and then navigates to `/studio`
- **THEN** the chosen locale is already active there

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

### Requirement: Task screen shows a comment thread with a post form

The task screen SHALL show a comment thread beside the field form,
fetched via `GET /instances/:id/comments`, listing each comment's
`actorId` and `createdAt`, oldest first. It SHALL provide a text box and a
submit button that calls `POST /instances/:id/comments` and, on success,
refetches the thread. This thread SHALL be visible to any actor who can
open the task screen at all, independent of claim state.

#### Scenario: Opening a task loads its comment thread

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/comments` and renders the
  returned comments oldest first

#### Scenario: Posting a comment refreshes the thread

- **WHEN** a user submits non-empty text in the comment box
- **THEN** `POST /instances/:id/comments` is called and, on success, the
  thread refetches and shows the new comment

#### Scenario: The comment thread is visible before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task they are an
  eligible candidate for
- **THEN** the comment thread renders and accepts a new comment, with no
  claim required first

### Requirement: Task screen shows attachments with an upload control

The task screen SHALL show an upload control beside the field form: a
file picker and a submit button. The button SHALL call `POST
/instances/:id/attachments` with the chosen file's name, MIME type, and
base64-encoded bytes. On success it SHALL refetch the attachment list.

The task screen SHALL also show a list of the instance's attachments,
fetched via `GET /instances/:id/attachments`, each with a download
action. This list SHALL be visible to any actor who can open the task
screen at all, independent of claim state.

#### Scenario: Opening a task loads its attachment list

- **WHEN** a user opens `/tasks/:instanceId` for a task they may view
- **THEN** the screen issues `GET /instances/:id/attachments` and renders
  the returned list

#### Scenario: Uploading a file refreshes the list

- **WHEN** a user picks a file and submits the upload control
- **THEN** `POST /instances/:id/attachments` is called and, on success,
  the list refetches and shows the new attachment

#### Scenario: Downloading an attachment saves the file

- **WHEN** a user selects an attachment's download action
- **THEN** the screen fetches `GET
  /instances/:id/attachments/:attachmentId` with the user's auth header.
  It then triggers the browser's save dialog for the returned bytes.

#### Scenario: The attachment list is visible before claiming

- **WHEN** a user opens an unclaimed, assignment-bearing task they are an
  eligible candidate for
- **THEN** the attachment list and upload control show, with no claim
  required first

### Requirement: A started-cases screen lists what the participant started

The app area SHALL carry a `/app/started` route and the screen behind it. The
screen SHALL list the instances the signed-in participant started, through
`GET /instances?scope=started`. It SHALL send no `startedBy` of its own.

The list SHALL carry every status, newest first, and SHALL name each row's
status. A participant asks this screen what became of a case they raised, and
a finished case is the common answer.

Each row's identifying content SHALL be a control that opens
`/app/tasks/:instanceId`, the screen that already exists. The row itself SHALL
carry no click handler.

The nav SHALL offer the screen beside My tasks and Start a process. Its
wording SHALL come from the app catalog, in every locale that catalog ships.

#### Scenario: The screen lists a case the participant started

- **WHEN** a participant who started an instance opens `/app/started`
- **THEN** the list carries that instance

#### Scenario: The screen carries a case assigned to somebody else

- **WHEN** a participant started an instance whose current step names another
  actor as its only candidate
- **AND** that participant opens `/app/started`
- **THEN** the list carries that instance, which their inbox does not

#### Scenario: The screen carries a finished case

- **WHEN** a participant started an instance that has since completed
- **AND** that participant opens `/app/started`
- **THEN** the list carries it, and names its status

#### Scenario: A row opens the task screen

- **WHEN** a participant activates a row's control
- **THEN** the browser goes to `/app/tasks/:instanceId` for that instance

#### Scenario: An empty result is stated in words

- **WHEN** a participant who has started nothing opens `/app/started`
- **THEN** the screen says so in words, rather than showing an empty table

#### Scenario: A failed load reads as a failure

- **WHEN** the listing request fails
- **THEN** the screen states the failure where the list would sit, and does
  not show an empty result instead
