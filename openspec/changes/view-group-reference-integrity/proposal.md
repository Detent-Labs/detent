## Why

A participant opens an IT Offboarding task on the live deployment and sees no
field. The step declares 26. The engine resolves all 26 and sends them. The
browser draws none of them.

`ViewField.group` names a catalog group field's key. The renderer draws only
the entries that have no `group`. A group field then draws the entries naming
its own key. Three example bodies put the group's label in that key
instead. None of the three references the group field itself. Every entry
therefore falls out of the form, and the form comes up blank.

Nothing catches this. `src/schema/compile.ts` never reads `ViewField.group`.
Publish accepts the body. The author meets an empty form and no message.

Measured across the three bodies, 38 steps carry a grouped entry. 37 of them
draw an empty form. One draws 1 of its 11 entries.

## What Changes

- Add `checkViewGroupReferences` to `src/schema/compile.ts`. A view entry's
  `group` SHALL name a group field's key in the process's own catalog, and
  that group field SHALL be an entry in the same view.
- **BREAKING** for a hand-authored body. A body that publishes today fails
  after this. The read path stays untouched, so a published version and every
  instance pinned to it keep working.
- Correct `examples/it-offboarding.json` and `examples/it-onboarding.json`.
  Both catalogs already nest their fields correctly. Only the view side is
  wrong: each `group` carries a label, and no view names its group field.
- Correct `examples/purchase-requisition.json`. It needs more. Its catalog
  declares one group field, and its views name ten groups. Nine of them get a
  group field the catalog does not hold yet.
- Ship a test that rejects a body violating either half of the rule.
- Note the publish error in `docs/authoring-guide.md`, beside the passage that
  already states what `group` names.

The three bodies change, so each one gets a new `definitionHash`. Each
publishes as a new version. The versions already published stay immutable, and
the instances pinned to them keep rendering as they do today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: adds one publish-time invariant over a view entry's
  `group`. The capability already carries the sibling id-resolution
  invariants, and this one resolves a key rather than an id.

## Impact

- `src/schema/compile.ts`: one check function and its call site.
- `test/compile-validation.test.ts`: the rejecting test.
- `examples/it-offboarding.json`, `examples/it-onboarding.json`,
  `examples/purchase-requisition.json`: corrected bodies and new hashes.
- `docs/authoring-guide.md`: the publish error beside the `group` passage.
- `.claude/rules/authoring-invariants.md`: the new invariant, in the list that
  already names every compile-pass check.
- `packages/form-ui`: no change. `form-ui`'s spec already states the rendering
  rule this check protects, and the renderer already follows it.
