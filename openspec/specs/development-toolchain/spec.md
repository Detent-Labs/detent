<!-- antislop: allow-file passive-voice -->
# development-toolchain

## Purpose

Defines the project's standard runtime, package manager, test runner and
typecheck tool. Also defines how a contributor installs, tests, typechecks and
builds the project.
## Requirements
### Requirement: Bun is the standard toolchain
The project SHALL use Bun as its runtime, package manager and test runner. The
Bun workspace is rooted at the repository root. Dependencies MUST be installed
with `bun install`, and tests MUST run with `bun test`. The project
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
- **AND** that dependency is `workspace:*` on another member, or `file:` on the
  workspace root, which the `workspaces` glob does not match
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

### Requirement: The push gate runs against the checkout it pushes

The pre-push hook SHALL run its checks inside the devcontainer that
bind-mounts the checkout the push comes from. A hook reaching another
checkout's container reports on files the push does not carry. Its result then
says nothing about the branch it gates.

The hook SHALL take the container's identity from the derivation
`worktree-isolation` specifies. It SHALL NOT name a Compose project itself.
The same rule holds for every gate the hook runs inside the container.

This refines the container placement "Every push runs the toolchain's checks
against a real database" already mandates. That requirement puts the checks in
a container. This one says which container.

#### Scenario: A worktree's push compiles that worktree

- **WHEN** a developer pushes from a linked worktree carrying a type error the
  main checkout lacks
- **THEN** the gate reports that type error and refuses the push

#### Scenario: Another checkout's state does not reach the gate

- **WHEN** a developer pushes from a linked worktree while another checkout
  carries a type error
- **THEN** the gate does not report the other checkout's type error

### Requirement: Typechecking remains tsc-based
Because Bun does not typecheck, type safety SHALL be enforced by
`tsc --noEmit`. The engine package keeps its own `typecheck` script
covering `src` and `test`. Every other workspace member SHALL declare its own
`typecheck` script and `tsconfig.json`. A member-specific compiler setting, a
DOM or JSX lib for example, SHALL NOT go in the engine's `tsconfig.json`.

The root `typecheck` script runs via `bun run typecheck`. It SHALL run the engine's
own check and every workspace member's `typecheck` script. It SHALL fail when
any one of them fails.

#### Scenario: Typecheck a valid tree
- **WHEN** a contributor runs `bun run typecheck` on a valid source tree
- **THEN** `tsc` checks `src` and `test` under strict mode and reports no error
- **AND** every workspace member's own `typecheck` script runs and reports none

#### Scenario: A workspace member's type error fails the root command
- **WHEN** `packages/web` (or any other workspace member) has a type
  error
- **THEN** running `bun run typecheck` from the repo root fails, even if
  the engine package's own `src`/`test` types are clean

### Requirement: Each frontend package serves on a fixed, distinct dev port

Every workspace package that ships a Vite dev server SHALL pin its own port in
its `vite.config.ts`. It SHALL fail to start rather than fall back to a
different one. Each package takes one port, and that port stays stable across
contributors and machines:

| package | port |
|---|---|
| `packages/web` | 5173 |

Exactly one package ships a dev server, so the table holds one row. The rule
stays per package rather than a single constant. A second browser package
would have to satisfy it too.

That port is the one the dev server listens on inside its container. Its host
address is the port `worktree-isolation` derives for the checkout. A main
checkout keeps the listening port as its host address.

Where the two numbers differ, the package's own config must carry one
consequence. The browser reaches the dev server on the host address, so the
hot-reload socket opens on that number. The package SHALL read that
number from the environment, as `PORT_VITE`. It SHALL NOT assume it equals the
listening port. The devcontainer SHALL carry `PORT_VITE` in the environment of
the container the dev server runs in.

Pinning alone is not enough. Without a strict-port setting, Vite serves on the
next free port whenever another process holds the configured one. That
reintroduces the start-order dependence the fixed assignment removes. A
conflict MUST surface as a startup error a contributor can act on.

#### Scenario: Starting one dev server

- **WHEN** a contributor runs `bun run dev` in the frontend package
- **THEN** the dev server listens on its assigned port, and on no other port

#### Scenario: Starting every dev server together

- **WHEN** a contributor starts every frontend dev server, which is now one
- **THEN** every area is reachable under its prefix on that one port, in any
  order
- **AND** no second dev server exists to start, so no start-order dependence
  remains

