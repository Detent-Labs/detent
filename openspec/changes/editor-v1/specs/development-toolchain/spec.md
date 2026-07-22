## MODIFIED Requirements

### Requirement: Bun is the standard toolchain
The project SHALL use Bun as its runtime, package manager, and test
runner, across a Bun workspace rooted at the repository root. Dependencies
MUST be installed with `bun install` and tests MUST run with `bun test`.
The project MUST NOT depend on pnpm, corepack, tsx, or vitest, in the root
package or in any workspace member.

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
- **WHEN** `packages/editor` (or any other workspace member) has a type
  error
- **THEN** running `bun run typecheck` from the repo root fails, even if
  the engine package's own `src`/`test` types are clean
