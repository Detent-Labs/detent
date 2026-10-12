## Why

Publish accepts two kinds of input that the runtime then misreads or ignores.
A body that already carries a cancel-sink of any shape takes the idempotent
compile branch unchecked. A hand-written sink with `outcome: "approved"`
makes a cancelled child look approved to its parent (audit finding A-2).
Also, `Action.execution: "blocking"` and `Action.idempotencyKey` publish and
enter the hash while nothing reads them (A-8).

## What Changes

- The idempotent compile branch compares the body with the engine's own
  compile of it. The compiler strips the compiled content, parses the rest as
  an authored body, and injects a fresh cancel-sink. Publish rejects the body
  with a located issue when the two differ by one byte of canonical JSON.
  That pins the sink's id, key, label, type, terminal flag, outcome and
  position. It also pins the reserved outcome in `contract.outcomes`.
- `Action.execution` accepts `"async"` only. A `"blocking"` value fails to
  parse until the engine implements blocking delivery.
- **BREAKING**: `Action.idempotencyKey` leaves the schema. Publish rejects the
  key as an unknown key. `examples/expense-approval.json` and
  `examples/purchase-requisition.json` set `"idempotencyKey": null` on five
  actions, and the sweep removes it.
- The Studio's change list drops its label for `idempotencyKey`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cancellation`: the authoring invariant for the cancel-sink grows from a
  count to the exact injected shape.
- `definition-contract`: two new requirements fix the `execution` enum and
  remove `idempotencyKey` from the action.

## Impact

- `src/schema/compile.ts`: the idempotent branch, plus the extraction of the
  sink injection into a function both branches call.
- `src/schema/definition.ts`: the `execution` enum and `action`.
- `examples/`, `packages/web/src/areas/studio/draft/changeSet.ts`, the Studio
  catalog, `docs/authoring-guide.md`, `.claude/rules/process-contract.md`,
  `.claude/rules/authoring-invariants.md`, and the audit index entry in
  `docs/decisions.md`.
- A stored body that sets `execution: "blocking"` stops parsing on read. No
  deployment stores one. A stored body that sets `idempotencyKey` still
  parses, because the schema strips the key on read.