#### Scenario: An occupied port fails loudly

- **WHEN** the assigned port is already in use by another process
- **THEN** that dev server exits with a port-in-use error instead of binding
  a different port

#### Scenario: Hot reload reaches the published address

- **WHEN** a browser loads the dev server of a worktree whose host address
  differs from the listening port
- **THEN** the hot-reload socket connects to the host address, and a saved
  file reaches the browser with no manual reload

### Requirement: The devcontainer permits every frontend dev origin

The devcontainer's `CORS_ALLOWED_ORIGINS` value SHALL list the
`http://localhost:<port>` origin of every frontend package's dev server. Each
of them can then call the engine's HTTP wrapper from a browser, with no
per-contributor setting change.

It SHALL list the `http://127.0.0.1:<port>` origin of that same dev server too.
The manual checklist mandates that address under Windows. A browser following
it sends an origin the first form does not cover. One browser package therefore
contributes two entries.

In a checkout whose host address differs from the listening port, the
allowlisted origin SHALL carry the host address `worktree-isolation` derives.
The browser reaches the dev server there, so that address is the origin the
request arrives with.

The value MUST use the allowlist form that `configurable-cors-origins` already
specifies, a comma-separated origin list. It MUST NOT use the `*` wildcard.
That wildcard would work today. It is also mutually exclusive with the
credentialed CORS a future cookie-backed `ActorResolver` would need.

A change that alters a package's assigned port SHALL carry the matching
allowlist change. So SHALL one that adds or removes a frontend package.

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

#### Scenario: The allowlist carries a worktree's browser origin

- **WHEN** a checkout whose derived host address differs from the listening
  port brings its stack up
- **THEN** `CORS_ALLOWED_ORIGINS` names that host address, under both
  `localhost` and `127.0.0.1`

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
- **THEN** that run carries `DATABASE_URL`, so the DB-backed suites execute
  rather than skipping

### Requirement: A clone's push connection survives its own pre-push hook

The repository SHALL arm an SSH keepalive for its own pushes. The script the
root `prepare` step runs SHALL set `core.sshCommand` to an `ssh` invocation
carrying `ServerAliveInterval` and `ServerAliveCountMax`. It sets that beside
the `core.hooksPath` it already sets, in the same run of `bun install`. No
clone SHALL need a contributor to type it.

Git opens the connection to the remote before it runs `pre-push`. The hook's
standard input carries a remote object name per ref. Only the remote supplies
that name. The hook then runs the gates, the typecheck and the full suite.
That takes minutes. No byte crosses the connection in that time, so the
remote closes it.

The hook then exits 0, and git writes the pack into a dead socket. The push
stops at exit 141, which is 128 + 13 for SIGPIPE.

That exit code is the reason this rule is mechanical. No gate rejected
anything. So 141 reads as a broken pipe inside the hook, and it sends the
reader to the wrong file. The line that names the cause is
`Connection to github.com closed by remote host`. It reached one failing log
of four.

`ServerAliveInterval` SHALL be short enough to keep traffic on the connection
while the hook runs. The value answers the remote's idle tolerance, not the
hook's runtime. Each reply resets the clock, so one interval under that
tolerance holds the connection for any duration.

<!-- antislop: allow synonym-rotation -->
<!-- The build requirement above uses "stop" for a failed build; "kill" here
     names ssh dropping the connection, an unrelated concept the linter
     otherwise pairs with it across the file. -->
`ServerAliveCountMax` multiplied by the interval SHALL exceed the hook's
wall-clock runtime. ssh disconnects once that many probes go unanswered. A
product under the runtime lets a short network drop inside the hook window
kill the connection this rule protects. The values in force are
`ServerAliveInterval=20` and `ServerAliveCountMax=30`. ssh therefore
tolerates 600 seconds.

The script SHALL NOT overwrite a `core.sshCommand` that a contributor already
set. Such a value may carry an identity file, a `ProxyCommand`, or a
different ssh binary. Overwriting it breaks that contributor's access to
every remote. The script SHALL print the two options to add, and SHALL
exit 0.

The script SHALL keep out where the environment carries `GIT_SSH`. Only the
`ssh` variant takes `-o option`. A `plink`, `putty` or `tortoiseplink`
contributor given `ssh -o ...` gets a different program. The script SHALL
print the two options to add there too.

The script SHALL leave the setting alone where the value already matches what
it writes. It SHALL say so. `bun install` runs the script at every install,
not only the first.

