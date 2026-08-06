## ADDED Requirements

### Requirement: A browser check lands as an assertion or as a checklist entry

`CLAUDE.md` requires a real browser for any UI change. A change SHALL give
every browser check it writes one of two homes.

A check SHALL become a `bun:test` assertion when both conditions hold. This
repository already produced the defect the check catches, and the change names
the file and line that record it. And an assertion can observe the property
with no browser.

Every other check SHALL become an entry in `docs/browser-checks.md`. That
covers a browser vendor's own behavior, a pointer gesture, and a visual
judgment.

A change SHALL NOT leave a browser check unchecked in its own `tasks.md` at
archive time. The archive hides it. The checklist keeps it.

An assertion this rule produces SHALL NOT open a listening socket.
`CLAUDE.md` records why. A running HTTP server corrupts test runs. Three red
runs of twenty against zero of twenty. `test/http-static.test.ts` shows the
shape. It calls `createServer`'s handler with no port.

#### Scenario: A repeating check becomes an assertion

- **WHEN** a UI change writes a browser check for a defect this repository
  already produced
- **AND** a `bun:test` assertion can observe the same property
- **THEN** the change ships that assertion
- **AND** the change names the file and line recording the defect

#### Scenario: A check with no defect record stays manual

- **WHEN** a contributor proposes an assertion for a defect nobody has seen
  here
- **THEN** the check stays in `docs/browser-checks.md` instead

#### Scenario: An assertion opens no socket

- **WHEN** an assertion needs an HTTP response
- **THEN** it calls the server's handler directly, with no port
- **AND** `bun test` stays free of a second process driving the same database

#### Scenario: An unchecked browser task blocks the archive

- **WHEN** a change reaches archive with a browser task still unchecked
- **THEN** that task moves into `docs/browser-checks.md` first

### Requirement: The manual checklist states its address and its one conflict

`docs/browser-checks.md` SHALL open with the operating rules a manual run
needs.

It SHALL name `http://127.0.0.1:3001` as the address. Under Windows
`localhost` resolves to `::1` and the connection hangs.
`.devcontainer/docker-compose.override.yml` publishes `3001:3000`, and the
engine serves the bundle from `WEB_ROOT`.

It SHALL state that no `bun test` run may overlap a manual run. The dev
server's outbox poller claims rows the suite drives.

Each entry SHALL state what to open, what to do, and what a pass looks like.
Each entry SHALL name the change that first asked for it.

#### Scenario: A contributor opens an area

- **WHEN** a contributor follows the checklist
- **THEN** the file gives `http://127.0.0.1:3001`, not `localhost`

#### Scenario: A manual run and a test run do not overlap

- **WHEN** a dev server answers port 3001
- **THEN** the checklist forbids a `bun test` run until that server stops

#### Scenario: An entry keeps its origin

- **WHEN** a reader asks why an entry exists
- **THEN** the entry names the change that first asked for the check

### Requirement: An area's router ships match, round-trip and half-match coverage

`CLAUDE.md` names an `/admin/*` route collision as one of three defects that
shipped past a green suite. Every area router in `packages/web` SHALL carry
the coverage `admin-routing.test.ts` already has.

A change that adds or edits a route SHALL extend that coverage.

#### Scenario: A new route matches and round-trips

- **WHEN** an area gains a route
- **THEN** a test asserts that the path matches the route
- **AND** a test asserts that the route round-trips through its path builder

#### Scenario: A deeper path does not half-match

- **WHEN** a request path runs deeper than a declared route
- **THEN** a test asserts the router falls back rather than half-matching

#### Scenario: Two prefixes do not collide

- **WHEN** two routes share a leading segment
- **THEN** a test asserts each path reaches its own route
