# studio-app Specification

## Purpose

The developer's frontend, `packages/studio`: a workspace package mirroring
`packages/app`'s shape (React 18, Vite 6, own build/typecheck, a hand-written
History-API routing hook, `session.ts` for the JWT under its own storage
key), reusing the existing login mechanism, with a role-aware shell, a
process list merging published and draft state, and the panel editing
surface (originally carried over from `packages/editor`, now deleted, and
independent of it since) wired to the draft routes instead of
file persistence — reaching the engine exclusively through the HTTP wrapper
at runtime and through the package's `exports` map at compile time only. See
the `process-drafts` capability for the server-side store and routes this
frontend calls, and the `authorization` capability for the `system:developer`
role its shell checks (presentationally) and every studio route enforces
(authoritatively).

## Requirements

### Requirement: Studio is a workspace package that reaches the engine only through its two sanctioned boundaries

`packages/studio` SHALL be a Bun workspace package (React + Vite + TypeScript)
following the shape of `packages/app`. It SHALL reach the running system at
**runtime** exclusively through the HTTP wrapper — never the database, never an
engine module invoked in-process against live state — and it SHALL import from
the engine at **compile time** only through the package's `exports` map
(`workflow-engine/schema`, `/schema/compile`, `/cel/check`,
`/engine/registry-check`), which is what makes live validation a pure frontend
feature with no endpoint behind it.

Routing SHALL be a hand-written History-API hook following
`packages/app/src/routing.ts`, with no router dependency. This change SHALL NOT
modify `packages/app` or `packages/form-ui`.

#### Scenario: No direct data access

- **WHEN** `packages/studio/src` is inspected for imports
- **THEN** it imports no database client and no engine module by deep path,
  only the exports-map entry points and its own HTTP client

### Requirement: The shell routes to Tools and Player alongside the process list

Studio's shell SHALL offer navigation to `/tools` (see the `studio-tools`
capability) and to a per-process Player at `/processes/:processId/play` (see
the `studio-player` capability), reachable the same way the process list
already is — behind the shell's `system:developer` presentational check, with
every route it calls enforcing the role authoritatively.

#### Scenario: Tools is reachable from the shell

- **WHEN** an authenticated actor holding `system:developer` uses the shell's
  navigation
- **THEN** a link to `/tools` is present and renders the Tools screen

#### Scenario: Player is reachable from a process's edit context

- **WHEN** an authenticated actor holding `system:developer` opens a process
- **THEN** a link to that process's Player screen is present

### Requirement: Studio authenticates with the existing login and session mechanism

Studio SHALL authenticate against the existing `POST /auth/login`, hold the
JWT in `localStorage` under its own storage key, and send it as the bearer
credential on every request. Any `401` from any studio request SHALL discard
the stored session and return the user to `/login`, the same handling
`packages/app` implements. Studio SHALL NOT introduce a new authentication
mechanism, token format, or credential store.

#### Scenario: A successful login opens the shell

- **WHEN** valid credentials are submitted
- **THEN** the token and actor id are persisted and the process list is shown

#### Scenario: An expired session returns to login

- **WHEN** any studio request answers 401
- **THEN** the stored session is cleared and the login screen is shown

### Requirement: An authenticated actor without the developer role sees an explanatory empty state

The shell SHALL read the roles carried by the login response and, when
`system:developer` is absent, SHALL render an explanatory screen stating that
the account lacks studio access — never a redirect to `/login` (the
credentials are valid) and never a partially populated UI. This client-side
check is a UX affordance only; every studio route SHALL remain gated
server-side regardless.

#### Scenario: A participant account is told why studio is empty

- **WHEN** an actor holding no `system:developer` role logs in to studio
- **THEN** an explanatory empty state is shown, the login screen is not
  re-displayed, and no process or draft data is rendered

#### Scenario: The frontend check is not the control

- **WHEN** a draft route is called directly by a client that skipped the shell
  check
- **THEN** the server still answers 403

### Requirement: The process list shows draft and published state per process

The `/processes` screen SHALL list one row per process reachable to the
developer, combining `GET /processes` and `GET /drafts`. Each row SHALL show
whether a draft exists and, if so, who last saved it and when, and the latest
published version with its `definitionHash`. A process with a draft but no
published version and a process with published versions but no draft SHALL
both render correctly.

