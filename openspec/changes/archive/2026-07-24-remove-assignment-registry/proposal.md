## Why

`AssignmentStrategyDef`/`AssignmentRegistry` is a plugin registry (parallel to
the action-handler registry) for a strategy space of exactly one: only the
built-in `static` strategy is ever registered outside tests. The
`assignmentRegistry` parameter threads through ~20 call sites across
`src/engine/transition.ts` and `src/engine/definitions.ts` (every transition
entry point, cancellation, and publish), each defaulting to
`createDefaultAssignmentRegistry()`, but every one of those call sites only
ever passes it through to a single real use: resolving `static`'s flat
candidate list. This is a ponytail-audit finding (#1): a plugin system with no
second plugin, adding indirection and parameter-threading with no present
payoff. Cutting it removes the registry layer while keeping every observable
behavior (candidate resolution, claim/release, eligibility) identical.

## What Changes

- Delete `AssignmentRegistry`, `AssignmentStrategyDef`, `createAssignmentRegistry`,
  `registerAssignmentStrategy`, `resolveAssignmentStrategy`,
  `createDefaultAssignmentRegistry`, and the `staticAssignmentStrategy` plugin
  object from `src/engine/registry.ts`. `STATIC_ASSIGNMENT_STRATEGY_TYPE`
  stays as a plain constant.
- Replace `checkAssignmentRegistry(body, registry)` in
  `src/engine/registry-check.ts` with a direct, registry-free check: a step's
  `assignment.strategy.type` must be `"static"` (else a located issue), and
  its `config` must match `{ candidates: string[] }` (else a located issue).
  Same `RegistryIssue[]` shape, same call site in `publishBody`
  (`AssignmentRegistryValidationError` unchanged), same placement rule
  (after the hash-hit no-op, alongside `checkActionRegistry`).
- Inline `resolveStepAssignment` (`src/engine/transition.ts`) to read
  `strategy.config.candidates` directly instead of resolving through a
  registry lookup.
- Inline the equivalent, independent resolution logic in
  `src/engine/store.ts::createInstance` the same way — it does not call
  `resolveStepAssignment`; it has its own inline read of the initial step's
  `assignment.strategy` via `resolveAssignmentStrategy`, a second real read
  site the registry has beyond `resolveStepAssignment`.
- Remove the `assignmentRegistry` parameter (and its
  `= createDefaultAssignmentRegistry()` default) from every function in
  `transition.ts`, `store.ts`, and `definitions.ts` that threads it through
  with no other use: `commitTransition`, `resolveAutomatic`,
  `executeManualTransition`, `commitManualTransition`, `cancelInstance`,
  `sweepCancelledChildren`, `startInstance`, `executeAutomaticTransition`,
  `fireTimer`, `createInstance` (store.ts), `publishBody`, and their callers
  in `host.ts`, `subprocess.ts`, `migration.ts`.
- Trim/rewrite `test/assignment-registry.test.ts` to cover the new direct
  check (unknown type rejected, bad config rejected, static resolves
  candidates) instead of registry registration mechanics.
- **BREAKING** (internal API, not the JSON contract): every public function
  above that accepted an optional `assignmentRegistry` parameter drops it.
  No caller outside this repo exists; `Step.assignment.strategy`'s
  `{ type, config }` shape in `src/schema/definition.ts` is unchanged.
- Update `CLAUDE.md`: the "Extensibility" paragraph narrows from five plugin
  categories (custom actions, guards, data sources, assignment strategies,
  field types) to four — assignment strategy is no longer an extension
  point, `static` is the only supported strategy. The "Current state"
  paragraph describing the registry is rewritten to describe the direct
  check.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `assignment-registry-validation`: requirements change from "resolve
  `Step.assignment.strategy.type` against an injected registry" to "reject
  any `Step.assignment.strategy.type` other than `static`, and validate its
  `config` directly against `{ candidates: string[] }`" — same publish-time
  placement and error type, no registry involved.
- `assignment-claim-enforcement`: the "resolved `AssignmentStrategyDef`"
  mechanism language in the candidate-resolution and static-strategy
  requirements is replaced with direct resolution of `config.candidates`
  for a `static` assignment — all observable behavior (atomic resolution at
  step entry, eligibility rules, claim/release exclusivity, audit events)
  is unchanged.

## Impact

- `src/engine/registry.ts`, `src/engine/registry-check.ts`,
  `src/engine/transition.ts`, `src/engine/definitions.ts`: assignment-registry
  types/functions removed; `assignmentRegistry` parameter removed from every
  threading call site.
- `src/engine/store.ts::createInstance`: its own inline resolution (not just
  a threading site) rewritten alongside `resolveStepAssignment`.
- `src/engine/host.ts`, `src/engine/subprocess.ts`, `src/engine/migration.ts`:
  drop registry construction/passthrough (calls into the functions above).
- `test/assignment-registry.test.ts`: rewritten for the direct check.
- `src/schema/definition.ts`: untouched — `Step.assignment.strategy` keeps its
  generic `{ type, config }` envelope shape.
- `packages/editor/`: untouched — no editor changes in this proposal.
- `CLAUDE.md`: Extensibility and Current-state paragraphs updated to match.
