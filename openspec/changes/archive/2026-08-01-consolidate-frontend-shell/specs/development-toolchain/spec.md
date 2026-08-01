<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation long-words -->
<!-- The requirement bodies below are carried over verbatim from the main
     spec, with only the moved paths and package names edited. Rewording
     the surrounding prose would change requirement text for a stylistic
     reason unrelated to this change. -->

## MODIFIED Requirements

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
