<!-- antislop: allow-file all -->

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
