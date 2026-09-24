# Spec Delta

## REMOVED Requirements

### Requirement: A browser check lands as an assertion or as a checklist entry

**Reason**: A browser check now has three homes. The old heading names
two, and a MODIFIED delta cannot rename a requirement.

**Migration**: "A browser check lands in one of three homes" below replaces
it. It keeps every rule and scenario of this requirement, and adds the smoke
suite as the third home.

## ADDED Requirements

### Requirement: A browser check lands in one of three homes

`CLAUDE.md` requires a real browser for any UI change. A change SHALL give
every browser check it writes one of three homes.

A check SHALL become a `bun:test` assertion when both conditions hold. This
repository already produced the defect the check catches, and the change names
the file and line that record it. And an assertion can observe the property
with no browser.

A check SHALL become a flow in the smoke suite when three conditions hold.
This repository already produced the defect the check catches, and the change
names the file and line that record it. No `bun:test` assertion can observe the
property. And the flow can observe it without a visual judgment.
That covers rendering, focus, dialog stacking, and UI state after a mutation.

Every other check SHALL become an entry in `docs/browser-checks.md`. That
covers a browser vendor's own behavior, a pointer gesture, and a visual
judgment.

A change that moves a check into the smoke suite SHALL remove the matching
entry from `docs/browser-checks.md`. When the suite covers only part of an
entry, the change SHALL remove only the covered steps.

A change SHALL NOT leave a browser check unchecked in its own `tasks.md` at
archive time. The archive hides it. The checklist keeps it.

An assertion this rule produces SHALL NOT open a listening socket.
`CLAUDE.md` records why. A running HTTP server corrupts test runs. Three red
runs of twenty against zero of twenty. `test/http-static.test.ts` shows the
shape. It calls `createServer`'s handler with no port. The smoke suite opens a
socket, so it runs outside `bun test` and against its own database.

#### Scenario: A repeating check becomes an assertion

- **WHEN** a UI change writes a browser check for a defect this repository
  already produced
- **AND** a `bun:test` assertion can observe the same property
- **THEN** the change ships that assertion
- **AND** the change names the file and line recording the defect

#### Scenario: A repeating check that needs a page becomes a smoke flow

- **WHEN** a UI change writes a browser check for a defect this repository
  already produced
- **AND** only a real page can observe the property
- **AND** the check does not need a visual judgment
- **THEN** the change adds a flow to the smoke suite
- **AND** the change names the file and line recording the defect

#### Scenario: A covered entry leaves the checklist

- **WHEN** a change adds a smoke flow that covers a `docs/browser-checks.md`
  entry
- **THEN** the change removes that entry, or its covered steps, from the
  checklist

#### Scenario: A check with no defect record stays manual

- **WHEN** a contributor proposes an assertion or a smoke flow for a defect
  nobody has seen here
- **THEN** the check stays in `docs/browser-checks.md` instead

#### Scenario: An assertion opens no socket

- **WHEN** an assertion needs an HTTP response
- **THEN** it calls the server's handler directly, with no port
- **AND** `bun test` stays free of a second process driving the same database

#### Scenario: An unchecked browser task blocks the archive

- **WHEN** a change reaches archive with a browser task still unchecked
- **THEN** that task moves into `docs/browser-checks.md` first
