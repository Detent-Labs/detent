## Why

The engine has no way to author process definitions except hand-writing JSON
against `src/schema/definition.ts`. That does not scale past trivial
examples: authors must track id-minting, cross-references, and every
publish-time invariant (CEL types, action-registry configs, duration
grammar) by hand, with no feedback until a real `publishBody` call. An
editor that authors valid `AuthoredProcessBody` JSON against the same
contract removes that manual burden while keeping the contract as the sole
source of truth.

## What Changes

- Promote the repo to a Bun workspace: root `package.json` with
  `workspaces`; existing code becomes the engine package under an
  `exports` map that exposes only the contract surface (`./schema`,
  `./cel/check`, likely `./schema/compile`) — no file moves, the boundary
  is enforced by `exports`, not directory layout.
- Add a new `packages/editor` package: a structural editor (panels for
  field catalog, data sources, steps incl. per-step `view`, paths, timers,
  actions, contract) plus an auto-layouted **read-only** graph view of the
  FSM. Canvas editing (drag-to-connect) is explicitly out of scope.
- Introduce an editor-owned **Draft model**: a structural superset of
  `AuthoredProcessBody` (same shape, references and required parts
  optional) so a mid-edit process — missing `initialStep`, dangling path
  targets, half-filled fields — has a representable, editable state. The
  editor mints prefixed UUIDv4 ids (`step_…`, `path_…`, …); authors work
  only with `key`/`label`.
- Wire live validation into the editor using the engine's own publish-time
  validators, unmodified: the Zod refinements/`superRefine` in
  `definition.ts`, `validateProcessBody` (CEL), `checkActionRegistry`,
  `validateDurations`. Located issues (`CelIssue` etc.) map onto the
  panel/graph entity that produced them. Checks needing external state
  (cross-process validation, registry) run only against locally loaded
  child definitions / an injected registry, and render as "not checked"
  rather than a false pass when that state is absent.
- File-based draft I/O: load/save a draft file, export a validated
  authored `ProcessBody` JSON. No server, no DB, no HTTP API, no publish
  call — `publishBody` stays engine-side, invoked exactly as it is today.

## Capabilities

### New Capabilities
- `editor-workspace`: the Bun workspace boundary — root `package.json`,
  `packages/` layout, the engine package's `exports` map restricting the
  editor to the contract surface.
- `editor-draft-model`: the editor-owned Draft type (structural superset of
  `AuthoredProcessBody`), id-minting, and the parse-into-Contract-schema
  validation strategy that produces located issues from an incomplete draft.
- `editor-structural-panels`: the authoring UI for field catalog, steps
  (incl. per-step view), paths, timers, actions, and contract, editing the
  Draft model.
- `editor-live-validation`: continuous validation against the engine's
  unmodified publish-time validators, with issue-to-entity mapping and an
  explicit "not checked" state for externally-scoped checks.
- `editor-graph-view`: the auto-layouted, read-only FSM graph view driven by
  the same Draft model and validation issues.
- `editor-draft-io`: file-based draft load/save and validated authored-JSON
  export.

### Modified Capabilities
- `development-toolchain`: adds the Bun workspace root, `packages/`
  convention, and the engine package's `exports` map as toolchain-level
  requirements (currently a single-package repo).

## Impact

- **Repo layout**: new root `package.json` with `workspaces`; existing
  `src/`, `test/`, `examples/` relocate under an engine package (path TBD in
  design.md) reachable only through its `exports` map. `tsconfig.json` and
  `bun test` must keep working for the engine package unchanged.
- **New package**: `packages/editor` — its own `package.json`, a local
  (`file:..`) dependency on the engine package, and a graph-rendering
  dependency (library choice deferred to design.md).
- **No engine runtime changes**: `src/engine/`, `publishBody`, and the
  database layer are untouched. The only engine-side change is the
  `exports` map controlling what the editor can import.
- **No changes to `definition.ts` or any Zod schema** — the editor consumes
  the contract, it does not extend or fork it.
