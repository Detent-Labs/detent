Groups 1 through 5 land together. Task 1.2 flips `view.fields` to a union.
The tree stays red until group 5 closes.

`DraftOf` distributes that union into `Draft` and `DraftStep`. The studio's
own walks therefore stop compiling when the engine's do. Task 4.8 gates the
engine and `packages/form-ui` alone. Task 5.8 is the first full green.

## 1. The definition contract

- [x] 1.1 Add `viewNote` to `definition.ts` with `text`, `visible`, `group` and `span`
- [x] 1.1a Give `viewNote` a required `kind: "note"` literal, the union's only discriminant
- [x] 1.2 Make `view.fields` hold `z.union([viewNote, viewField])`, the note member first
- [x] 1.3 Export a `ViewEntry` type and a field-entry type guard from `definition.ts`
- [x] 1.4 Call `requireBaseLocale` on each note's `text` inside `processBody`'s superRefine, at `["workflow", "steps", i, "view", "fields", j, "text"]`. That is the shape `definition.ts:881`'s own view-ref issue uses. It routes the note's issue to the step in task 5.7
- [x] 1.5 Narrow the view-ref loop at `definition.ts:881` to field entries
- [x] 1.6 Add a test rejecting a note whose `text` omits the body's `baseLocale`
- [x] 1.6a Add a test: a note's `text` carrying the base locale and one other parses
- [x] 1.7 Add a test proving an entry with no `kind` still parses as a field
- [x] 1.7a Add a test: a mixed body (a note between two fields) parses, the note at its own index

## 2. The publish path

- [x] 2.1 Give `unionObjectMatch` a `kind` discriminant, gated on a union holding a member that declares `kind`; every other union keeps today's path
- [x] 2.1a Match every other value to the member declaring no `kind`, an unknown or non-string `kind` included
- [x] 2.1b Confirm `test/compile-validation.test.ts:222` still passes: an object-shaped, non-`lang` default raises nothing
- [x] 2.2 Add a test: publishing reports an unknown key on a note entry
- [x] 2.3 Add a test: publishing reports an unknown key on a field entry beside a note
- [x] 2.4 Add a test: publishing rejects a note entry that also carries `ref`
- [x] 2.4a Add a test: publishing reports `kind` as unknown on an entry whose `kind` names no member
- [x] 2.5 Leave the loops at `compile.ts:688`, `:872`, `:1034` and `:1097` unchanged. Each already skips a note by guarding on `ref` or reading `validation` alone
- [x] 2.5a Keep pushing a note's `visible` at `compile.ts:765` under `steps[i].view.fields[j].visible`, and push none of the three field-only flags for it
- [x] 2.5b Add a test proving the length check reports an over-long `visible` on a note at that location
- [x] 2.5c Add a test: a note beside an unwritten required-and-readonly field entry. That entry's rejection holds, and the note draws nothing of its own

## 3. CEL and view resolution

- [x] 3.1 Walk a note's `visible` at `cel/check.ts:232`, at the same `steps[i].view.fields[j].visible` location a field entry uses
- [x] 3.1a Push none of `required`, `readonly` or `validation.rule` for a note there
- [x] 3.2 Add `ResolvedViewNote` and `ResolvedViewEntry` to `runtime/api.ts`, keeping `ResolvedViewField` at `:94` as the field member
- [x] 3.2a Widen `InstanceView.fields` at `:124`, `resolveFields`' own return at `:631` and its `out` accumulator at `:653`, and `validateSubmissionData`'s return at `:923`
- [x] 3.3 Emit a resolved note from the loop at `runtime/api.ts:654`, honoring `visible`
- [x] 3.3a Carry `kind: "note"` on the resolved entry, so a caller tells the two kinds apart
- [x] 3.4 Narrow `editableFieldIds` (`:684`), `requiredFieldIds` (`:689`), the `fieldsById` map (`:926`) and `applyColumnMapping`'s input (`:737`) to field entries
- [x] 3.4b Narrow the `view.fields` readers in `test/runtime-api.test.ts`, `test/data-source-resolution.test.ts` and `test/column-mapping.test.ts` to field entries
- [x] 3.4c Read each of them through the field-entry guard task 1.3 exports
- [x] 3.5 Narrow the `viewFieldsByRef` map at `runtime/api.ts:928` to field entries
- [x] 3.6 Add a test proving a hidden note's text never appears in the resolved view
- [x] 3.6a Add a test: a field, a visible note and a field resolve as three entries, in order
- [x] 3.6b Add a test proving a note declaring no `visible` resolves, the way a field entry with none does
- [x] 3.7 Add a test proving a note leaves the accepted submission keys unchanged

