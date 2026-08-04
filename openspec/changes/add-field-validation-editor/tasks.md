## 1. The logic module

- [ ] 1.1 Add `packages/web/src/areas/studio/panels/shared/fieldValidationLogic.ts`
      with `offeredKeys(type: BaseFieldType | Plugin): ValidationKey[]`, a
      literal table matching the spec's four rows. It imports nothing from
      `src/runtime/api.ts`.
- [ ] 1.2 Add `checkPattern(src: string, bound: number)` to the same module,
      returning one of: compiles, does not compile with the `RegExp` message,
      or exceeds the bound. Read the bound from the same constant
      `compile.ts::checkLengthBounds` uses, through the exports map.
- [ ] 1.3 Add `carriedKeys(validation)` returning the keys a field's
      `validation` already holds, so the editor can render a key `offeredKeys`
      omits.
- [ ] 1.4 Add `patchValidation(current, key, value)` returning the next
      `validation` object, or `undefined` when the patch would empty it.
- [ ] 1.5 Write `packages/web/test/studio-fieldValidationLogic.test.ts`. Cover
      each row of the `offeredKeys` table by name, and name `checkConstraints`
      in `src/runtime/api.ts` in the describe block so a later reader finds the
      source of truth. Cover `checkPattern` with `[a-`, an over-long source and
      `^[A-Z]{2}[0-9]{4}$`. Cover `patchValidation` clearing the last key to
      `undefined`, not `{}`.

## 2. The editor component

- [ ] 2.1 Add `packages/web/src/areas/studio/panels/shared/FieldValidationEditor.tsx`,
      a `<details>` section whose summary counts the keys the field carries. It
      opens closed when `validation` is absent.
- [ ] 2.2 Render one control per key from `offeredKeys`, union `carriedKeys`:
      `min`, `max`, `minLength` and `maxLength` as `<input type="number">`,
      `pattern` as a text input, `rule` as the existing `ExpressionInput`.
- [ ] 2.3 Mark every key in `carriedKeys` that `offeredKeys` omits with an
      inline note stating the engine skips it for this field type. Keep the
      control editable and removable.
- [ ] 2.4 Report `checkPattern`'s result inline beside the `pattern` input.
      Never block the save.
- [ ] 2.5 Route every mutation through `patchValidation`, so clearing the last
      key patches `validation: undefined`.

## 3. Wiring

- [ ] 3.1 Mount `FieldValidationEditor` in `FieldRow` inside
      `FieldCatalogPanel.tsx`, below the options fieldset, passing the field's
      `type` and `validation` and the row's existing `onChange`.
- [ ] 3.2 Confirm the recursion into a group field's sub-fields carries the
      editor with it, since `FieldRow` renders itself.
- [ ] 3.3 Add the new UI strings to
      `packages/web/src/areas/studio/catalog.ts`.
- [ ] 3.4 Add the section's styles beside the panel's existing ones. Reuse the
      panel's tokens rather than adding new ones.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` inside the devcontainer and report what it
      printed.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set. Report the pass
      count and the skip count, not the pass count alone.
- [ ] 4.3 Run the antislop linter over every Markdown file this change touched.
- [ ] 4.4 Run `git diff --check`, then `grep -lI $'\r'` over the changed files
      for CRLF in the worktree.
- [ ] 4.5 Check in a real browser: open a `number` field and confirm the editor
      offers `min`, `max` and `rule` alone. Set `min`, save, reload, and confirm
      the value survives. Clear it and confirm the saved body carries no
      `validation` key.
- [ ] 4.6 Check in a real browser: hand-author `pattern` on a `number` field
      through the JSON view, switch to the structural surface, and confirm the
      editor shows it marked rather than dropping it.
