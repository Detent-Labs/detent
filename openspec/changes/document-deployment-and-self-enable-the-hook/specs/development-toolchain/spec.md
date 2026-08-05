<!-- The MODIFIED block below copies the live development-toolchain
     requirement, apart from the paragraph and the two scenarios this change
     adds. That file carries the findings already, and a rewrite here would
     make the delta and its destination disagree. This directive dies with
     the change, at archive time. -->
<!-- antislop: allow-file passive-voice sentence-length run-ons -->

## MODIFIED Requirements

### Requirement: Every push runs the toolchain's checks against a real database

The repository SHALL carry a `pre-push` hook, under a committed hooks
directory. It SHALL run three things before a push leaves the machine. Those
are the repo-wide typecheck, the full test suite, and the mechanical gates
`push-gate-checks` specifies.

The repository SHALL enable that hook itself. A `prepare` script in the root
`package.json` SHALL point `core.hooksPath` at the committed hooks directory,
and `bun install` SHALL run it. No clone SHALL need a contributor to type
that configuration by hand. A clone where nobody typed it is a clone that
pushes with no gate, and reports nothing about it.

The script SHALL succeed where no git repository exists, and where `git` is
absent. The production image builds from a copied tree with no `.git`
directory, and its `bun install` must not fail on this.

The hook SHALL run the checks **inside the devcontainer**, not on the host.
That placement is what makes the checks meaningful. The gates that need only git
and a shell are the exception. They run on the host, before the container starts,
as `push-gate-checks` specifies.

Two properties come with it. `DATABASE_URL` is already set there, so the
DB-backed suites run instead of skipping. The Bun version is the one
`BUN_VERSION` pins in `.devcontainer/Dockerfile`, so a push cannot pass under
a different runtime than the project's.

The silent-skip hazard is why placement matters. The DB-backed suites are
`test.skipIf(!DB)` at hundreds of sites, most of the suite. A run without the
variable reports a pass count that omits most of what was written. It looks
identical to a genuine green. Placement alone no longer carries that guarantee.
`push-gate-checks` adds a gate that reads the run's own skip count. That gate
checks the property rather than assuming it.

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

A gate that rejects a push SHALL block that push. The terms are those of a
failing typecheck or a failing suite. The hook has one bypass, `--no-verify`.
That flag disables every check at once, not the one a contributor means to skip.

The repository SHALL NOT carry a hosted-CI workflow for this purpose. The
owner does not want a hosted service executing this repository. A workflow
file that never runs reads as coverage it does not provide.

#### Scenario: A fresh clone gains the gate from its first install

- **WHEN** a contributor clones the repository and runs `bun install`, and
  types no git configuration
- **THEN** `core.hooksPath` points at the committed hooks directory, and the
  next push runs the hook

#### Scenario: An install with no git repository still succeeds

- **WHEN** `bun install` runs against a copied tree that holds no `.git`
  directory, as the production image build does
- **THEN** the install succeeds, and the missing hooks configuration fails
  nothing

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
