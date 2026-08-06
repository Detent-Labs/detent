## ADDED Requirements

### Requirement: The frontend's production bundle builds

The repository SHALL carry a root `build` script. That script SHALL build every
workspace package that ships a bundle. Today one package does, `packages/web`.

The root `check` command SHALL run that build. It SHALL run it after the
typecheck and before the suite. Cheapest first is the order the pre-push hook
already keeps across its three stages, and this holds to it.

The placement in `check` covers both paths at once. The hook runs `check` in
the devcontainer, so a push runs the build. A contributor runs the same command
by hand, so manual verification runs it too.

A build that stops SHALL stop the push, on the terms of a failing typecheck.

The build SHALL be the command that ships the frontend, rather than a detector
beside it. No script for this belongs under `scripts/gates/`. Those scripts hold
detectors this repository wrote, each because no off-the-shelf command covers
its class. Here one does, and it names the file, the line and the reason.

Nothing else in the repository bundles. `tsc` typechecks and emits no bundle.
`bun test` resolves modules by its own rules. So a construct the build target
lacks passes both of them.

On 2026-08-06 that gap let a frontend reach `main` that does not build.
`packages/web/src/main.tsx` carried a top-level `await`. Vite's default target
is `es2020` and `chrome87`, and neither one has it. The typecheck reported
green. The full suite reported green, all 2070 tests. All six push gates
reported green.

A build script SHALL NOT run for a package that ships source only. One such
package is `packages/form-ui`, and the workspace filter skips it.

#### Scenario: A push builds the frontend

- **WHEN** a contributor pushes with the devcontainer up
- **THEN** the hook runs the production build in the container, after the
  typecheck and before the suite

#### Scenario: A construct the target lacks blocks the push

- **WHEN** a change adds source the build target cannot carry, and the
  typecheck and the suite both report green
- **THEN** the build stops, and the push does not proceed

#### Scenario: Manual verification runs the same build

- **WHEN** a contributor runs `bun run check` by hand
- **THEN** that run builds the frontend, the same way the hook does

#### Scenario: A source-only package needs no build

- **WHEN** the root build script runs over the workspace
- **THEN** it builds `packages/web`, skips `packages/form-ui`, and reports
  success

## MODIFIED Requirements

### Requirement: Every push runs the toolchain's checks against a real database

The repository SHALL carry a `pre-push` hook, under a committed hooks
directory. It SHALL run four things before a push leaves the machine. Those
are the repo-wide typecheck, the production build, the full test suite, and the
mechanical gates `push-gate-checks` specifies.

The repository SHALL enable that hook itself. A `prepare` script in the root
`package.json` SHALL point `core.hooksPath` at the committed hooks directory,
and `bun install` SHALL run it. No clone SHALL need a contributor to type
that configuration by hand. A clone where nobody typed it is a clone that
pushes with no gate, and reports nothing about it.

The script SHALL succeed where no git repository exists, and where `git` is
absent. The production image builds from a copied tree with no `.git`
directory, and its `bun install` must not fail on this.

The script SHALL decide by asking `git` for the repository, not by testing the
filesystem for a `.git` directory. In a linked worktree `.git` is a file
holding a pointer, so a directory test answers false inside a real repository.
This repository works in such worktrees.

`core.hooksPath` SHALL point at the whole hooks directory, so it arms
`post-commit` beside `pre-push`. The script SHALL print what it wrote, so an
install that arms both says so.

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
variable reports a pass count that omits most of what the suite covers. It looks
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

The build SHALL be a step of its own too, for the matching reason. Neither the
typecheck nor the suite bundles anything, so a construct the build target lacks
passes both. The build requirement above records the measurement.

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

#### Scenario: An install inside a linked worktree arms the hook

- **WHEN** `bun install` runs in a linked worktree, where `.git` is a file
  rather than a directory
- **THEN** `core.hooksPath` points at the committed hooks directory

#### Scenario: An install with no git repository still succeeds

- **WHEN** `bun install` runs against a copied tree that holds no `.git`
  directory, as the production image build does
- **THEN** the install succeeds, and the missing hooks configuration fails
  nothing

#### Scenario: A push runs typecheck, the build and the full suite

- **WHEN** a contributor pushes with the devcontainer up
- **THEN** the hook runs the repo-wide typecheck, then the production build,
  then the full test suite. All three run in the container
- **AND** the push proceeds only when every one of them passes

#### Scenario: A push runs the mechanical gates

- **WHEN** a contributor pushes with the devcontainer up
- **THEN** the hook also runs the gates `push-gate-checks` specifies, and the
  push proceeds only when every one of them passes

#### Scenario: A stopped devcontainer blocks the push

- **WHEN** a contributor pushes while the devcontainer is not running
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
- **THEN** that run carries `DATABASE_URL`, so the DB-backed suites execute
  rather than skipping