Actions SHALL be: create a new process, open a process for editing, and
discard its draft. Discarding SHALL require a confirmation and SHALL call
`DELETE /drafts/:processId`, leaving published versions untouched.

#### Scenario: A never-published process appears

- **WHEN** a draft exists for a process with no `definitions` rows
- **THEN** the row renders with its draft metadata and an empty published
  column

#### Scenario: A published process with no draft appears

- **WHEN** a process has published versions and no draft
- **THEN** the row renders the latest version and its hash, and offers
  creating a draft rather than opening one

#### Scenario: Discarding removes only the draft

- **WHEN** discard is confirmed for a process with published versions
- **THEN** the draft disappears from the list and the published version and
  hash still render

### Requirement: Creating a new process mints a prefixed id client-side

Creating a process SHALL mint a `proc_`-prefixed UUIDv4 id in the browser
through the same minting path the Draft model already uses for every other
entity kind — generate `${prefix}_${crypto.randomUUID()}` and parse it through
the contract's own branded id schema — and SHALL create the row with a
`PUT /drafts/:processId` at `revision = 0`. There SHALL be no separate
create-then-save round trip and no server-side id allocation.

#### Scenario: A new process is one round trip

- **WHEN** a new process is created
- **THEN** exactly one `PUT /drafts/:processId` is issued, with `revision` 0,
  and the process id carries the `proc_` prefix

### Requirement: Creating a draft for a published process starts from the latest published version

Creating a draft from the process list SHALL seed the draft body from the
process's latest published version. The studio SHALL read that body through
the published-version route before it writes the draft. It SHALL send the
result as the new draft's body, at `revision = 0`.

The published-version route returns the compiled body. A draft holds the
authored shape. The studio SHALL therefore strip the content the compile
pass injects before it writes the draft. That content is the reserved
cancel-sink step and, for a contracted process, the reserved cancel outcome
in `contract.outcomes`. The studio SHALL strip nothing else.

The write SHALL declare the version it seeded from as the draft's
`baseVersion`. The Versions screen compares the draft against it.

The seeded draft SHALL carry no stored layout. The canvas places steps that
have no recorded position, so a seeded process renders without one.

Creating a draft for a process with no published version SHALL write an
empty body. It SHALL declare no base version. Creating a new process SHALL
keep both of those.

When the read of the published version fails, the studio SHALL report the
error and SHALL NOT write a draft. An empty draft must not silently replace
the seeded one. The process list would then show a draft the author never
authored.

#### Scenario: A published process seeds its draft

- **WHEN** a draft is created for a process with a published version
- **THEN** the stored draft body equals that version's authored shape, and
  the draft carries `revision` 0 with `baseVersion` set to that version. The
  edit screen renders the process's steps

#### Scenario: The seeded body carries no compile-pass content

- **WHEN** a draft is seeded from a published version of a contracted process
- **THEN** the stored body carries no step with the reserved cancel-sink id
  or key, and `contract.outcomes` carries no reserved cancel outcome

#### Scenario: The seeded body passes the studio's own validation

- **WHEN** a seeded draft is loaded into the edit screen
- **THEN** live validation reports no error that the published version did
  not already carry

#### Scenario: A never-published process still starts empty

- **WHEN** a draft is created for a process with no published version
- **THEN** the stored draft body is empty, the draft carries no base version,
  and the edit screen renders no steps

#### Scenario: A new process still starts empty

- **WHEN** a new process is created from the process list
- **THEN** the stored draft body is empty, and no published-version read
  precedes the write

#### Scenario: A failed seed read writes no draft

- **WHEN** the published-version read fails while a draft is being created
- **THEN** the screen reports the error and no draft write follows. The
  process list still shows the process as having no draft

### Requirement: Editing is a canvas-primary surface with the carried-over panels as an inspector, loading and saving against the draft routes

The `/processes/:id/edit` screen SHALL carry over the editor's Draft model
(`draft/`), structural panels (`panels/` — steps, paths, timers, actions,
subprocess spec, view editor, field catalog, data sources, contract),
UI-chrome i18n and live validation, with file-based persistence replaced by
the draft routes: the draft is loaded with `GET /drafts/:processId` and
saved with `PUT /drafts/:processId`, carrying the revision that load
returned.

