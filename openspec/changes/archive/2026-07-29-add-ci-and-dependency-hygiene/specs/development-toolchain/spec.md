## ADDED Requirements

### Requirement: Every push and pull request runs the toolchain's checks against a real database

The repository SHALL carry an automated workflow that, on every push and every
pull request, installs with the committed lockfile, runs the repo-wide
typecheck, and runs the full test suite with `DATABASE_URL` pointing at a
Postgres 16 service using the devcontainer's credentials.

The workflow SHALL **fail** if `DATABASE_URL` is unset rather than proceeding.
This is the load-bearing part: the DB-backed suites are `test.skipIf(!DB)` at
546 sites — the majority of the suite — so a run without the variable reports
a pass count that omits most of what was written and looks identical to a
genuine green. Machine-enforcing the variable is what turns
`CLAUDE.md`'s bolded convention into a property of the repository.

The typecheck SHALL be run as its own step, because Bun does not typecheck and
a type error therefore passes `bun test` cleanly.

The Bun version used SHALL be the one the devcontainer pins (`BUN_VERSION` in
`.devcontainer/Dockerfile`), so CI and local runs cannot drift apart.

#### Scenario: A pull request runs the full suite

- **WHEN** a pull request is opened or updated
- **THEN** the workflow installs with the committed lockfile, typechecks the
  engine and every workspace package, and runs the full test suite against a
  Postgres 16 service

#### Scenario: A missing database configuration fails the job

- **WHEN** the workflow runs without `DATABASE_URL` set
- **THEN** the job fails with an error naming the variable, rather than
  running a suite that silently skips its database-backed tests

#### Scenario: A type error fails the job

- **WHEN** a change introduces a type error that no test exercises
- **THEN** the typecheck step fails the job

#### Scenario: A lockfile mismatch fails the job

- **WHEN** a manifest is edited without regenerating the lockfile
- **THEN** the frozen-lockfile install fails, rather than resolving a
  different dependency tree than the one committed

### Requirement: A runtime import is a declared runtime dependency of the package that imports it

Every package SHALL declare, in its own manifest, the packages it imports as
runtime values — as a `dependency`, or as a `peerDependency` where the package
is source-only and is compiled by its consumer. A package SHALL NOT rely on
workspace hoisting to supply a runtime import it does not declare, and a
runtime import SHALL NOT be declared as a `devDependency`.

This is currently violated in one direction each way: `zod` is a
`devDependency` of the root while six modules under `src/` import it as a
value and the public `exports` map exposes entry points that all reach it; and
`packages/app` and `packages/form-ui` import it while declaring it nowhere.
The consequence is not theoretical — `bun install --production`, or a slim
engine image, yields `Cannot find module "zod"` on the first import of the
schema module, and the failure would first appear in whichever change builds
that image rather than in the change that mis-declared it.

Dependencies whose behavior the contract depends on SHALL be pinned exactly,
following the treatment `typescript` already gets. `@marcbachmann/cel-js` is
such a dependency by explicit design — one CEL library backs both the
publish-time type-check and runtime evaluation — and its failure mode is
silent: guard evaluation is total (an error becomes `false`) and the transform
path degrades to a recorded drop, so an evaluation-semantics change reroutes
or parks already-published, immutable definitions instead of throwing. The
reason SHALL be recorded next to the "one CEL library" rule it protects, so
that an upgrade is a deliberate commit that re-runs the CEL suite.

#### Scenario: A production install can start the engine

- **WHEN** dependencies are installed without development dependencies
- **THEN** importing the engine's public entry points succeeds

#### Scenario: A workspace package declares what it imports

- **WHEN** a workspace package imports a third-party package as a runtime
  value
- **THEN** that package appears in its own manifest, rather than being
  resolved from a hoisted root install

#### Scenario: A contract-critical dependency is pinned

- **WHEN** the manifest is inspected for the CEL library
- **THEN** it names an exact version, and the reason is recorded beside the
  rule that makes it load-bearing
