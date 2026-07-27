# admin-app Specification

## Purpose

The operator-facing frontend, `packages/admin`: a workspace package mirroring
`packages/app`'s shape (React 18, Vite 6, own build/typecheck, a hand-written
History-API routing hook, `session.ts` for the JWT), reusing the existing
login mechanism, with a role-aware shell and the Operations screens
(all-instances list, instance detail with the merged record and cancel,
outbox with dead-letter retry/discard, pending timers) — reaching the engine
exclusively through the HTTP wrapper, never a direct database read or an
imported engine runtime module. It renders records and system state, never
step forms, so it does not depend on `form-ui`. See the `admin-operations-api`
capability for the server-side reads/routes this frontend calls, and the
`authorization` capability for the `system:admin` role its shell checks
(presentationally) and every `/admin/*` route enforces (authoritatively).

## Requirements

### Requirement: The admin area is its own workspace package

`packages/admin` SHALL be a Bun workspace package built with React 18, Vite 6
and TypeScript, with its own `package.json`, `vite.config.ts`, `tsconfig.json`
and `index.html`, matching the shape of `packages/app`. It SHALL depend on
`workflow-engine` at compile time only for the types it renders
(`InstanceRecordElement`, `ActionOutcome`, instance and outbox row shapes), and
SHALL NOT depend on `form-ui`, on `packages/app`, or on `packages/editor` — the
admin area renders records and system state, never step forms.

At runtime it SHALL reach the engine exclusively through the HTTP wrapper. It
SHALL NOT read the database directly and SHALL NOT import engine runtime
modules.

#### Scenario: The package builds and typechecks on its own

- **WHEN** `bun run typecheck` and `vite build` are run for `packages/admin`
- **THEN** both succeed without reaching into another package's sources

#### Scenario: No form renderer dependency

- **WHEN** `packages/admin/package.json` is inspected
- **THEN** `form-ui` is not among its dependencies

#### Scenario: No direct database access

- **WHEN** the package's sources are inspected for data access
- **THEN** every engine interaction goes through `fetch` against the HTTP
  wrapper

### Requirement: Login and session reuse the existing mechanism

The admin area SHALL authenticate through the existing `POST /auth/login`,
store the returned JWT in `localStorage`, send it as a bearer token on every
request, and return to the login screen on any 401 — identical to
`packages/app`. It SHALL NOT introduce a second login mechanism, a refresh
flow, or a separate token store.

Routing SHALL be a hand-written History-API hook adapted from
`packages/app/src/routing.ts`. No router dependency SHALL be added.

#### Scenario: A 401 returns to login

- **WHEN** any request from the admin area answers 401
- **THEN** the stored token is discarded and the login screen is shown

#### Scenario: No router dependency

- **WHEN** `packages/admin/package.json` is inspected
- **THEN** it lists no routing library

### Requirement: An actor without the admin role sees an explanatory empty state

After a successful login, the shell SHALL read the roles carried by the login
response and, when `system:admin` is absent, SHALL render a single explanatory
screen stating that the account lacks the operator role — not a partially
populated UI, and not a redirect back to login (the credential is valid).

This client-side check SHALL be presentational only; the server-side
`requireRole` on every `/admin/*` route remains the enforcement.

#### Scenario: A participant logs into the admin area

- **WHEN** an actor whose roles do not include `system:admin` logs in
- **THEN** the explanatory screen is shown and no operations screen is reachable

#### Scenario: An operator logs in

- **WHEN** an actor holding `system:admin` logs in
- **THEN** the operations screens are reachable

### Requirement: All instances are listable with filters and paging

The `/instances` screen SHALL list every instance via `GET /instances` with
`scope=all`, exposing the filters `InstanceListFilter` supports — process,
status, current step, `startedBy`, `claimedBy` — and cursor paging. It SHALL
NOT filter to the operator's own assignments; that is the participant app's
view.

Filter and paging state SHALL live in a pure module under `src/screens/` with
`bun:test` coverage, following `packages/app/src/screens/inboxLogic.ts`.
Components themselves are not required to be tested.

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

### Requirement: An instance's diagnostic view is the merged record

The `/instances/:id` screen SHALL show a header carrying process, version,
`definitionHash`, status, current step, `transitionSeq`, claim state and armed
timers, above a single chronological timeline built from
`GET /instances/:id/record`.

Both element kinds SHALL be rendered: a `transition` element with its cause,
path, resulting step and per-action `ActionOutcome`s, and an `event` element
with its `kind` and kind-specific payload. The diagnostic kinds SHALL be
legible as such — in particular `subprocess.outcome-unmatched`, `timer.unarmed`
and `instance.faulted`, which are what answers "why is this parked?".

The screen SHALL offer cancellation via the existing
`POST /instances/:id/cancel`. It SHALL NOT offer a forced transition or a
direct edit of instance `data`.

#### Scenario: A parked instance shows why

- **WHEN** an instance holds a `subprocess.outcome-unmatched` event
- **THEN** that event appears in the timeline with its payload

#### Scenario: Action outcomes are visible

- **WHEN** a transition enqueued actions
- **THEN** each action's outcome, including a `dead-letter` one, is shown with
  that transition

#### Scenario: No state-writing controls beyond cancel

- **WHEN** the instance screen is inspected for write actions
- **THEN** cancel is the only one

### Requirement: The outbox screen exposes the two repairs

The `/outbox` screen SHALL show the per-status counts and a filterable list of
rows carrying action type, instance, attempt count, last error and idempotency
key. On a `dead-letter` row it SHALL offer retry and discard, each calling the
corresponding `/admin/outbox/:key/*` route.

Retry SHALL be presented with a confirmation that states the side effect may
re-run, and that a handler honouring the idempotency key deduplicates it
downstream.

#### Scenario: Retrying from the list

- **WHEN** the operator retries a dead-lettered row
- **THEN** `POST /admin/outbox/:key/retry` is called and the row's status is
  shown as `pending` after the refresh

#### Scenario: Repairs are offered only on dead letters

- **WHEN** a `pending`, `claimed` or `delivered` row is displayed
- **THEN** neither retry nor discard is offered on it

### Requirement: The timers screen shows what is due

The `/timers` screen SHALL list pending timers from `GET /admin/timers`,
overdue first, showing instance, process, current step and fire time, with an
explicit indication of which entries are already overdue. Overdue
classification SHALL live in a tested pure module, not inline in the component.

#### Scenario: Overdue entries are marked

- **WHEN** a listed timer's fire time is in the past
- **THEN** it is rendered as overdue

### Requirement: Data is refreshed on demand, not pushed

Every screen SHALL offer an explicit refresh control and SHALL refetch when the
window regains focus. The admin area SHALL NOT poll on a timer, open a
websocket, or use server-sent events.

#### Scenario: Refocusing refetches

- **WHEN** the operator switches away from and back to the admin window
- **THEN** the current screen refetches its data

#### Scenario: No background polling

- **WHEN** the admin area is left open and untouched
- **THEN** no further requests are issued
