## 1. The schema and the two publish-time checks

- [x] 1.1 Shrink `baseFieldType` in `src/schema/definition.ts` to `string`,
      `number`, `boolean`, `list`, `file`, `group`, and verify `bun run
      typecheck` reports every site that still names a removed member.
- [x] 1.2 Add the `fieldFormat` and `fieldControl` enums beside it, with
      `format` and `control` as optional keys on `fieldDef`; verify a body
      declaring both keys parses and one declaring `format: "phone"` does not.
- [x] 1.3 Add the allowed-pairs table as an exhaustive
      `Record<BaseFieldType, {formats, controls}>` beside `JS_TYPE`, matching
      design.md Decision 2; verify a missing type member is a compile error.
- [x] 1.4 Add the four format value checks (`date` with a calendar round trip,
      `datetime`, `integer`, `email` with the WHATWG regex) as one exported
      predicate; verify `2026-02-30` fails and `2026-02-28` passes.
- [x] 1.5 Update `typeMatches` to take the field rather than its `type`, run the
      format check after the JS-shape check, and let `expectedTypeLabel`
      return the format name where one is declared; verify a unit test covers
      both halves and the plugin-envelope opaque case.
- [x] 1.6 Add `checkFieldFormatControl` to `checkFieldTree` in
      `src/schema/compile.ts`, rejecting a disallowed pair and a literal
      `default` the field's format refuses; verify one test per rejection,
      each asserting the issue's `loc`.
- [x] 1.7 Update `checkColumnMapping`'s type rule from `select` to `string`;
      verify a `list` field declaring `columnMapping` still fails the publish.

## 2. The CEL type and the engine callers

- [x] 2.1 Update `celType` in `src/cel/check.ts` to take the field, map the six
      types per design.md Decision 5, and report `int` under
      `format: "integer"`; remove the `ponytail:` comment at `:53-56` that
      names this fix. Verify `data.anzahl % 2 == 0` type-checks against a
      marked field and fails against an unmarked one.
- [x] 2.2 Update `dataSchema`, `contractFieldSchema` and `fieldTypeById` in the
      same file to pass the whole field; verify the CEL suite passes.
- [x] 2.3 Update the `celType` call in `src/engine/migration.ts`, and verify a
      migration transform onto an `int` field reports the type disagreement.
- [x] 2.4 Update `isNonScalarFieldType` in `src/engine/definitions.ts` so it reads
      `list` and `group`; verify a `valueFromField` naming a `list` field still
      fails the publish.
- [x] 2.5 Update the `typeMatches` call sites in `src/engine/outbox.ts` and the
      three in `src/runtime/api.ts` to pass the field; verify an
      `Action.output` value a format refuses lands in `droppedTargets`.

## 3. Definitions, docs and the engine suites

- [x] 3.1 Rewrite every field declaration under `examples/` per design.md
      Decision 8's table; verify each of the six files publishes through the
      existing example test.
- [x] 3.2 Update the engine suites naming a removed member (`cel`,
      `column-mapping`, `compile-validation`, `data-list-columns`,
      `data-source-resolution`, `http-data-lists`, `http`,
      `instance-query-cross-process`, `instance-query-source`,
      `localized-text`, `runtime-api`, `validate`); verify the full suite is
      green before the web work starts.
- [x] 3.3 State the three keys in `docs/authoring-guide.md`, with D17's rule
      for a checkbox list and D24's two integer consequences; verify the guide
      names no removed type member.
- [x] 3.4 Update `docs/current-state.md`, and record the item list S1 defers as
      an open question in `docs/decisions.md`; verify each passage naming a
      field-model symbol still matches the code.
- [x] 3.5 Rewrite the "No Long text field type" entry in
      `docs/decisions.md`, which `control: "multiline"` reverses; verify the
      entry names this change and states what shipped.
