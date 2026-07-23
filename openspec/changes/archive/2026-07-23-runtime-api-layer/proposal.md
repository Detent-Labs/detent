## Why

The engine (`src/engine/`) exposes only in-process TypeScript functions built
for internal callers (workers, migration, cancellation). There is no boundary
a UI — or, later, an HTTP server — can call to run an instance without
knowing engine internals: how to resolve a `ProcessBody`, how to merge a
step's `view` against the field catalog and current data, how to compute
which manual paths are currently available, or how to write submitted user
data at all. Nothing in the engine today validates or writes arbitrary
user-submitted data; the only existing write paths are `Action.output`,
migration `transforms`, and internal subprocess mapping. A concrete consumer
(a future editor preview/player, or an HTTP wrapper) needs exactly this
boundary before it can be built.

## What Changes

- Add a new in-process module `src/runtime/` exposing exactly three
  operations: create an instance, get "what to display" for an instance
  (resolved view + available paths), and submit data while triggering a
  manual path.
- Add new runtime-data validation (type/options/constraints/CEL
  `validation.rule`/required) that does not exist anywhere in the engine
  today — `data` submitted through this layer is checked against
  `FieldValidation`, `FieldDef.options`, and the resolved view before being
  written and committed atomically with the transition.
- Extend `createDefinitionStore` (`src/engine/definitions.ts`) with a
  `resolveLatest(processId)` resolver (newest published version for a
  process), alongside the existing `resolveBody`/`resolveLatestByContract`.
- Split `executeManualTransition` (`src/engine/transition.ts`) into
  `commitManualTransition` (one commit, no cascade) and
  `executeManualTransition` (= `commitManualTransition` + `resolveAutomatic`,
  unchanged behavior for every existing call site), and add an optional
  `dataPatch` parameter to both: when present, the path's guard is evaluated
  against the full data merged in-memory, and that same full merged object —
  not the raw patch — commits atomically with the transition via the
  existing `applyStepEntry` `extraFields` mechanism (a partial patch would be
  lost to Postgres jsonb's shallow top-level merge). Callers that omit
  `dataPatch` see unchanged behavior — not **BREAKING**.
- `submitAndTransition` commits its data write under a row lock
  (`SELECT ... FOR UPDATE`) held only for that one commit, so a concurrent
  `Action.output` writeback into an unrelated field is not silently
  discarded by the wholesale `data` patch — the same discipline
  `migration.ts`/`subprocess.ts` already apply for the same reason. The
  subsequent automatic-path cascade runs separately, outside the lock,
  matching every other caller's transactional granularity.
- No HTTP transport, auth/actor resolution, assignment/claim enforcement,
  list/history endpoints, or `FieldDef.default` application are added — see
  design.md for the explicit non-goals.

## Capabilities

### New Capabilities
- `runtime-api`: the library boundary itself — `createProcessInstance`,
  `getInstanceView`, `submitAndTransition` (with its row-locked commit), the
  field-set boundary (submitted data must lie within the current step's
  visible-and-editable fields, excluding group-container refs), and the new
  submission-validation rules (type, option membership, constraints, CEL
  rule, required), collected into one `SubmissionValidationError` rather than
  failing fast.

### Modified Capabilities
- `transition-execution`: `executeManualTransition` is split into
  `commitManualTransition` (single commit) and `executeManualTransition`
  (commit + cascade, unchanged for existing callers); both gain an optional
  `dataPatch`, merged in full (not as a raw patch) into the guard context,
  the step-entry plan, and the committed data — the existing requirement
  that a manual transition writes no data patch no longer holds
  unconditionally; it now holds only when the caller supplies none.
- `definition-store`: `createDefinitionStore` gains a `resolveLatest`
  resolver returning the newest published `{ version, body }` for a
  `processId`, alongside the existing `resolveBody` and
  `resolveLatestByContract`.

## Impact

- New file `src/runtime/api.ts` (plus its test file `test/runtime-api.test.ts`).
- `src/engine/definitions.ts`: additive export on `createDefinitionStore`'s
  return type.
- `src/engine/transition.ts`: additive optional parameter on
  `executeManualTransition`; no change to existing call sites.
- No schema changes (`src/schema/definition.ts` untouched) and no new
  database tables or columns.
