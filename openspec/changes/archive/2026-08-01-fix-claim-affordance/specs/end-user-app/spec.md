## MODIFIED Requirements

### Requirement: Task screen opens with an explicit Claim step; submission (not field editing) is claim-gated

<!-- Copied verbatim from openspec/specs/end-user-app/spec.md so the MODIFIED
     header and body match at archive time. -->
<!-- antislop: allow em-dash sentence-length passive-voice synonym-rotation filler -->
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

<!-- antislop: allow passive-voice -->
- **WHEN** a user opens `/tasks/:instanceId` for an unclaimed task
- **THEN** the form renders with a Claim button, and no claim request has
  been sent

#### Scenario: An unclaimed task's fields are visible and typeable, but not submittable

<!-- antislop: allow passive-voice -->
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
