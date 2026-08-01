<!-- antislop: allow-file passive-voice -->
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

### Requirement: The suite runs against a database no other process drives

A `bun test` run SHALL use a database of its own, separate from the one
`bun run serve`, `bun run seed` and the auth CLI use. The test database SHALL
be derived from `DATABASE_URL`, by appending `_test` to its database name. A
name that already ends in `_test` SHALL stay unchanged. The database SHALL be
created on demand when it does not exist.

The choice SHALL happen in a `bun test` preload, wired through the
repository-root `bunfig.toml`. It SHALL NOT depend on a caller running a
particular script name.

That wiring reaches every `bun test` started from the repository root, which
is what both gates and the documented workflow do. Bun reads `bunfig.toml`
from the working directory, so a run started inside a package directory does
not get the preload. No suite under `packages/*/test/` touches a database
today, and none SHALL: a DB-backed suite belongs in `test/`.

The reason is measured, not theoretical. The HTTP server starts background
pollers through `startEngine`, one claiming outbox rows every 500 ms. Against
one shared database those pollers take rows the suite is driving. Twenty runs
with a dev server up produced three red runs. Twenty with none produced zero.

Separation SHALL hold in both directions. A test run SHALL NOT truncate the
tables a dev server, a seed or a browser session is using.

When `DATABASE_URL` is unset, the preload SHALL leave it unset. The DB-backed
suites then skip, as they do today, rather than failing on a derived name.

#### Scenario: A test run does not touch the development database

- **WHEN** the suite runs while a dev server drives the development database
- **THEN** the suite's writes land in the `_test` database, and the
  development database keeps its rows

#### Scenario: The test database is created on demand

- **WHEN** the suite runs and the `_test` database does not exist
- **THEN** it is created, and the run proceeds

#### Scenario: No connection string still skips rather than fails

- **WHEN** the suite runs with `DATABASE_URL` unset
- **THEN** the DB-backed suites skip, and no derived database name is used

### Requirement: A run names the database it used

Each `bun test` run SHALL print the database it connected to, before the
first suite runs. A run against the wrong database is then visible at once,
in either direction.

#### Scenario: The run states its database

- **WHEN** the suite starts with `DATABASE_URL` set
- **THEN** its output names the database the run will use

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
- **WHEN** `packages/web` (or any other workspace member) has a type
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
| `packages/web` | 5173 |

Exactly one package ships a dev server, so exactly one port is assigned. The
rule stays stated per package rather than as a single constant, because it is
what a second browser package would have to satisfy.

Pinning alone is not sufficient: without a strict-port setting Vite silently
serves on the next free port when the configured one is taken, which
reintroduces exactly the start-order dependence the fixed assignment exists
to remove. A conflict MUST surface as a startup failure a contributor can
see and act on.

#### Scenario: Starting one dev server

- **WHEN** a contributor runs `bun run dev` in the frontend package
- **THEN** the dev server listens on its assigned port, and on no other port

#### Scenario: Starting every dev server together

- **WHEN** a contributor starts every frontend dev server, which is now one
- **THEN** every area is reachable under its prefix on that one port, in any
  order, with no second dev server to start and so no start-order dependence
  left to have

#### Scenario: An occupied port fails loudly

- **WHEN** the assigned port is already in use by another process
- **THEN** that dev server exits with a port-in-use error instead of binding
  a different port

### Requirement: The devcontainer permits every frontend dev origin

The devcontainer's `CORS_ALLOWED_ORIGINS` value SHALL list the
`http://localhost:<port>` origin of every frontend package's dev server, so
each of them can call the engine's HTTP wrapper from a browser without any
per-contributor configuration edit. With one browser package, that is one
origin. The value MUST use the allowlist form
(a comma-separated origin list) that `configurable-cors-origins` already
specifies, not the `*` wildcard: the wildcard would work today but is
mutually exclusive with the credentialed CORS a future cookie-backed
`ActorResolver` would need.

When a package's assigned port changes, or a frontend package is added or
removed, the allowlist SHALL be updated in the same change.

#### Scenario: Any frontend calls the engine from a browser

- **WHEN** a browser on the assigned dev origin issues a
  cross-origin request to the engine running in the devcontainer
- **THEN** the response carries `Access-Control-Allow-Origin` echoing that
  origin, along with `Vary: Origin`

#### Scenario: An unlisted origin is still refused

- **WHEN** a browser on an origin absent from the allowlist issues the same
  request