## 4. The renderer

- [x] 4.0 Run the `frontend-design` skill before styling the note or building the note card
- [x] 4.0a Read `.claude/rules/design-language.md` for the tokens task 4.4 uses
- [x] 4.1 Add `ResolvedViewNote` and `ResolvedViewEntry` to `form-ui/src/types.ts`, keeping `ResolvedViewField` as the field member
- [x] 4.2 Add one field-entry type guard to `form-ui`, called by `submit.ts` and by the renderer's own branch
- [x] 4.2a Resolve a note's `text` in `resolveFieldsLocale` the way a field's label resolves, keeping the entry in the returned array
- [x] 4.2b Add a test proving `resolveFieldsLocale` returns a note with its `text` resolved to the active locale
- [x] 4.2c Narrow the three `resolveFieldsLocale` assertions in `packages/form-ui/test/locale.test.ts` to the field member. They are `:30` and `:44`, which read `.field.label`, and `:39`, which reads `.options`. `ResolvedViewNote` declares that key no more than it declares `.field`
- [x] 4.3 Render a note as a paragraph in `FieldForm.tsx`, honoring `group` and `span`
- [x] 4.3a Key every entry by a prefix, `field:<id>` and `note:<index>`. A reorder then cannot make React reuse a note's node for a field
- [x] 4.4 Style the note in `form-ui.css` with the design language's own tokens
- [x] 4.5 Narrow `editableFieldIds` in `submit.ts` to field entries
- [x] 4.5a Widen `filterToEditable` too, the wrapper `TaskScreen` and `PlayerScreen` call
- [x] 4.6 Add a test proving a submission past a note carries field keys alone
- [x] 4.6a Widen `renderFields` and `renderGrid` in `field-form.test.tsx` to `ResolvedViewEntry[]`
- [x] 4.6b Add a render case for a note between two field entries
- [x] 4.6c Add a render case for a note whose `group` names a group field, nested in that container
- [x] 4.6d Add a render case proving a note draws no input, no label element and no required marker
- [x] 4.7 Update `TaskScreen.tsx:235` and `PlayerScreen` to walk entries, not fields
- [x] 4.7a Widen `fields` to `ResolvedViewEntry[]` in `areas/app/api/types.ts` and `areas/studio/api/types.ts`, and export `ResolvedViewEntry` from `form-ui/src/index.ts`
- [x] 4.7b Narrow the form-value seeding loops at `TaskScreen.tsx:71` and `studio/screens/playerLogic.ts:2` to field entries
- [x] 4.7c Widen `FieldForm`'s `fields` prop and `FieldInput`'s `field`/`allFields` props to the entry union
- [x] 4.8 Run `bun run typecheck:engine`, then `bun run --filter './packages/form-ui' typecheck`. Both are green; `packages/web` stays red until task 5.8

## 5. The studio

