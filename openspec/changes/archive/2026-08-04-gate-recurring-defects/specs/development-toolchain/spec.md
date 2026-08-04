<!-- antislop: allow-file passive-voice sentence-length -->
<!-- This delta copies a requirement from openspec/specs/development-toolchain/
     spec.md, which carries the same directive. A MODIFIED requirement must
     reproduce the whole block, so rewriting the copied prose here would make the
     delta disagree with the spec it edits. -->

## MODIFIED Requirements

### Requirement: Every push runs the toolchain's checks against a real database

The repository SHALL carry a `pre-push` hook, under a committed hooks
directory. It SHALL run the repo-wide typecheck, the full test suite, and the
mechanical gates `push-gate-checks` specifies, before a push leaves the machine.
Each clone enables it once, with `git config core.hooksPath .githooks`.

The hook SHALL run the checks **inside the devcontainer**, not on the host.
That placement is what makes the checks meaningful. The exception is the gates
that need only git and a shell, which run on the host before the container starts,
as `push-gate-checks` specifies.

Two properties come with it. `DATABASE_URL` is already set there, so the
DB-backed suites run instead of skipping. The Bun version is the one
`BUN_VERSION` pins in `.devcontainer/Dockerfile`, so a push cannot pass under
a different runtime than the project's.

The silent-skip hazard is why placement matters. The DB-backed suites are
`test.skipIf(!DB)` at hundreds of sites, most of the suite. A run without the
variable reports a pass count that omits most of what was written. It looks
identical to a genuine green. Placement alone no longer carries that guarantee
by itself: `push-gate-checks` adds a gate that reads the run's own skip count,
so the property is checked rather than assumed.

The hook SHALL run the preflight's `core` profile before the checks. That
profile is what refuses a push when the devcontainer is down, and it names the
command that starts it. The hook SHALL NOT fall back to the host. A gate that
quietly degrades to a weaker environment is the error this rule exists to
prevent.

The hook SHALL NOT run the preflight's `serve` profile. That profile restarts
the HTTP server, whose outbox poller claims rows the suite is driving. The
measurement stands at 3 red runs of 20 with a dev server up, and 0 of 20 with
none. A gate that starts a server would manufacture the failures it exists to
catch.

The typecheck SHALL be a step of its own. Bun does not typecheck, so a type
error passes `bun test` cleanly.

A gate that rejects a push SHALL block that push, on the same terms as a failing
typecheck or a failing suite. The hook has one bypass, `--no-verify`, and that
flag disables every check at once rather than the one a contributor means to skip.

The repository SHALL NOT carry a hosted-CI workflow for this purpose. The
owner does not want a hosted service executing this repository. A workflow
file that never runs reads as coverage it does not provide.

#### Scenario: A push runs typecheck and the full suite

- **WHEN** a push is attempted with the devcontainer up
- **THEN** the hook runs the repo-wide typecheck, then the full test suite,
  both in the container. The push proceeds only when both pass

#### Scenario: A push runs the mechanical gates

- **WHEN** a push is attempted with the devcontainer up
- **THEN** the hook also runs the gates `push-gate-checks` specifies, and the
  push proceeds only when every one of them passes

#### Scenario: A stopped devcontainer blocks the push

- **WHEN** a push is attempted while the devcontainer is not running
- **THEN** the preflight `core` profile fails, names the command that starts
  the devcontainer, and runs no check on the host

#### Scenario: The gate starts no HTTP server

- **WHEN** the hook runs its preflight step before the suite
- **THEN** no HTTP server runs during the suite, so the outbox poller claims
  none of the rows the suite drives

#### Scenario: A type error blocks the push

- **WHEN** a change introduces a type error that no test exercises
- **THEN** the typecheck step fails and the push does not proceed

#### Scenario: The database-backed suites run

- **WHEN** the hook runs the suite in the container
- **THEN** `DATABASE_URL` is set for that run, so the DB-backed suites execute
  rather than skipping