- [x] 3.6 Confirm the three wording-only deltas need no code:
      `data-source-resolution` (`heldValuesOf` branches on the value shape),
      `instance-data-query` (the read checks values, not declared types) and
      `authored-content-localization`; verify each by reading the named
      function and recording that it needs no edit.
      Verified. `heldValuesOf` (`src/runtime/api.ts:531`) branches on
      `Array.isArray`. `isDataScalar` (`:1455`) checks the value, never a
      declared type. The localization invariant reads `FieldOption.label` on
      any field carrying `options`. None of the three needs an edit.

## 4. The renderer

- [x] 4.1 Invoke `/frontend-design:frontend-design` and read
      `.claude/rules/design-language.md` before drawing the textarea, the radio
      group, the checkbox group and the two studio pickers; verify the notes
      land in the change before task 4.3 starts.
- [x] 4.2 Add `format` and `control` to `WireField` in
      `packages/form-ui/src/types.ts`, which lists the wire field's keys by
      hand; verify `bun run typecheck` accepts a renderer reading either key.
- [x] 4.3 Rewrite `FieldForm`'s widget switch in `packages/form-ui` to read
      options, then `control`, then `format`, then `type`, per design.md
      Decision 7; verify one render test per branch.
- [x] 4.4 Add the `<textarea>`, the radio group, the boolean radio pair and the
      checkbox group, each inside a `<fieldset>` with a `<legend>`; verify a
      test asserts `aria-required`, `aria-invalid` and `aria-describedby` on
      the fieldset.
- [x] 4.5 Add the yes and no locale record beside `issue-messages.ts`'s own
      catalog; verify the German locale renders its own two labels.
- [x] 4.6 Make an inapplicable `control` fall back to the type default; verify a
      `control: "radio"` string field with no options renders a text input.

## 5. The studio

- [x] 5.1 Shrink `FIELD_TYPE_LABELS` to six entries and add label records for
      the format and control members; verify the exhaustive-record pattern
      makes a missing entry a compile error.
- [x] 5.2 Add the format picker and the control picker to the field catalog
      panel, each offering the selected type's allowed members and an empty
      entry; verify a `file` field shows neither picker.
- [x] 5.3 Drop a `format` or `control` the new type refuses when the developer
      switches the type, naming the drop first; verify a logic test covers the
      drop and the notice.
- [x] 5.4 Update `mintField.ts`'s `baseTypeForPaletteKind` to return a type and
      an optional format, since its `date` palette kind now mints
      `{type: "string", format: "date"}` and its `choice` kind mints
      `{type: "string"}`; verify a dropped date field renders a date input.
- [x] 5.5 Update `field-preview.ts`'s sample values,
      `defaultValueLogic.ts`'s `literalControlKind` and its reference/file
      carve-out, `fieldValidationLogic.ts`'s `offeredKeys`,
      `columnMappingLogic.ts`'s `select` test, and the
      `.default-value-multiselect` class in the studio stylesheet; verify each
      module's own test file passes.
- [x] 5.6 Add the `int` arm to `celLiteral` in `conditionLogic.ts` and the date
      and datetime value editors to the condition builder; verify the builder
      writes `data.prioritaet > 3` for an integer operand.
- [x] 5.7 Update `ruleLogic.ts` and `migrationPlanLogic.ts` for the new
      `celType` signature; verify the migration-plan form reports a `double`
      source onto an `int` target.
- [x] 5.8 Update the web suites naming a removed member, including
      `studio-fieldTypeLabels.test.ts` and `studio-fieldPreview.test.ts`, which
      both iterate `baseFieldType.options`; verify `bun test` inside
      `packages/web` is green.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` and report what it printed.
- [ ] 6.2 Run `bun run build` and report what it printed.
- [ ] 6.3 Run the FULL `bun test` with `DATABASE_URL` set, never a single-file
      rerun, and pipe it through `scripts/gates/silent-green.sh`; report the
      pass count and the skip count.
- [ ] 6.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      and `sh scripts/gates/whitespace.sh < /dev/null`; report both verdicts.
- [ ] 6.5 Check one field per format member and per control member in a real
      browser, since a green suite sees no rendered widget; record what stays
      manual in `docs/browser-checks.md`.
- [ ] 6.6 Reseed the developer database, since a stored draft carrying a removed
      type value no longer reads; verify the studio lists its drafts again.