- [x] 5.0 Add a `DraftViewEntry` union beside `DraftViewField` in `draft/view-layout.ts`, keep `insertViewField`'s dedup on field entries, and type `FormEditorScreen`'s `rows` on the union
- [x] 5.0a Widen `moveViewField`, `nudgeViewField` and `unplacedRefs` to `DraftViewEntry[]` in `view-layout.ts`
- [x] 5.0b Export a field-entry type guard over `DraftViewEntry` from `view-layout.ts`, the studio's counterpart to task 1.3's
- [x] 5.1 Narrow the five `view.fields` walks in `field-usage.ts` (`:33`, `:64`, `:101`, `:118`, `:161`) and the two in `view-flags.ts` (`:157`, `:258`) with that guard. Each already skips a ref-less entry, so this is a type fix, not a behavior one
- [x] 5.1a Narrow `matrixCounts`' `declaredEntries` at `fieldMatrixLogic.ts:101` to field entries
- [x] 5.1b Narrow `cellState` (`fieldMatrixLogic.ts:61`), `cellEntry` (`:68`), `applyBulkToggle` (`:199`) and `FieldMatrixGrid.tsx:227`. Each finds by `ref`, so this is a type fix too
- [x] 5.1c Update `fieldMatrix.countLine` in `i18n/catalogs/studio.ts` to read "field entries", not "view entries"
- [x] 5.1d Update `matrixCounts`' own doc comment at `fieldMatrixLogic.ts:87` the same way
- [x] 5.1e Move `configuredFieldCount` out of `StepsPanel.tsx:155` into `panels/stepsPanelLogic.ts`, beside `nextStepKey`, and narrow it there. A test can then reach it
- [x] 5.1f Widen `panelEntityCounts`' `fields?: unknown[]` parameter to `DraftViewEntry[]` (`panel-rail.ts:21-25`), narrow its `matrix` count at `:31`, and move its `:18` doc comment off "every `view.fields[]` entry"
- [x] 5.1g Grep `packages/web/src/areas/studio` for `view.fields`. Confirm each remaining site either narrows or reads `.length` alone
- [x] 5.1h Narrow the five `.required` and `.readonly` reads in `packages/web/test/studio-fieldMatrix.test.ts` (`:184`, `:185`, `:215`, `:217`, `:246`) through task 5.0b's guard. That package's tsconfig includes `test`, so these break at task 5.8
- [x] 5.1i Grep `packages/web/test` for a further read of a `view.fields[]` element's `ref`, `required`, `readonly`, `validation` or `validationMode`. The `in` form and a `.visible` read both stay legal on the union
- [x] 5.2 Add tests proving a note raises no field count and marks no field used
- [x] 5.2a Add a test proving `matrixCounts` reports a step's notes in neither `declaredEntries` nor `undeclaredCells`
- [x] 5.2b Add a `checkViewFlags` test: a note with `visible: false` draws no finding. A field entry beside it with `visible: false` and `required: true` still does
- [x] 5.2c Add two `studio-stepsPanelLogic.test.ts` cases for task 5.1e. One step holds a field entry and three notes, and reports 1. Another holds notes alone, and reports 0
- [x] 5.2d Add a `matrixCounts` case for the exception the `studio-app` toolbar requirement names. A note is the sole entry in a step that declared no `view`. That step joins `filterInertSteps`' output, so `stepCount` rises by one and `undeclaredCells` by the field count
- [x] 5.2e Retitle `packages/web/test/studio-edit-panel-rail.test.ts:181`, which reads "the total view.fields[] length across every step". Task 5.1f makes that count field entries alone. The fixture carries no note, so nothing else fails the title. Add a note to it and assert the count holds
- [x] 5.3 Add `insertViewNote` beside `insertViewField` in `view-layout.ts`, taking the seeded text and the slot
- [x] 5.3a Give it no dedup pass. A note names no catalog field, so two may sit side by side
- [x] 5.4 Add a note card and its insert control to `FormEditorScreen.tsx`
- [x] 5.4a Seed an inserted note's `text` with a non-empty entry for the body's `baseLocale`
- [x] 5.4b Add a test proving an inserted note leaves `authoredProcessBody.safeParse` succeeding
- [x] 5.4c Add the insert control's, the card's and the strip's strings to `i18n/catalogs/studio.ts`
- [x] 5.4d Key the card list at `FormEditorScreen.tsx:429` the way task 4.3a keys the renderer. Today `row.ref ?? rowIndex` would key a note by a bare index, which a field's `ref` could collide with. The prefix separates the two kinds. Two notes still key by index, which costs nothing: `LocalizedTextInput` holds no state of its own
- [x] 5.5 Give the note card a strip for its text, its `span`, its `group` and its `visible`
- [x] 5.5f Reuse the field card's own `groupKeys` select for that `group` control (`FormEditorScreen.tsx:179`). Task 5.6's keyboard route carries a move-to-group command. A strip without that control leaves a gesture an author cannot see
- [x] 5.5a Render the note's text through `LocalizedTextInput`, with a `missingTranslationWarning` call beside it
- [x] 5.5b Raise `packages/web/test/boundaries.test.ts`'s `sitesChecked` literal from 9 to 10. Name the note's text site in that test's comment
- [x] 5.5c Visit each note's `text` in `forEachLocalizedEntry` (`draft/localized-text.ts`), walking `step.view?.fields` for note entries
- [x] 5.5e Correct that walk's own doc comment (`draft/localized-text.ts:29-37`), which names `missingTranslationWarning` as a third consumer. It reads one value at a time and shares no walk
- [x] 5.5d Add a test: `collectUsedLocales` offers a locale only a note declares, and `localeGapCount` counts an untranslated note
- [x] 5.6 Reuse the existing keyboard move route for a note card
- [x] 5.7 Confirm the `requireBaseLocale` issue for a note reaches the rail through `resolveLoc`, and add no second pass
- [x] 5.8 Run `bun run typecheck` and `bun run build`. The tree is green from here

