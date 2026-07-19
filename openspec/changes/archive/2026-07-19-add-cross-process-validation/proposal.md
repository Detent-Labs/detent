## Why

Subprocess execution ships, but nothing checks that a subprocess step's wiring is
valid against the child it calls. A mismatched `inputMapping` target or an
unresolvable child reference surfaces only at spawn time — the spawn handler
throws and the action dead-letters, far from the author who made the mistake. The
definition store now resolves child bodies, so the cross-process invariants that
were deferred "until a process registry exists" (roadmap #1) can finally be
enforced at publish, where they belong.

## What Changes

- Publishing a process with subprocess steps resolves each referenced child and
  **rejects the publish** (a hard error, not a runtime failure) when:
  - an `inputMapping` target key is not in the child's `contract.inputFields`; or
  - the child reference does not resolve to a contracted child — a `pinned`
    `pinnedVersion` that is not published, a `latest-at-spawn` `contractRef` that
    matches no published child contract signature, or a resolved child that
    declares no `contract`.
  This enforces **child-first publish ordering**: a parent can only be published
  once the contracted child version it pins already exists (matching the contract's
  "the parent validated against the child" intent).
- Deferred (out of scope, noted): checking that `outputMapping` expressions only
  read child field keys / `contract.outputFields` (needs CEL identifier extraction).
- Dropped (was originally scoped): a "child self-requiredness" refinement rejecting
  a contracted process that marks a non-input field `required: true`. A `required`
  view flag is satisfied by an interactive step's user, not by the caller, so it
  does not encode "the caller must supply this field" — the shipped
  `expense-approval` example legitimately requires a non-input field at its manual
  `review` step. No sound static check exists here.

## Capabilities

### New Capabilities
- `cross-process-validation`: publish-time enforcement that a subprocess step's
  wiring is valid against the child process it calls — `inputMapping` targets
  within the child's declared inputs, and the child reference resolvable to a
  contracted child (child-first ordering).

### Modified Capabilities
<!-- None. `definition-store`'s publish requirements still hold (compile → hash →
     persist, idempotent); cross-process validation is an added gate that runs
     during publish, before persist, and is specified in the new capability. -->

## Impact

- Engine (`src/engine/definitions.ts`): `publishBody` gains a cross-process
  validation pass before persist — for each subprocess step, resolve the child via
  the store's `resolveBody` / `resolveLatestByContract` and check the reference
  resolves to a contracted child and `inputMapping` ⊆ child `inputFields`. A new
  error type (`CrossProcessValidationError`) is thrown on failure. No schema
  (`src/schema/definition.ts`) change.
- Tests: a rejecting test per invariant (out-of-contract `inputMapping` key;
  unresolvable pinned/latest reference; non-contracted child) plus a passing
  round-trip (child published first, parent validates).
- Docs: `CLAUDE.md` roadmap #1 (cross-process invariants no longer deferred) and
  the invariant list.
