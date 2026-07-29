<!-- antislop: allow-file all -->

## MODIFIED Requirements

### Requirement: Studio is a workspace package that reaches the engine only through its two sanctioned boundaries

`packages/studio` SHALL be a Bun workspace package (React + Vite + TypeScript)
following the shape of `packages/app`. It SHALL reach the running system at
**runtime** exclusively through the HTTP wrapper — never the database, never an
engine module invoked in-process against live state — and it SHALL import from
the engine at **compile time** only through the package's `exports` map
(`workflow-engine/schema`, `/schema/compile`, `/cel/check`,
`/engine/registry-check`), which is what makes live validation a pure frontend
feature with no endpoint behind it.

Routing SHALL be a hand-written History-API hook following
`packages/app/src/routing.ts`, with no router dependency. This change SHALL NOT
modify `packages/app` or `packages/form-ui`.

#### Scenario: No direct data access

- **WHEN** `packages/studio/src` is inspected for imports
- **THEN** it imports no database client and no engine module by deep path,
  only the exports-map entry points and its own HTTP client

## ADDED Requirements

### Requirement: The shell routes to Tools and Player alongside the process list

Studio's shell SHALL offer navigation to `/tools` (see the `studio-tools`
capability) and to a per-process Player at `/processes/:processId/play` (see
the `studio-player` capability), reachable the same way the process list
already is — behind the shell's `system:developer` presentational check, with
every route it calls enforcing the role authoritatively.

#### Scenario: Tools is reachable from the shell

- **WHEN** an authenticated actor holding `system:developer` uses the shell's
  navigation
- **THEN** a link to `/tools` is present and renders the Tools screen

#### Scenario: Player is reachable from a process's edit context

- **WHEN** an authenticated actor holding `system:developer` opens a process
- **THEN** a link to that process's Player screen is present