Where no git repository answers, the script SHALL exit 0 and set nothing.
`core.hooksPath` already follows that rule, for the same reason.
The production image builds from a copied tree with no `.git` directory.

`GIT_SSH_COMMAND` needs no rule. It wins over `core.sshCommand`, so a
contributor who exports it keeps what they exported.

#### Scenario: A fresh clone gains the keepalive from its first install

- **WHEN** a contributor clones the repository and runs `bun install`, with no
  `core.sshCommand` set and no `GIT_SSH` in the environment
- **THEN** `core.sshCommand` carries `ServerAliveInterval` and
  `ServerAliveCountMax`, and the script prints the value it wrote

#### Scenario: A contributor's own ssh command survives the install

- **WHEN** `bun install` runs in a clone whose `core.sshCommand` already names
  a different command, such as one carrying an identity file
- **THEN** that value stays as it is, the script prints the two options to
  add, and it exits 0

#### Scenario: A GIT_SSH contributor keeps their own ssh program

- **WHEN** `bun install` runs with `GIT_SSH` set in the environment
- **THEN** the script writes no `core.sshCommand`, prints the two options to
  add, and exits 0

#### Scenario: A second install writes nothing new

- **WHEN** `bun install` runs again in a clone the script already armed
- **THEN** `core.sshCommand` holds the same value as before, and the script
  says the clone already carries it

#### Scenario: An install with no git repository still succeeds

- **WHEN** `bun install` runs against a copied tree that holds no `.git`
  directory, as the production image build does
- **THEN** the install succeeds and the script writes no setting

#### Scenario: A push outlives the hook it runs

- **WHEN** a contributor pushes, and the hook runs the gates, the typecheck
  and the full suite for minutes
- **THEN** the connection to the remote carries keepalive traffic throughout.
  Git writes the pack to a live socket when the hook exits 0

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
runtime values. It declares each one as a `dependency`. It uses a
`peerDependency` where the package is source-only, and its consumer compiles
it. A package SHALL NOT rely on workspace hoisting to supply a runtime import
it does not declare. A runtime import SHALL NOT sit in `devDependencies`.

The rule exists because the error is not theoretical. `bun install --production`
yields `Cannot find module "zod"` on the first import of the schema module. So
does a slim engine image. The error would first appear in whichever change
builds that image, not in the change that mis-declared it.

`zod` is the case that produced the rule, in both directions. It sat as a root
`devDependency` behind a public `exports` map. Browser packages imported it
while declaring it nowhere.

A dependency the contract rests on SHALL be pinned exactly. The pin on
`typescript` already shows that treatment.

One such dependency is `@marcbachmann/cel-js`, by explicit design. One CEL
library backs both the publish-time type-check and runtime evaluation.

Its error mode is silent. Guard evaluation is total, so an error becomes
`false`. The transform path degrades to a recorded drop. An
evaluation-semantics change therefore reroutes or parks already-published,
immutable definitions instead of throwing.

The reason SHALL sit next to the "one CEL library" rule it protects. An upgrade
is then a deliberate commit that re-runs the CEL suite.

`zod` is the second such dependency, and it carries the same treatment for a
different reason. `src/schema/definition.ts` is the contract itself. A package
that resolves zod SHALL name one exact version, so one workspace resolves one
zod.

A source-only package names a `peerDependency` range instead, under the rule
above. Its range SHALL admit the resolved version, and SHALL exclude every
earlier major. The contract's types reach that package as `z.infer` types, so a
range admitting two majors resolves one type against two zods.

`definitionHash` is the JCS hash of the parsed `ProcessBody`, not of the source
text. A zod release can emit one key more than the pinned release, or one key
less. Such a release changes the identity of an already-published version.
Every instance pins `{processId, version, definitionHash}`, so a changed
identity stops a pinned instance rehydrating.

A caret range admits that release without a commit. An exact pin makes the
upgrade a deliberate commit, which re-runs the hash test over `examples/`.

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

#### Scenario: The schema library is pinned where it resolves, and ranged where it is a peer

- **WHEN** the engine root, `packages/web` and `packages/form-ui` manifests are
  inspected for zod
- **THEN** the engine root and `packages/web` name one exact version as a
  `dependency`
- **AND** `packages/form-ui` names a `peerDependency` range admitting that
  version, and no earlier major

#### Scenario: A published body keeps its hash across a schema-library upgrade