- **THEN** no `Access-Control-Allow-Origin` header is emitted and the browser
  blocks the response, unchanged from the behavior
  `configurable-cors-origins` specifies

#### Scenario: Adding a frontend package

- **WHEN** a frontend workspace package is added
- **THEN** its assigned dev origin is added to `CORS_ALLOWED_ORIGINS` in the
  same change that adds it

#### Scenario: Removing a frontend package

- **WHEN** a frontend workspace package is deleted
- **THEN** its origin is removed from `CORS_ALLOWED_ORIGINS` in the same
  change that deletes it

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

### Requirement: A wandering test result counts as a defect

`bun run check` gates every push, through `.githooks/pre-push`. That gate
reads a pass as evidence that the tree is sound.

Take an unchanged tree. A test that fails on one run and passes on the next
SHALL count as a defect. It lives in the suite, in the code it covers, or in
the environment the run shares. It is never noise to rerun past.

A defect of that kind SHALL NOT be answered by a retry wrapper, a widened
timeout, or a skipped test. Each of those leaves the gate green over the same
defect. The suite is the only evidence either gate has.

Diagnosis SHALL rest on a captured assertion, not on a test name alone. A name
records that something broke. Only the assertion, with its expected and
received values, says what.

#### Scenario: A wandering result is not rerun past

- **WHEN** a test fails on one run and passes on the next, against an
  unchanged tree
- **THEN** it is treated as a defect to diagnose, and neither a retry nor a
  skip closes it

#### Scenario: A name alone does not close a diagnosis

- **WHEN** a run reports a failing test but its assertion text goes uncaptured
- **THEN** the diagnosis stays open until a run captures the assertion

### Requirement: A runtime import is a declared runtime dependency of the package that imports it

Every package SHALL declare, in its own manifest, the packages it imports as
runtime values — as a `dependency`, or as a `peerDependency` where the package
is source-only and is compiled by its consumer. A package SHALL NOT rely on
workspace hoisting to supply a runtime import it does not declare, and a
runtime import SHALL NOT be declared as a `devDependency`.

The rule exists because the failure is not theoretical: `bun install
--production`, or a slim engine image, yields `Cannot find module "zod"` on the
first import of the schema module, and the failure would first appear in
whichever change builds that image rather than in the change that mis-declared
it. `zod` is the case that produced the rule, in both directions — a root
`devDependency` behind a public `exports` map, and browser packages importing
it while declaring it nowhere.

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

### Requirement: The devcontainer provides an SMTP catcher

The devcontainer SHALL run an SMTP catcher service alongside the existing
Postgres service. It SHALL come from a pinned off-the-shelf image with no
custom build. The engine service SHALL depend on it and SHALL receive
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` pointing at it.

The shared compose file SHALL publish no host port for it. The Postgres
service already follows that rule: port publishing is a per-machine
convenience in the gitignored `docker-compose.override.yml`, never a
team-wide default. A contributor who wants the catcher's web interface in a
browser SHALL add that binding themselves, on the loopback address.

This gives the `notification.email` handler's end-to-end test a real SMTP
endpoint to send to. It follows the same "real dependency, not a mock"
pattern the DB-backed suites already use against the Postgres service. The
test that sends a message SHALL skip when `SMTP_HOST` is unset, matching the
existing `test.skipIf(!DB)` convention. It SHALL read the delivered message
back over the catcher's own HTTP API, inside the compose network. It
therefore never depends on a host binding.

#### Scenario: The engine can send mail inside the devcontainer

- **WHEN** a contributor starts the devcontainer and runs the test suite
- **THEN** `SMTP_HOST` and `SMTP_PORT` are already set, and the end-to-end
  send test delivers a message to the catcher instead of skipping

#### Scenario: The shared compose file publishes no port for the catcher

- **WHEN** the tracked `docker-compose.yml` is inspected
- **THEN** the catcher service declares no `ports` entry, exactly like the
  Postgres service

#### Scenario: A contributor inspects a delivered message

- **WHEN** a contributor adds the catcher's web port to their own gitignored
  `docker-compose.override.yml`, bound to `127.0.0.1`
- **THEN** they open that interface in a host browser and read a delivered
  message

#### Scenario: A run without SMTP_HOST skips instead of failing

- **WHEN** the test suite runs outside the devcontainer with `SMTP_HOST`
  unset
- **THEN** the end-to-end send test skips, and the config-validation and
  failure-classification tests still run

