<!-- antislop: allow-file passive-voice -->
<!-- WHEN/THEN scenarios name a condition, not an actor. Every spec under
     openspec/specs/ carries the same passive phrasing. -->

## MODIFIED Requirements

### Requirement: Every push runs the toolchain's checks against a real database

The repository SHALL carry a `pre-push` hook, under a committed hooks
directory. It SHALL run the repo-wide typecheck and the full test suite before
a push leaves the machine. Each clone enables it once, with
`git config core.hooksPath .githooks`.

The hook SHALL run the checks **inside the devcontainer**, not on the host.
That placement is what makes the checks meaningful.

Two properties come with it. `DATABASE_URL` is already set there, so the
DB-backed suites run instead of skipping. The Bun version is the one
`BUN_VERSION` pins in `.devcontainer/Dockerfile`, so a push cannot pass under
a different runtime than the project's.

The silent-skip hazard is why placement matters. The DB-backed suites are
`test.skipIf(!DB)` at hundreds of sites, most of the suite. A run without the
variable reports a pass count that omits most of what was written. It looks
identical to a genuine green.

The hook SHALL refuse to run when the devcontainer is down. It SHALL say how
to start it. It SHALL NOT fall back to the host. A gate that quietly degrades
to a weaker environment is the error this rule exists to prevent.

The typecheck SHALL be a step of its own. Bun does not typecheck, so a type
error passes `bun test` cleanly.

The repository SHALL NOT carry a hosted-CI workflow for this purpose. The
owner does not want a hosted service executing this repository. A workflow
file that never runs reads as coverage it does not provide.

#### Scenario: A push runs typecheck and the full suite

- **WHEN** a push is attempted with the devcontainer up
- **THEN** the hook runs the repo-wide typecheck, then the full test suite,
  both in the container. The push proceeds only when both pass

#### Scenario: A stopped devcontainer blocks the push

- **WHEN** a push is attempted while the devcontainer is not running
- **THEN** the hook fails with a message naming the command that starts it,
  and runs no checks on the host

#### Scenario: A type error blocks the push

- **WHEN** a change introduces a type error that no test exercises
- **THEN** the typecheck step fails and the push does not proceed

#### Scenario: The database-backed suites run

- **WHEN** the hook runs the suite in the container
- **THEN** `DATABASE_URL` is set for that run, so the DB-backed suites execute
  rather than skipping
