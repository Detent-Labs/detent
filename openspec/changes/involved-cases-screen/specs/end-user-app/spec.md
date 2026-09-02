<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## MODIFIED Requirements

### Requirement: Routing is a hand-written History-API hook covering five routes

The app area SHALL implement `/app`, `/app/tasks/:instanceId`, `/app/start`,
`/app/started` and `/app/involved`, with `/login` owned by the shell. It SHALL
do so through the shell's one small hand-written History-API hook, with no
routing library dependency.
Task URLs SHALL be directly shareable and bookmarkable.

The area's own matcher and path builder SHALL work in paths relative to the
`/app` prefix. They SHALL NOT know the prefix themselves. The shell strips it on
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

#### Scenario: The took-part URL is directly loadable

- **WHEN** a participant loads `/app/involved` directly with a valid session
- **THEN** the app area renders the took-part screen, without first passing
  through the inbox


## ADDED Requirements

### Requirement: A took-part screen lists the cases a participant reached

The app area SHALL carry an `/app/involved` route and the screen behind it.
The screen SHALL list the instances the signed-in participant may see, through
`GET /instances?scope=visible`. It SHALL send no actor id of its own. The
`instance-visibility-set` capability owns which instances that scope returns.

The screen answers a question the other three do not. My tasks names what
awaits this participant now. Cases I started names what they raised. This one
names every case they reached. That covers a case they raised, one they held,
and one they were only ever a candidate on.

The list SHALL carry every status, newest first, and SHALL name each row's
status. A case a participant took part in is commonly finished by the time
they look for it.

The screen SHALL show a row the way the started-cases screen shows one.
Same identifying control, same status stamp and tone, same date. It SHALL
reuse that screen's view model rather than carry a second one. A participant
who learned one list has learned the other.

Each row's identifying content SHALL be a control that opens
`/app/tasks/:instanceId`. The row itself SHALL carry no click handler.

The nav SHALL offer the screen beside My tasks, Start a process and Cases I
started. Its wording SHALL come from the app catalog, in every locale that
catalog ships.

#### Scenario: The listing request carries scope=visible and no actor id

- **WHEN** the screen loads
- **THEN** it issues `GET /instances?scope=visible` with no `assignedTo` and
  no `startedBy` parameter

#### Scenario: A former candidate finds a finished case

- **WHEN** a participant was a candidate on a step an instance has since left
- **AND** that instance has since completed
- **THEN** the screen lists it and names its status

#### Scenario: A case the inbox dropped stays on this screen

- **WHEN** an instance the participant took part in has moved to a step that
  assigns somebody else
- **THEN** My tasks does not carry it and this screen does

#### Scenario: A case the participant never reached is absent

- **WHEN** an instance names no principal the participant matches
- **THEN** the screen does not list it

#### Scenario: A revoked case is absent

- **WHEN** an administrator has revoked the participant from an instance
- **AND** that participant holds no claim and no candidacy on its current step
- **THEN** the screen does not list it

#### Scenario: A row opens the task screen

- **WHEN** a participant activates a row's control
- **THEN** the browser goes to `/app/tasks/:instanceId` for that instance

#### Scenario: An empty result is stated in words

- **WHEN** a participant who has reached nothing opens the screen
- **THEN** the screen says so in words, rather than showing an empty table

#### Scenario: A failed load reads as a failure

- **WHEN** the listing request fails
- **THEN** the screen states the failure where the list would sit, and does
  not show an empty result instead
