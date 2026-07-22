## ADDED Requirements

### Requirement: Repo is a Bun workspace with no engine file moves
The repository root SHALL declare a `workspaces` field listing
`packages/*`. Existing engine code (`src/`, `test/`, `examples/`) SHALL
remain at the repository root; the root `package.json` SHALL double as the
engine package's own manifest. No existing source file's path SHALL
change as part of this requirement.

#### Scenario: Installing from a fresh clone
- **WHEN** a contributor runs `bun install` from the repo root after this
  change
- **THEN** both the root (engine) package and every package under
  `packages/` resolve their dependencies, including local, non-registry
  dependencies between them

#### Scenario: Engine test suite location is unchanged
- **WHEN** a contributor runs `bun test` from the repo root
- **THEN** the existing `test/` suite runs exactly as it did before the
  workspace promotion, with no path changes required

### Requirement: Engine package restricts its exports to the contract surface
The root package.json SHALL declare an `exports` map exposing exactly
`./schema` (`src/schema/definition.ts`), `./cel/check`
(`src/cel/check.ts`), `./schema/compile` (`src/schema/compile.ts`),
`./engine/registry` (`src/engine/registry.ts`), and `./engine/registry-check`
(`src/engine/registry-check.ts`). **Correction found during task 4.2** (see
design.md decision 2): the original three-entry map omitted
`checkActionRegistry` and the `Registry` type it needs, both pure
validation/type modules with no `Bun.sql`/DB/outbox dependency. No other
module path SHALL be resolvable by an importing workspace member through
the package's own name.

#### Scenario: Editor imports the contract
- **WHEN** code in `packages/editor` imports from the engine package's
  `./schema` specifier
- **THEN** it resolves to the Zod schemas and TS types in
  `src/schema/definition.ts`

#### Scenario: Editor cannot import engine internals via the package name
- **WHEN** code in `packages/editor` attempts to import an engine-internal
  module (e.g. anything under `src/engine/`) via the engine package's name
- **THEN** module resolution fails, because no `exports` entry maps to it

### Requirement: New editor package lives under packages/editor
A new package SHALL exist at `packages/editor` with its own
`package.json`, declaring a local, non-registry dependency on the engine
package (the root package is the workspace root, not itself a member
matched by the `workspaces` glob, so this dependency SHALL NOT rely on
self-referencing workspace-protocol resolution).

#### Scenario: Editor package is a workspace member
- **WHEN** `bun install` runs at the repo root
- **THEN** `packages/editor` is recognized as a workspace member and its
  dependency on the engine package resolves to a local symlink, not a
  registry fetch
