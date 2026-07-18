## ADDED Requirements

### Requirement: Bun is the standard toolchain
The project SHALL use Bun as its runtime, package manager, and test runner.
Dependencies MUST be installed with `bun install` and tests MUST run with
`bun test`. The project MUST NOT depend on pnpm, corepack, tsx, or vitest.

#### Scenario: Installing dependencies
- **WHEN** a contributor runs `bun install`
- **THEN** dependencies resolve from `package.json` and a `bun.lock` file is produced

#### Scenario: Running the test suite
- **WHEN** a contributor runs `bun test`
- **THEN** the schema-invariant suite executes and passes

#### Scenario: No legacy tooling remains
- **WHEN** `package.json` is inspected
- **THEN** it declares no `packageManager` pin and no `tsx` or `vitest` dev dependency

### Requirement: Typechecking remains tsc-based
Because Bun does not typecheck, type safety SHALL be enforced by `tsc --noEmit`,
exposed as the `typecheck` script and run via `bun run typecheck`.

#### Scenario: Typecheck a valid tree
- **WHEN** a contributor runs `bun run typecheck` on a valid source tree
- **THEN** `tsc` checks `src` and `test` under strict mode and reports no errors