- **WHEN** a change upgrades the pinned zod version
- **THEN** each `examples/` body still hashes to the value the test records,
  and no recorded value changes

### Requirement: The devcontainer provides an SMTP catcher

The devcontainer SHALL run an SMTP catcher service alongside the existing
Postgres service. It SHALL come from a pinned off-the-shelf image with no
custom build. The engine service SHALL depend on it and SHALL receive
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` pointing at it.

The shared compose file SHALL declare no `ports` entry for it. The Postgres
service already follows that rule. The bring-up publishes the catcher's web
interface instead, at the port `worktree-isolation` derives, into
`.devcontainer/docker-compose.ports.yml`. The bring-up generates that file and
git ignores it, so the shared file still carries no team-wide host
binding. A contributor who
wants an extra binding of their own adds it to the gitignored
`docker-compose.override.yml`, on the loopback address.

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

- **WHEN** a reader inspects the tracked `docker-compose.yml`
- **THEN** the catcher service declares no `ports` entry, exactly like the
  Postgres service

#### Scenario: A contributor inspects a delivered message

- **WHEN** a contributor opens the catcher's web interface at the address the
  bring-up printed
- **THEN** they read a delivered message there

#### Scenario: A run without SMTP_HOST skips instead of failing

- **WHEN** the test suite runs outside the devcontainer with `SMTP_HOST`
  unset
- **THEN** the end-to-end send test skips, and the config-validation and
  failure-classification tests still run

### Requirement: The devcontainer runs a webhook sink

The devcontainer SHALL run a service that answers an `http.request` action.
The service SHALL answer every request with `200`. It SHALL echo a JSON
request body back as its own response body. An `Action.output` expression
then reads a value the process definition sent.

The service SHALL run inside the `app` container, as a script tracked in
`scripts/`. It SHALL NOT run as a separate compose service, and it SHALL NOT
add a third-party image to the stack.

The service declares no healthcheck of its own, unlike the standalone
service this requirement replaces. It runs inside `app`, which already
declares one healthcheck for the container as a whole. A second, sink-only
healthcheck would contend with it for no added coverage.

A contributor who wants to reach it from the host publishes the port in
their own gitignored `docker-compose.override.yml`, against the `app`
container.

#### Scenario: The shipped example books through the sink

- **WHEN** a contributor seeds the devcontainer database and walks
  `examples/expense-approval.json` from capture through review and approval
- **THEN** the `book` step's `http.request` action reaches the sink, the sink
  echoes the authored booking status, and `Action.output` writes it into
  `booking_status`
- **AND** the instance leaves `book` over its `booked` path and reaches a
  terminal step

#### Scenario: The escalation webhook reaches a target that answers

- **WHEN** an `expense_approval` instance enters `escalated_review`
- **THEN** the `http.request` action on that step's `onEntry` receives a `200`
  and the outbox row succeeds

#### Scenario: A contributor reads what the sink received

- **WHEN** the sink answers a request
- **THEN** it writes the method and the path to stdout, where
  `docker compose logs app` shows them

#### Scenario: The shared compose file publishes no port for the sink

- **WHEN** a contributor reads the tracked `docker-compose.yml`
- **THEN** the file declares no separate `webhook-sink` service, and the
  `app` service declares no `ports` entry for the sink it now runs
  internally

### Requirement: Every action type the shipped examples name resolves in the default registry

Every action `type` that a file under `examples/` names SHALL resolve in
`createDefaultRegistry()`. A contributor SHALL reach a terminal step in the
running dev server without registering a handler by hand.

`scripts/seed.ts` SHALL register no placeholder handler. Its registry
publishes and drives the same examples the server runs. A placeholder
there hides a type the server cannot dispatch.

#### Scenario: The seed script needs no placeholder handler

- **WHEN** `scripts/seed.ts` publishes every file under `examples/` against
  `createDefaultRegistry()` alone
- **THEN** publish-time registry validation passes for all of them

#### Scenario: An example gains an unregistered action type

- **WHEN** a change points an example at an action type
  `createDefaultRegistry()` does not register
- **THEN** the change registers a real handler for it, or picks a type that
  already resolves

### Requirement: The devcontainer permits the shipped example's HTTP target

The devcontainer's `HTTP_ACTION_ALLOWED_HOSTS` value SHALL hold the host of
every `http.request` target the repository's own examples and scripts name.
Today that is one host, `localhost:8080`, the port the in-container sink
(the sink the previous requirement describes) listens on. An entry carries
its port whenever the port is not the scheme default, because
`egressRefusal` compares `URL.host`.

The list SHALL hold no host that no target names. A stale entry permits egress
to an address nothing in the repository uses.

The devcontainer SHALL also set `HTTP_ACTION_ALLOW_INSECURE` to `1`. The sink
speaks plain HTTP, and the `https:` rule would otherwise refuse it. The same
setting covers a target a contributor starts by hand.

A change that points an example at a new host SHALL add that host here. The
same holds for a script. Without the entry the action still publishes. It
still reaches the outbox. It then dead-letters, so nothing fails until an
operator reads the dead-letter view.

#### Scenario: The shipped example's escalation reaches its target

- **WHEN** the demo script drives `examples/expense-approval.json` to its
  escalation step inside the devcontainer
- **THEN** the `http.request` action's delivery reaches the in-container
  sink rather than dead-lettering on the egress policy

#### Scenario: An example gains a new target host

- **WHEN** a change points an example or a script at an `http.request` host
  the list does not name
- **THEN** that host joins `HTTP_ACTION_ALLOWED_HOSTS` in the same commit

#### Scenario: An example stops naming a host

- **WHEN** a change removes the last `http.request` target naming a host on
  the list
- **THEN** that host leaves `HTTP_ACTION_ALLOWED_HOSTS` in the same commit

#### Scenario: A contributor tests against a local target

- **WHEN** a contributor starts a target on `http://localhost:<port>` and
  points an `http.request` action at it, with that host in the list
