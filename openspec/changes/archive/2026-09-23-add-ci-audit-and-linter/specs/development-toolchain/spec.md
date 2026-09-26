# Spec Delta

## MODIFIED Requirements

### Requirement: Every push runs the toolchain's checks against a real database

The repository SHALL carry a `pre-push` hook, under a committed hooks
directory. It SHALL run five things before a push leaves the machine. Those
are the linter, the repo-wide typecheck, the production build, the full test
suite, and the mechanical gates `push-gate-checks` specifies.

The repository SHALL enable that hook itself. A `prepare` script in the root
`package.json` SHALL point `core.hooksPath` at the committed hooks directory,
and `bun install` SHALL run it. No clone SHALL need a contributor to type
that configuration by hand. A clone where nobody typed it is a clone that
pushes with no gate, and reports nothing about it.

The script SHALL succeed where no git repository exists, and where `git` is
absent. The production image builds from a copied tree with no `.git`
directory, and its `bun install` must not fail on this.

The script SHALL ask `git` for the repository. It SHALL NOT test the
filesystem for a `.git` directory. In a linked worktree `.git` is a file
holding a pointer, so a directory test answers false inside a real repository.
This repository works in such worktrees.

`core.hooksPath` SHALL point at the whole hooks directory, so it arms
`post-commit` beside `pre-push`. The script SHALL print what it wrote, so an
install that arms both says so.

The hook SHALL run the checks **inside the devcontainer**. It SHALL NOT run them on the host.
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
That flag disables every check at once. A contributor cannot skip one check alone.

The repository SHALL carry one hosted-CI workflow, on GitHub-hosted runners.
It SHALL run the same checks and gates the hook runs, on every push and
every pull request. CI SHALL NOT replace the hook. The hook stops an error
before it leaves the machine, and CI catches a push that bypassed the hook.

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

- **WHEN** `bun install` runs against a copied tree that has no `.git`
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

#### Scenario: A lint finding blocks the push

- **WHEN** a change adds code the linter flags, or a disable directive that
  suppresses nothing
- **THEN** the lint step fails and the push does not proceed

#### Scenario: CI runs the hook's checks

- **WHEN** a commit reaches GitHub through a push or a pull request
- **THEN** the hosted workflow runs the linter, the typecheck, the build, the
  full suite with `DATABASE_URL` set, and the mechanical gates
- **AND** a gate whose tool the runner lacks prints a named skip, as the prose
  gate does

#### Scenario: A type error blocks the push

- **WHEN** a change introduces a type error that no test exercises
- **THEN** the typecheck step fails and the push does not proceed

#### Scenario: The database-backed suites run

- **WHEN** the hook runs the suite in the container
- **THEN** that run carries `DATABASE_URL`, so the DB-backed suites execute
  rather than skipping

## ADDED Requirements

### Requirement: A linter checks the code and its suppressions

The root `package.json` SHALL carry a `lint` script. It SHALL lint the
engine, both frontend packages, the tests and the scripts. Any finding SHALL
fail it, a warning included.

The linter SHALL report a disable directive that suppresses nothing, and that
report SHALL fail the script too. A directive for a tool that never runs
tells the reader a check exists where none does.

`bun run check` SHALL run `lint` before the typecheck. The linter needs no
build and no database, so it fails fastest.

The linter SHALL be a pinned dev dependency. A new release on the registry
then cannot change the lint result on a commit.

#### Scenario: A lint warning fails the script

- **WHEN** a file under `src`, `packages`, `test` or `scripts` holds code the
  linter reports as a warning
- **THEN** `bun run lint` exits non-zero and names the file, line and rule

#### Scenario: A dead directive fails the script

- **WHEN** a file carries a disable directive and the line it covers draws no
  finding
- **THEN** `bun run lint` exits non-zero and names the directive's file and
  line

#### Scenario: The check runs the linter first

- **WHEN** `bun run check` runs on a tree with a lint finding
- **THEN** it stops at the lint step, before the typecheck starts

### Requirement: CI audits the dependency tree

The hosted CI workflow SHALL run `bun audit` against the committed lockfile
on every push and every pull request. An advisory of high or critical
severity SHALL fail the job. A low or moderate advisory SHALL NOT fail it.

The workflow SHALL excuse an advisory with no fixed release by its id, one
id at a time. The workflow file SHALL carry a comment at the excuse that names the
advisory and says why no fix applies. A blanket severity raise SHALL NOT
stand in for an excuse.

The audit SHALL run in CI and not in the pre-push hook. It needs the
registry, and a push must not fail because the network does.

#### Scenario: A high advisory fails CI

- **WHEN** the lockfile resolves a package with a high or critical advisory
- **THEN** the CI audit step fails and names the package and the advisory

#### Scenario: A moderate advisory passes CI

- **WHEN** the lockfile resolves a package whose worst advisory is moderate
- **THEN** the CI audit step passes

#### Scenario: An excused advisory passes CI

- **WHEN** a high advisory has no fixed release
- **AND** the workflow excuses its id, with a comment that states the reason
- **THEN** the CI audit step passes

#### Scenario: A push offline still runs its checks

- **WHEN** a contributor pushes with no route to the package registry
- **THEN** the pre-push hook runs no audit, and its checks decide the push
