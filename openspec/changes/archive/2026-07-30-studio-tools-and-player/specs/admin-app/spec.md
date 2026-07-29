<!-- antislop: allow-file all -->

## MODIFIED Requirements

### Requirement: The admin area is its own workspace package

`packages/admin` SHALL be a Bun workspace package built with React 18, Vite 6
and TypeScript, with its own `package.json`, `vite.config.ts`, `tsconfig.json`
and `index.html`, matching the shape of `packages/app`. It SHALL depend on
`workflow-engine` at compile time only for the types it renders
(`InstanceRecordElement`, `ActionOutcome`, instance and outbox row shapes), and
SHALL NOT depend on `form-ui` or on `packages/app` — the
admin area renders records and system state, never step forms.

At runtime it SHALL reach the engine exclusively through the HTTP wrapper. It
SHALL NOT read the database directly and SHALL NOT import engine runtime
modules.

#### Scenario: The package builds and typechecks on its own

- **WHEN** `bun run typecheck` and `vite build` are run for `packages/admin`
- **THEN** both succeed without reaching into another package's sources

#### Scenario: No form renderer dependency

- **WHEN** `packages/admin/package.json` is inspected
- **THEN** `form-ui` is not among its dependencies

#### Scenario: No direct database access

- **WHEN** the package's sources are inspected for data access
- **THEN** every engine interaction goes through `fetch` against the HTTP
  wrapper
