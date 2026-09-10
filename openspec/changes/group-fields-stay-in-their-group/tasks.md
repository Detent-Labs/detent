## 1. The parentage helper

- [x] 1.1 Add `parentGroupKeyById(fields)` to `src/schema/definition.ts`, returning a `Map`
- [x] 1.2 Unit-test it over a flat catalog, a one-deep group and a two-deep nesting
- [x] 1.3 Confirm `./schema` already exports it, so the exports map stays untouched

## 2. The example bodies

The examples move first, so the publish check in group 3 never lands on a red
tree.

- [x] 2.1 Count the violations in `examples/` again; do not trust the proposal's numbers
- [x] 2.2 Nest each grouped field of `purchase-requisition.json` under its group in the catalog
- [x] 2.3 Pick each multi-group field's group by the rule in `design.md`: its earliest step's
- [x] 2.4 Align its view entries with the chosen catalog parents
- [x] 2.5 Regenerate its wrapper `definitionHash` with the JCS hash of the body
- [x] 2.6 Extend the example loops in `compile-validation.test.ts` and `validate.test.ts` to nine

## 3. The publish check

- [x] 3.1 Extend `checkViewGroupReferences` with the parentage half, reading the helper
- [x] 3.2 Message names the step, the entry index and the group the catalog declares
- [x] 3.3 Leave a note entry exempt; its `group` still answers the first two halves
- [x] 3.4 Add rejection tests: wrong group, group on a top-level field, one field across steps
- [x] 3.5 Add an acceptance test for a note naming a group no catalog tie binds

## 4. The canvas tree

- [ ] 4.1 Add a pure tree builder beside `view-layout.ts`, keyed on each entry's array index
- [ ] 4.2 Roots are entries with no `group`; a group node holds the entries naming its key
- [ ] 4.3 An entry whose `group` resolves to no group card draws as a root, never hidden
- [ ] 4.4 A field under a key-less group draws as a root; draw no card for that group
- [ ] 4.5 Unit-test an interleaved array, a nested group and a group with no members
- [ ] 4.6 Replace `nudgeViewField` with a sibling swap, scoped by the entry's own group
- [ ] 4.7 Unit-test the swap at both bounds, and a root swap stepping past a whole group
- [ ] 4.8 Add a cascading remove: a group entry takes every entry naming its key
- [ ] 4.9 Add a group-aware insert: it sets `group` and places the group entry when absent

## 5. The catalog stays level with the views

- [ ] 5.1 Add a `draft/` helper that rewrites view entries after a catalog change
- [ ] 5.2 On a move, set each entry naming the field to the new parent's key
- [ ] 5.3 On a move to the top level, remove that entry's `group` key instead
- [ ] 5.4 On a group key rename, rewrite every entry naming the old key, notes included
- [ ] 5.5 Call it from `EntityTabs.tsx:423`'s `moveField`, inside its existing `mutate`
- [ ] 5.6 Call it from both key inputs in `FieldCatalogPanel.tsx`, in one `mutate` each
- [ ] 5.7 Leave a note's own `group` alone on a move; a move has no note to carry
- [ ] 5.8 Unit-test both rewrites across three steps, plus the top-level and note cases
- [ ] 5.9 Correct `moveFieldToGroup`'s doc comment; it states the old no-view-change rule

## 6. The editor screen

- [ ] 6.1 Render the tree: a group `<li>` holds a `<fieldset>`, a `<legend>` and a nested `<ol>`
- [ ] 6.2 Draw the group box as a 1px stroke with no fill, spanning the form's full width
- [ ] 6.3 Give every group a tail drop slot inside it, so an empty group accepts a drop
- [ ] 6.4 Disable move-up on a group's first member and move-down on its last
- [ ] 6.5 Call `preventDefault` on `dragover` only for a lawful slot, so a refusal reads native
- [ ] 6.6 Make a group card's remove control destructive, labelled with its member count
- [ ] 6.7 Remove the `group` select from `FormEditorStrip`; leave `NoteEditorStrip` alone
- [ ] 6.8 Keep `formEditor.group` and `formEditor.noGroup`; the note strip still reads both
- [ ] 6.9 Add the new studio catalog keys to both `en` and `de`

## 7. Docs and rules

- [ ] 7.1 Rewrite the group passage in `docs/authoring-guide.md` to state the parentage rule
- [ ] 7.2 Correct the view-group bullet in `.claude/rules/authoring-invariants.md`
- [ ] 7.3 Check `.claude/rules/process-contract.md` for the same claim and correct it

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`, then `bun run build`, and report what each printed
- [ ] 8.2 Run the full `bun test` with `DATABASE_URL` set; report the skip count too
- [ ] 8.3 Run both push gates over the pushed range, per the root `CLAUDE.md`
- [ ] 8.4 Run `impeccable detect` over the changed files under `packages/web`
- [ ] 8.5 Browser check the form editor: nest, move, refuse a drag, remove a group
- [ ] 8.6 Browser check a catalog move and a group rename; both forms must follow
- [ ] 8.7 Run `/impeccable critique` and `/impeccable audit` against the form editor route
