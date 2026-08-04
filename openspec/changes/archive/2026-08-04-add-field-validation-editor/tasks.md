## 1. The logic module

- [x] 1.1 Add `packages/web/src/areas/studio/panels/shared/fieldValidationLogic.ts`
      with `offeredKeys(type: BaseFieldType | Plugin): ValidationKey[]`, a
      literal table matching the spec's five rows. It imports nothing from
      `src/runtime/api.ts`.
- [x] 1.2 Add `carriedKeys(validation)` returning the keys a field's
      `validation` already holds, so the editor can render a key `offeredKeys`
      omits.
- [x] 1.3 Add `patchValidation(current, key, value)` returning the next
      `validation` object, or `undefined` when the patch would empty it.
- [x] 1.4 Write `packages/web/test/studio-fieldValidationLogic.test.ts`. Cover
      each row of the `offeredKeys` table by name, and name `checkConstraints`
      in `src/runtime/api.ts` in the describe block so a later reader finds the
      source of truth. Cover `carriedKeys`: a key `offeredKeys` omits for the
      type still appears when the field's `validation` already carries it.
      Cover `patchValidation` clearing the last key to `undefined`, not `{}`.

## 2. The editor component

- [x] 2.1 Run the design skills before writing the components, as `CLAUDE.md`
      requires for `packages/web`.
- [x] 2.2 Add `packages/web/src/areas/studio/panels/shared/FieldValidationEditor.tsx`,
      a `<details>` section whose summary counts the keys the field carries. It
      opens closed when `validation` is absent.
- [x] 2.3 Render one control per key from `offeredKeys`, union `carriedKeys`:
      `min`, `max`, `minLength` and `maxLength` as `<input type="number">`,
      `pattern` as a text input, `rule` as the existing `ExpressionInput`.
- [x] 2.4 Mark every key in `carriedKeys` that `offeredKeys` omits with an
      inline note stating the engine skips it for this field type. Keep the
      control editable and removable.
- [x] 2.5 Beside the `pattern` input, render this field's own `pattern`
      entries from `validation.issues` (`useDraft()`) — the same array
      `IssueList` already reads for this field's `entityId`. Add no separate
      check. Never block the save.
- [x] 2.6 Route every mutation through `patchValidation`, so clearing the last
      key patches `validation: undefined`.

## 3. Wiring

- [x] 3.1 Mount `FieldValidationEditor` in `FieldRow` inside
      `FieldCatalogPanel.tsx`, below the options fieldset, passing the field's
      `type` and `validation` and the row's existing `onChange`.
- [x] 3.2 Confirm the recursion into a group field's sub-fields carries the
      editor with it, since `FieldRow` renders itself.
- [x] 3.3 Add the new UI strings to
      `packages/web/src/areas/studio/catalog.ts`.
- [x] 3.4 Add the section's styles beside the panel's existing ones. Reuse the
      panel's tokens rather than adding new ones.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` inside the devcontainer and report what it
      printed.
- [x] 4.2 Run the full `bun test` with `DATABASE_URL` set. Report the pass
      count and the skip count, not the pass count alone.
- [x] 4.3 Run the antislop linter over every Markdown file this change touched.
- [x] 4.4 Run `git diff --check`, then `grep -lI $'\r'` over the changed files
      for CRLF in the worktree.
- [x] 4.5 Check in a real browser: open a `number` field and confirm the editor
      offers `min`, `max` and `rule` alone. Set `min`, save, reload, and confirm
      the value survives. Clear it and confirm the saved body carries no
      `validation` key.
- [x] 4.6 Check in a real browser: hand-author `pattern` on a `number` field
      through the JSON view, switch to the structural surface, and confirm the
      editor shows it marked rather than dropping it.
- [x] 4.7 Check in a real browser: open the validation editor on a `file`
      field and confirm it offers every key, not `rule` alone.
- [x] 4.8 Check in a real browser: type `[a-` into `pattern` and confirm the
      same "does not compile" issue appears both beside the input and in the
      field's own `IssueList`, sourced from the one live-validation pass.

      This check found a pre-existing bug in `draft/issues.ts::resolveLoc`,
      unrelated to this change's own logic: a string-form `loc` like
      `checkPatterns`' own `"fields[0].validation.pattern"` mistook
      `validation` for a field-id reference, so every `pattern` structural
      issue on every field resolved to the process-level fallback instead of
      the field, and neither `IssueList` instance ever showed one. Fixed in
      `resolveLoc`'s `default` branch (only treat the segment after a bare
      "fields" token, one with no bracketed index of its own, as a field-id
      reference) with a regression test,
      `packages/web/test/studio-issues.test.ts`. Both `IssueList` instances
      show the issue correctly now.

## 5. Documentation

- [x] 5.1 Change `docs/current-state.md`'s field catalog panel description to
      note the new validation editor.
- [x] 5.2 Change `ROADMAP.md`'s stage 27b entry: `field.validation.rule` now
      has an authoring surface, so drop that clause.
