<!-- antislop: allow-file passive-voice sentence-length -->
<!-- Why: the MODIFIED block below copies "Routing is a hand-written
     History-API hook" from openspec/specs/end-user-app/spec.md, character for
     character, or the archive merge would lose the part it did not copy. That
     spec holds 42 findings of its own, and its own header carries an
     allow-file for the same reason. The sentences this change ADDS were
     linted on their own and report zero. -->

## ADDED Requirements

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

## MODIFIED Requirements

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

## RENAMED Requirements

- FROM: `### Requirement: Routing is a hand-written History-API hook covering four routes`
- TO: `### Requirement: Routing is a hand-written History-API hook covering five routes`
