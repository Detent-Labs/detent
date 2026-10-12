# Proposal

## Why

An `instance.transition` action reads the id of the instance it moves out of a
field of the acting instance. Nothing requires that field to be bound to a
source of valid targets. A participant of process A can type the id of any B
instance into a plain text field. The handler then moves that instance as the
system actor, past claim, candidacy and visibility. The audit of 2026-10-10
raised this as D-3 (medium).

The publish gate is also weaker than the action's reach. The publishing author
needs only `read` on B, and B's Reader list can grant it. A standing read
right on B therefore unlocks a write effect on B.

## What Changes

- Publish rejects an `instance.transition` action unless `instanceIdField`
  names a field bound to an `instance.query` data source over the action's own
  `processId`. The submit-time option check then limits the value to the
  instances that source offers.
- Publish requires the `migrate` permission on the action's target process, for
  `instance.transition` sites only. The permission follows the gate's current
  semantics: the global developer role or a stored grant. No access list
  counts. `instance.query` sites keep the `read` gate.
- The handler refuses a target whose `kind` differs from the acting instance's
  `kind`, so a test instance cannot move a published one, and the reverse.
- The trust model becomes explicit. The action moves any instance the bound
  source offers. The source does not filter by the acting participant's
  visibility, and publish does not demand `stepIds`.
- `docs/authoring-guide.md`, `.claude/rules/authoring-invariants.md`,
  `.claude/rules/process-contract.md` and the examples follow the new rules.
- **BREAKING** for authors: an `instance.transition` body with an unbound
  `instanceIdField` stops publishing. Nothing is deployed, so no stored body
  needs migrating. A published version stays immutable and is not rechecked at
  delivery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cross-process-validation`: adds the binding rule and the `migrate` grant
  rule for `instance.transition` sites. Changes the read-grant requirement,
  which stated that both site kinds share one gate.
- `instance-transition-action`: adds the refusal of a target of another `kind`.
  States the trust model: the action moves any instance the bound source
  offers.

## Impact

- `src/engine/definitions.ts`: the binding check inside
  `validateInstanceTransitionReferences`, and a new `migrate` check beside
  `validateCrossProcessReadGrant`. `publishBody` then runs eight DB-resolving
  checks.
- `src/handlers/instance-transition.ts`: the `kind` refusal.
- No change to `src/schema/definition.ts`, the studio or the HTTP surface. The
  studio config form takes flat strings and has no mirror of the new rule. A
  rejected publish reaches the author through the existing cross-process and
  authorization error paths.
- Tests that publish an `instance.transition` action need a bound field and an
  author holding `migrate`. `examples/` has no such action.
- Docs: `docs/authoring-guide.md`, `.claude/rules/authoring-invariants.md`,
  `.claude/rules/process-contract.md`, and the audit index entry in
  `docs/decisions.md`.