## 6. Docs and examples

- [x] 6.1 Add a note to `finance_review` in `examples/purchase-requisition.json`, a step that already declares a view
- [x] 6.1a Keep the three files `test/view-layout-hash.test.ts` pins free of notes, so no hash literal moves
- [x] 6.1b Confirm the file publishes, and that its entry count and its field count both hold
- [x] 6.1c Confirm `docs/browser-checks.md:1018` still reads 10 steps and 166 cells, and that `:1001` still reads 54 as the rail's own count. Neither number moves: `:1001` quotes no count line, so task 5.1c leaves it alone
- [x] 6.1d Update the count line quoted at `docs/browser-checks.md:1012` for task 5.1c. Its "232 cells" holds unchanged, since a note raises no declared count
- [x] 6.1e Walk `docs/browser-checks.md:953`'s form-editor check, which opens this same step. It quotes no number, so confirm it passes and record that the canvas now carries one note card
- [x] 6.2 Write the note-versus-readonly-versus-group rule into `docs/authoring-guide.md`
- [x] 6.2a Correct the guide's "The view names catalog fields" line to name both entry kinds
- [x] 6.3 Update `docs/current-state.md`
- [x] 6.3a Record under S2 in `docs/field-model-redesign.md` that the note kind shipped
- [x] 6.3b Record beside it that the table, chart, markup and tab-panel kinds stay open, each one more union member
- [x] 6.3d Correct the S2 sentence in `docs/field-model-redesign.md` reading `Change 3 carries them`, which names all five shapes. Name the note as what shipped, and correct the ordering table's row 3 on the same grounds
- [x] 6.3c Record those four kinds under "Open questions" in `docs/decisions.md`, the register S1 already uses
- [x] 6.4 Add a `ResolvedViewNote` schema to `docs/openapi.yaml`, with `kind`, `text`, `group` and `span`
- [x] 6.4b Give it `required: [kind, text]`. Neither schema sets `additionalProperties: false`, so those two keys are what keep the `oneOf` from matching a field entry against both branches
- [x] 6.4a Make `InstanceView.fields.items` a `oneOf` over `ResolvedViewField` and `ResolvedViewNote`
- [x] 6.5 Add `ViewNote.text` to the `LocalizedText` list in `.claude/rules/authoring-invariants.md`
- [x] 6.5a Update "view field" to "view entry" in that file's unknown-key depth list
- [x] 6.5c Correct that file's `checkUnsatisfiableRequiredReadonly` bullet, which excepts "a ref-less entry". A note is one, and it is now legal. Match the wording the `definition-contract` delta gives the same clause
- [x] 6.5b Widen `.claude/rules/process-contract.md:72`'s view sentence to name both entry kinds

## 7. Verification

- [x] 7.1 Run `bun run typecheck`, then `bun run build`, then `bun test` with `DATABASE_URL` set
- [x] 7.2 Pipe that full `bun test` log through `scripts/gates/silent-green.sh` and read the skip count
- [x] 7.3 Run the prose and whitespace gates over every Markdown file touched here
- [x] 7.4 Check a note in a browser: order, group nesting, the hidden case, no tab stop
- [x] 7.5 Check the note card in a browser: insert, write its text, move, remove
- [x] 7.5a Confirm the checks rail stays populated and the palette still offers every catalog field
- [x] 7.6 Apply `development-toolchain`'s split rule to tasks 7.4, 7.5 and 7.5a
- [x] 7.6a Name the assertion covering each observable half, and move the rest into `docs/browser-checks.md`
