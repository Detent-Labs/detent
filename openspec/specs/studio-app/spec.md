# studio-app Specification

## Purpose

The developer's frontend, `packages/studio`: a workspace package mirroring
`packages/app`'s shape (React 18, Vite 6, own build/typecheck, a hand-written
History-API routing hook, `session.ts` for the JWT under its own storage
key), reusing the existing login mechanism, with a role-aware shell, a
process list merging published and draft state, and the carried-over panel
editing surface from `packages/editor` wired to the draft routes instead of
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
modify `packages/editor`, `packages/app` or `packages/form-ui`.

#### Scenario: No direct data access

- **WHEN** `packages/studio/src` is inspected for imports
- **THEN** it imports no database client and no engine module by deep path,
  only the exports-map entry points and its own HTTP client

#### Scenario: The editor is untouched

- **WHEN** this change is applied
- **THEN** `packages/editor` still builds, typechecks and runs exactly as
  before

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

Publishing is NOT part of this screen in this change.

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

### Requirement: A save conflict is surfaced and resolved by reloading, never merged

When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict.

#### Scenario: A conflicting save is reported

- **WHEN** a save answers 409
- **THEN** a conflict message is shown with a reload action, and the local
  editing state is left intact until the user chooses

#### Scenario: Reloading adopts the stored draft

- **WHEN** the user reloads after a conflict
- **THEN** the stored body, layout and revision replace the local state and a
  subsequent save succeeds

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
