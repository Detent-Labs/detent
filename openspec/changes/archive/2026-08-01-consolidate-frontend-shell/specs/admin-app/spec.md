<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: The admin area is its own workspace package

The admin area SHALL live at `packages/web/src/areas/admin`, inside the one
workspace package that produces a browser bundle (see the `unified-shell`
capability). It SHALL NOT carry its own `package.json`, `vite.config.ts`,
`tsconfig.json` or `index.html`: `packages/web` carries one of each for every
area.

It SHALL depend on `workflow-engine` at compile time only for the types it
renders (`InstanceRecordElement`, `ActionOutcome`, instance and outbox row
shapes). It SHALL NOT import `form-ui`, and SHALL NOT import from another
area's directory — the admin area renders records and system state, never step
forms.

At runtime it SHALL reach the engine exclusively through the HTTP wrapper. It
SHALL NOT read the database directly and SHALL NOT import engine runtime
modules.

#### Scenario: The package builds and typechecks on its own

- **WHEN** `bun run typecheck` and `vite build` are run for `packages/web`
- **THEN** both succeed, and the admin area needs no build of its own

#### Scenario: No form renderer dependency

- **WHEN** the admin area's sources are inspected
- **THEN** nothing under it imports `form-ui`

#### Scenario: No cross-area import

- **WHEN** the admin area's sources are inspected
- **THEN** nothing under it imports from another area's directory

#### Scenario: No direct database access

- **WHEN** the area's sources are inspected for data access
- **THEN** every engine interaction goes through `fetch` against the HTTP
  wrapper

### Requirement: Login and session reuse the existing mechanism

The admin area SHALL NOT authenticate at all. The shell owns the one login
screen and the one session (see the `unified-shell` capability): the area
receives the bearer token, sends it on every request, and reports a 401 upward
so the shell discards the session and shows the login screen.

There SHALL be no second login mechanism, no refresh flow, and no separate
token store. Reaching the admin area SHALL need no second sign-in for an actor
already signed in elsewhere in the shell.

Routing within the area SHALL stay a pure matcher and path builder over paths
relative to the `/admin` prefix, driven by the shell's one History-API hook. No
router dependency SHALL be added.

#### Scenario: A 401 returns to login

- **WHEN** any request from the admin area answers 401
- **THEN** the stored session is discarded and the login screen is shown

#### Scenario: No second sign-in

- **WHEN** an actor holding `system:admin` signs in and navigates to `/admin`
  from another area
- **THEN** no login screen appears

#### Scenario: No router dependency

- **WHEN** `packages/web/package.json` is inspected
- **THEN** it lists no routing library

### Requirement: All instances are listable with filters and paging

The `/admin/instances` screen SHALL list every instance via `GET /instances`
with `scope=all`, exposing the filters `InstanceListFilter` supports — process,
status, current step, `startedBy`, `claimedBy` — and cursor paging. It SHALL
NOT filter to the operator's own assignments; that is the participant app's
view.

Filter and paging state SHALL live in a pure module under the area's
`screens/` directory with `bun:test` coverage, following
`packages/web/src/areas/app/screens/inboxLogic.ts`. Components themselves are
not required to be tested.

#### Scenario: Listing every instance

- **WHEN** the operator opens the instances screen
- **THEN** instances started by other actors are listed

#### Scenario: Narrowing by status

- **WHEN** the operator selects a status filter
- **THEN** the request carries the corresponding `status` parameter and the
  list narrows

#### Scenario: Paging forward

- **WHEN** more instances match than the page limit
- **THEN** a next-page control requests the same route with the returned cursor