- **THEN** the plain-HTTP scheme does not refuse the delivery

#### Scenario: The example's action targets resolve to the in-container sink

- **WHEN** `examples/expense-approval.json`'s `book` and `escalated_review`
  steps' `http.request` actions run inside the devcontainer
- **THEN** each target's host matches the `localhost` port
  `HTTP_ACTION_ALLOWED_HOSTS` names, and the sink running inside the `app`
  container answers it

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

It SHALL name `127.0.0.1` as the address, never `localhost`. Under Windows
`localhost` resolves to `::1`, and the connection hangs. The port itself is a
per-machine choice. Git ignores `.devcontainer/docker-compose.override.yml`, so
no number in this file binds every contributor. The checklist SHALL give the
two-line snippet that publishes one, suggesting the mapping
`127.0.0.1:3001:3000`. It
SHALL also say the engine serves the bundle from `WEB_ROOT`.

The bring-up now publishes the ports `worktree-isolation` derives for the
checkout. It writes them into `.devcontainer/docker-compose.ports.yml`, a file
of its own. Compose reads that file beside the contributor's override, where
one exists. The checklist SHALL say so.
It SHALL keep the hand-written snippet for a contributor who wants a binding of
their own. The override file stays theirs.

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

#### Scenario: A reader learns where the port comes from

- **WHEN** a contributor reads the operating rules
- **THEN** the file names the bring-up as what publishes the ports, and names
  the generated ports file

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

### Requirement: A test that spawns a server takes an ephemeral port and reaps its child

A test that spawns a listening process SHALL let the operating system choose
its port. It SHALL NOT hardcode one.

The reason is a measured failure, not a preference. A run that dies abnormally
leaves its child alive, still holding the bind. A later run asking for that
same number then fails at startup. That failure names a port, rather than
whatever orphaned the child.

The test SHALL read the port the child bound, from what the child itself
reports. A port the test picks in advance is the thing this rule removes.

An operating system does not assign a port that something currently holds. A
stray child therefore cannot redden a later run.

A test that spawns such a process SHALL stop it on every path out, including a
failed assertion. A leaked server holds resources the suite shares, a database
connection among them.

This rule cannot cover a runner that dies abnormally. Its `finally` never
runs. The ephemeral port is what makes that survivable, rather than the
cleanup.

#### Scenario: Two runs of the same suite do not collide

- **WHEN** a run leaves a spawned server alive, and the suite runs again
- **THEN** the second run spawns its own server and passes

#### Scenario: A failed assertion leaves no server behind

- **WHEN** an assertion fails between the spawn and the child's exit
- **THEN** the test stops the child before it reports the failure

#### Scenario: The test reads the bound port rather than choosing it

- **WHEN** a spawned server starts
- **THEN** the test learns its port from the child, and the suite declares no
  port for a listener it spawns
