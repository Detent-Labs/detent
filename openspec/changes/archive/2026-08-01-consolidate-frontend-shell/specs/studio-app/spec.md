<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: Studio is a workspace package that reaches the engine only through its two sanctioned boundaries

Studio SHALL live at `packages/web/src/areas/studio`, inside the one workspace
package that produces a browser bundle (see the `unified-shell` capability). It
SHALL reach the running system at **runtime** exclusively through the HTTP
wrapper — never the database, never an engine module invoked in-process against
live state — and it SHALL import from the engine at **compile time** only
through the package's `exports` map (`workflow-engine/schema`,
`/schema/compile`, `/cel/check`, `/engine/registry-check`), which is what makes
live validation a pure frontend feature with no endpoint behind it.

Routing within the area SHALL stay a pure matcher and path builder over paths
relative to the `/studio` prefix, driven by the shell's one History-API hook,
with no router dependency. Studio SHALL NOT import from another area's
directory, and SHALL NOT modify `packages/form-ui`.

#### Scenario: No direct data access

- **WHEN** `packages/web/src/areas/studio` is inspected for imports
- **THEN** it imports no database client and no engine module by deep path,
  only the exports-map entry points and its own HTTP client

#### Scenario: No cross-area import

- **WHEN** the studio area's sources are inspected
- **THEN** nothing under it imports from another area's directory

### Requirement: The shell routes to Tools and Player alongside the process list

The studio area SHALL offer navigation to `/studio/tools` (see the
`studio-tools` capability) and to a per-process Player at
`/studio/processes/:processId/play` (see the `studio-player` capability),
reachable the same way the process list already is — behind the shell's
`system:developer` presentational check, with every route it calls enforcing
the role authoritatively.

#### Scenario: Tools is reachable from the shell

- **WHEN** an authenticated actor holding `system:developer` uses the studio
  area's navigation
- **THEN** a link to `/studio/tools` is present and renders the Tools screen

#### Scenario: Player is reachable from a process's edit context

- **WHEN** an authenticated actor holding `system:developer` opens a process
- **THEN** a link to that process's Player screen is present

### Requirement: Studio authenticates with the existing login and session mechanism

Studio SHALL NOT authenticate at all. The shell owns the one login screen and
the one session under one storage key (see the `unified-shell` capability), and
the studio area sends that session's token as the bearer credential on every
request. Any `401` from any studio request SHALL discard the stored session and
return the user to `/login`, the same handling every other area gets. Studio
SHALL NOT introduce a new authentication mechanism, token format, or credential
store, and SHALL NOT hold a storage key of its own.

An actor already signed in elsewhere in the shell SHALL reach `/studio` with no
second sign-in.

#### Scenario: A successful login opens the shell

- **WHEN** an actor holding `system:developer` submits valid credentials
- **THEN** the session is persisted and the process list is reachable at
  `/studio`

#### Scenario: An expired session returns to login

- **WHEN** any studio request answers 401
- **THEN** the stored session is cleared and the login screen is shown

#### Scenario: No second sign-in

- **WHEN** an actor already signed in under another area navigates to `/studio`
- **THEN** no login screen appears

### Requirement: Studio's testable logic is extracted from its components

Following `packages/web/src/areas/app/screens/inboxLogic.ts`, the logic worth
testing SHALL live in pure modules with `bun:test` coverage — at minimum the
process-list row derivation (merging the process listing with the draft
listing) and the save/conflict state machine. React components themselves are
not required to be tested.

#### Scenario: Row derivation is tested without a DOM

- **WHEN** the process-list derivation is given a process listing and a draft
  listing
- **THEN** it returns the merged rows, and the test needs no rendering
