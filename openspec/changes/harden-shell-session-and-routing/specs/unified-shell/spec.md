## ADDED Requirements

### Requirement: A session change in another tab ends this tab's session

The shell SHALL watch the stored session for changes made by another tab. A tab that holds a session SHALL end it at once when the stored session disappears. It SHALL end it too when the stored session carries another token. A stored session with the same token SHALL change nothing.

The shell SHALL NOT write a session to storage that it held before such a change. Ending the session is client-side only and calls no API route.

#### Scenario: A logout in one tab signs the other tab out

- **GIVEN** two tabs signed in with the same session
- **WHEN** the actor logs out in tab A
- **THEN** tab B shows its login screen without any action in tab B
- **AND** tab B writes no session to storage afterwards

#### Scenario: A foreign login in one tab signs the other tab out

- **GIVEN** tab B holds the session of actor X
- **WHEN** a login in tab A stores the session of actor Y
- **THEN** tab B shows its login screen
- **AND** the stored session stays the one of actor Y, even after tab B changes its language

#### Scenario: A rewrite of the same token changes nothing

- **WHEN** another tab stores the same token with a hydrated `displayName` or `locale`
- **THEN** this tab keeps its session and its screen

#### Scenario: A signed-out tab ignores a stored session

- **GIVEN** a tab that shows its login screen
- **WHEN** another tab stores a session
- **THEN** the login screen stays as it is

### Requirement: The login screen names a session that another tab ended

When another tab ends the session, the login screen SHALL show the line "Your session ended in another tab." The line SHALL come from the shell catalog in every shipped locale. Screen readers SHALL announce it as a status. It SHALL disappear when the actor logs in.

A logout the actor chooses in this tab SHALL NOT show the line.

#### Scenario: The line shows after the other tab ended the session

- **WHEN** another tab ends this tab's session
- **THEN** the login screen shows "Your session ended in another tab."

#### Scenario: A chosen logout shows no line

- **WHEN** the actor logs out in this tab
- **THEN** the login screen shows no such line

#### Scenario: The line goes with the next login

- **GIVEN** a login screen showing the line
- **WHEN** the actor logs in
- **THEN** the shell shows the area, and a later logout in this tab shows no line

### Requirement: A malformed address resolves to the area's default route

An address whose area path holds a malformed percent escape, such as `%E0%A4%A`, SHALL NOT throw while the shell renders. The `studio`, `admin`, `app` and `reporting` routers SHALL resolve such a path to their default route, as for an unknown path. The default routes are the process list, the instances list, the inbox and the process picker.

#### Scenario: A malformed escape in a studio address

- **WHEN** the address is `/studio/processes/%E0%A4%A/edit`
- **THEN** the studio area shows the process list
- **AND** its error boundary shows no fallback

#### Scenario: A malformed escape in an admin, app or reporting address

- **WHEN** the address is `/admin/instances/%E0%A4%A`, `/app/tasks/%E0%A4%A` or `/reporting/reports/%E0%A4%A`
- **THEN** the area shows its default screen: the instances list, the inbox or the process picker

#### Scenario: A valid escape still decodes

- **WHEN** an address holds a valid escape such as `%20`
- **THEN** the router decodes it as before
