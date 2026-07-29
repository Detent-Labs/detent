# development-toolchain

## Purpose

Defines the project's standard runtime, package manager, test runner, and
typecheck tool, and how contributors install, test, and typecheck the project.

## Requirements

### Requirement: Bun is the standard toolchain
The project SHALL use Bun as its runtime, package manager, and test runner,
across a Bun workspace rooted at the repository root. Dependencies MUST be
installed with `bun install` and tests MUST run with `bun test`. The project
MUST NOT depend on pnpm, corepack, tsx, or vitest, in the root package or in
any workspace member.

#### Scenario: Installing dependencies
- **WHEN** a contributor runs `bun install`
- **THEN** dependencies resolve from the root `package.json` and every
  workspace member's `package.json`, and a single `bun.lock` file is
  produced at the repo root

#### Scenario: Running the test suite
- **WHEN** a contributor runs `bun test` from the repo root
- **THEN** the schema-invariant suite executes and passes

#### Scenario: No legacy tooling remains
- **WHEN** the root `package.json` or any workspace member's
  `package.json` is inspected
- **THEN** none declares a `packageManager` pin, and none declares a
  `tsx` or `vitest` dev dependency

#### Scenario: A workspace member's local dependency resolves without a registry fetch
- **WHEN** a workspace member declares a local, non-registry dependency
  (`workspace:*` on another member, or `file:` on the workspace root,
  which is not itself a member matched by the `workspaces` glob)
- **THEN** `bun install` links it from the local filesystem rather than
  fetching it from a registry

### Requirement: Typechecking remains tsc-based
Because Bun does not typecheck, type safety SHALL be enforced by
`tsc --noEmit`. The engine package keeps its own `typecheck` script
covering `src` and `test`. Each additional workspace member SHALL declare
its own `typecheck` script and `tsconfig.json` (member-specific compiler
settings, e.g. DOM/JSX libs, SHALL NOT be added to the engine's
`tsconfig.json`). The root `typecheck` script, run via `bun run
typecheck`, SHALL run the engine's own check and every workspace member's
`typecheck` script, failing if any of them fails.

#### Scenario: Typecheck a valid tree
- **WHEN** a contributor runs `bun run typecheck` on a valid source tree
- **THEN** `tsc` checks `src` and `test` under strict mode and reports no
  errors, and every workspace member's own `typecheck` script also runs
  and reports no errors

#### Scenario: A workspace member's type error fails the root command
- **WHEN** `packages/studio` (or any other workspace member) has a type
  error
- **THEN** running `bun run typecheck` from the repo root fails, even if
  the engine package's own `src`/`test` types are clean

### Requirement: Each frontend package serves on a fixed, distinct dev port

Every workspace package that ships a Vite dev server SHALL pin its own port
in its `vite.config.ts` and SHALL fail to start rather than fall back to a
different one. The assignment is one port per package and is stable across
contributors and machines:

| package | port |
|---|---|
| `packages/app` | 5173 |
| `packages/admin` | 5174 |
| `packages/studio` | 5175 |

Pinning alone is not sufficient: without a strict-port setting Vite silently
serves on the next free port when the configured one is taken, which
reintroduces exactly the start-order dependence the fixed assignment exists
to remove. A conflict MUST surface as a startup failure a contributor can
see and act on.

#### Scenario: Starting one dev server

- **WHEN** a contributor runs `bun run dev` in any one of the three frontend
  packages
- **THEN** the dev server listens on that package's assigned port, and on no
  other port

#### Scenario: Starting every dev server together

- **WHEN** a contributor runs `bun run dev` in all three frontend packages, in
  any order
- **THEN** each serves on its own assigned port, and no package's port
  depends on which package was started first

#### Scenario: An occupied port fails loudly

- **WHEN** a package's assigned port is already in use by another process
- **THEN** that dev server exits with a port-in-use error instead of binding
  a different port

### Requirement: The devcontainer permits every frontend dev origin

The devcontainer's `CORS_ALLOWED_ORIGINS` value SHALL list the
`http://localhost:<port>` origin of every frontend package's dev server, so
each of them can call the engine's HTTP wrapper from a browser without any
per-contributor configuration edit. The value MUST use the allowlist form
(a comma-separated origin list) that `configurable-cors-origins` already
specifies, not the `*` wildcard: the wildcard would work today but is
mutually exclusive with the credentialed CORS a future cookie-backed
`ActorResolver` would need.

When a package's assigned port changes, or a frontend package is added or
removed, the allowlist SHALL be updated in the same change.

#### Scenario: Any frontend calls the engine from a browser

- **WHEN** a browser on any of the three assigned dev origins issues a
  cross-origin request to the engine running in the devcontainer
- **THEN** the response carries `Access-Control-Allow-Origin` echoing that
  origin, along with `Vary: Origin`

#### Scenario: An unlisted origin is still refused

- **WHEN** a browser on an origin absent from the allowlist issues the same
  request
- **THEN** no `Access-Control-Allow-Origin` header is emitted and the browser
  blocks the response, unchanged from the behavior
  `configurable-cors-origins` specifies

#### Scenario: Removing a frontend package

- **WHEN** a frontend workspace package is deleted
- **THEN** its origin is removed from `CORS_ALLOWED_ORIGINS` in the same
  change that deletes it

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
