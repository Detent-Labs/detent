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

It SHALL name `127.0.0.1`, not `localhost`, as the address: under Windows
`localhost` resolves to `::1` and the connection hangs. The port itself is a
per-machine choice. Git ignores `.devcontainer/docker-compose.override.yml`,
so no number in this file binds every contributor. The checklist SHALL give
the two-line snippet that publishes one, with `3001:3000` as the suggested
mapping. It SHALL also state that the engine serves the bundle from
`WEB_ROOT`.

It SHALL state that a contributor must build the frontend bundle first. The
engine serves `packages/web/dist`, a build output the repository does not
track. It answers every navigation with a JSON 404 when that directory is
absent.

It SHALL state that no `bun test` run may overlap a manual run. The dev
server's outbox poller claims rows the suite drives.

Each entry SHALL state what to open, what to do, and what a pass looks like.
Each entry SHALL name the change that first asked for it.

#### Scenario: A contributor opens an area

- **WHEN** a contributor follows the checklist
- **THEN** the file gives `127.0.0.1`, not `localhost`, and the snippet that
  publishes the contributor's own port

#### Scenario: A manual run needs a build

- **WHEN** a contributor has not run the frontend build
- **THEN** the checklist says to build it first, and names why: the engine
  serves `packages/web/dist`

#### Scenario: A manual run and a test run do not overlap

- **WHEN** a dev server answers the published port
- **THEN** the checklist forbids a `bun test` run until that server stops

#### Scenario: An entry keeps its origin

- **WHEN** a reader asks why an entry exists
- **THEN** the entry names the change that first asked for the check
