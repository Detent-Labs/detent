## 1. Correct the two IT examples

The examples come first. The check in group 3 rejects them as they stand, so
adding it earlier leaves the tree red.

- [x] 1.1 In `examples/it-offboarding.json`, rewrite every view entry's
  `group` from the label to the group field's key. Verify with a script that
  every value matches a catalog group key.
- [x] 1.2 In `examples/it-offboarding.json`, add a `ref` entry for each group
  field, at the position of its first member. Verify each view has one.
- [x] 1.3 Repeat 1.1 and 1.2 for `examples/it-onboarding.json`.
- [x] 1.4 Regenerate both `definitionHash` values. Verify each equals
  `definitionHash(compileProcessBody(body))`.

## 2. Correct purchase-requisition

- [x] 2.1 Add the nine missing group fields to
  `examples/purchase-requisition.json`, each with a key and a label and no
  child. Verify the catalog holds ten group fields.
- [x] 2.2 Rewrite its view entries' `group` values to the group keys, and add
  the `ref` entries. Verify no view has a grouped entry without its container.
- [x] 2.3 Regenerate its `definitionHash`. Verify it equals
  `definitionHash(compileProcessBody(body))`.
- [x] 2.4 Run `bun test` over `test/registry-check.test.ts` and
  `test/compile-validation.test.ts`. Verify both stay green.

## 3. The publish-time check

- [x] 3.1 Add `checkViewGroupReferences` to `src/schema/compile.ts`. It
  resolves each view entry's `group` against the recursive catalog.
- [x] 3.2 Extend it to need the group field's own `ref` entry in the same
  view. Verify both halves report the step and the group.
- [x] 3.3 Call it beside `checkTechnicalFields`, ahead of the idempotent
  return. Verify the call sits on the write path alone.

## 4. The rejecting test

- [x] 4.1 In `test/compile-validation.test.ts`, add a body whose `group`
  names no catalog field. Verify the publish fails.
- [x] 4.2 Add a body whose `group` names a field that is not a group field.
  Verify the publish fails.
- [x] 4.3 Add a body whose `group` names a group field the view leaves out.
  Verify the publish fails.
- [x] 4.4 Add a note entry carrying the same error. Verify the publish fails.
- [x] 4.5 Add a well-formed grouped body. Verify it publishes.
- [x] 4.6 Add a body a published version already carries. Verify
  `processBody.parse` still accepts it.

## 5. Documentation

- [x] 5.1 Note the publish error in `docs/authoring-guide.md`, beside the
  passage naming what `group` holds. Verify the antislop count does not rise.
- [x] 5.2 Add the invariant to `.claude/rules/authoring-invariants.md`, naming
  `compile.ts::checkViewGroupReferences`. Verify the entry states its
  placement.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`. Verify both pass.
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set. Verify the pass
  count and the skip count against the floor.
- [x] 6.3 Run the whitespace and prose gates over the pushed range. Verify
  both report clean.
- [x] 6.4 Seed a scratch database. Verify all nine examples publish.
- [x] 6.5 In a browser, open an IT Offboarding task on a seeded engine.
  Verify the form draws its 26 fields under six headings.
- [x] 6.6 In the same browser pass, open a `purchase_requisition` task. Verify
  its draft step draws ten fields under three headings.