The screen's layout SHALL be canvas-primary: an interactive graph (see the
`studio-canvas` capability) occupies the main area, with the selected
element's panel rendered as a fixed-width inspector beside it, replacing the
previous stacked-panels-only column. Every panel's fields, validation, and
mutation behavior are unchanged by this — only where they are mounted.

Live validation SHALL remain exactly what it is today — the engine's own
publish-time chain run in the browser, reporting issues in place — and SHALL
NOT block saving, since a work-in-progress draft is expected to be invalid.

The screen SHALL offer a **Publish** action (see the `studio-publish`
capability) that calls `POST /drafts/:processId/publish` against the
currently persisted draft — not the in-browser edit state. When unsaved
local changes are present, the action SHALL prompt the user to save first
rather than publishing stale or ahead-of-server content. On success, the
screen SHALL confirm the new version number and `definitionHash`.

#### Scenario: A draft round-trips through the panels

- **WHEN** a draft is loaded, a step is added through the panels, and the
  draft is saved and reloaded
- **THEN** the new step is present and the panels render it identically

#### Scenario: A draft round-trips through the canvas

- **WHEN** a draft is loaded, a step is repositioned and connected to
  another step via the canvas, and the draft is saved and reloaded
- **THEN** the new position and path are present and the canvas renders them
  identically

#### Scenario: An invalid draft is still saveable

- **WHEN** live validation reports issues for the current draft
- **THEN** the issues are displayed and the save action remains available and
  succeeds

#### Scenario: Publishing with unsaved changes prompts a save first

- **WHEN** the developer clicks Publish while local edits have not been saved
- **THEN** the studio prompts to save before publishing and does not call
  `POST /drafts/:processId/publish` until the save completes

#### Scenario: A successful publish is confirmed on screen

- **WHEN** `POST /drafts/:processId/publish` succeeds
- **THEN** the screen displays the returned version number and
  `definitionHash`

### Requirement: A save conflict is surfaced and resolved by reloading, never merged

When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict.

Reloading SHALL leave the editor in a **clean** state: the body the toolbar
treats as "last known persisted" SHALL be advanced to the reloaded body, in
the same operation that replaces the draft, the layout and the revision. A
reload is by definition the point at which current and saved coincide — the
same invariant the initial seed and the post-save advance already encode.

Without this the unsaved-changes comparison is made against the discarded
local edits, so a draft byte-identical to the stored one reads as dirty for
the rest of the session (the toolbar is not remounted by a reload). Publishing
then always prompts to save first: accepting re-writes the just-fetched body
and bumps the stored revision for nothing, invalidating a concurrent editor's
in-flight revision, and declining aborts a publish the user was entitled to
make.

#### Scenario: A conflicting save is reported

- **WHEN** a save answers 409
- **THEN** a conflict message is shown with a reload action, and the local
  editing state is left intact until the user chooses

#### Scenario: Reloading adopts the stored draft

- **WHEN** the user reloads after a conflict
- **THEN** the stored body, layout and revision replace the local state and a
  subsequent save succeeds

#### Scenario: Publishing straight after a reload does not prompt to save

- **WHEN** the user reloads after a conflict and immediately publishes,
  without editing
- **THEN** the publish proceeds without the unsaved-changes prompt, because
  the draft is identical to the stored one

#### Scenario: Editing after a reload is dirty again

- **WHEN** the user reloads after a conflict and then makes an edit
- **THEN** the unsaved-changes prompt reappears on publish, so the fix does
  not turn the gate off

### Requirement: Studio's testable logic is extracted from its components

Following `packages/app/src/screens/inboxLogic.ts`, the logic worth testing
SHALL live in pure modules with `bun:test` coverage — at minimum the
process-list row derivation (merging the process listing with the draft
listing) and the save/conflict state machine. React components themselves are
not required to be tested.

#### Scenario: Row derivation is tested without a DOM

- **WHEN** the process-list derivation is given a process listing and a draft
  listing
- **THEN** it returns the merged rows, and the test needs no rendering
