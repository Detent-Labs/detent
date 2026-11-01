# Proposal

## Why

The Fields tab edits a field through two halves and eleven zones. It prints
a regex, a raw type word and a mono key before the author names the field.
That is finding m3 in `docs/studio-ui-concept.md`. The field matrix prints
keys, `VIS` / `REQ` / `RO` badges and a `CEL` stamp (M10).

The owner decided
the shape on 2026-10-30 in decision D4: one card in sentences. This is change
11 of stage 64. It builds on changes 9 and 7, both merged.

Twelve open points from earlier changes name this change as their owner.
This change resolves ten. They stand in `docs/decisions.md` under
MAPLABELS-10, SENTENCE-1, SENTENCE-4, SENTENCE-6, SELECTS-3, SELECTS-7,
KEYFOLLOW-9, KEYFOLLOW-11, NAMES-1 and the Settings-bodies entry of
`studio-six-tabs`. It re-points two, SELECTS-9 and SELECTS-10, to a change
of their own.

## What Changes

- The field editor becomes one card in one column. Its parts read Name,
  Kind, Choices, Asked on, Read by and More, in that order. A group adds
  Fields inside this group before More. Remove field closes the card. The two
  halves and their eleven zone headings go.
- Choices lists each choice by its name alone. A choice's stored value
  follows its name until the field's first publish. That is the rule a
  field's key already follows. The values stand in a Developer view inside
  the section.
- Asked on lists each step whose form holds the field. A row prints the
  marks Required, Read-only and Not asked as words, and the step's own
  condition as a sentence. Each row offers Open the form and Show on the
  map. The requiredness control and the Only ask this when condition stand
  under the rows.
- Read by gives each row a control that opens the place holding the
  condition. That place is the step's Ways out, the step's form, or the
  other field's card.
- More folds seven parts. They are Where values come from with the column
  mapping, Default value, Validation, the Technical marker and the move
  control. The
  preview and the Developer view close it. More opens by itself while a
  check inside it stands.
- The default value's CEL toggle goes. The CEL input stands in a
  Developer view under the value. The validation rule's builder reads as a
  sentence, with its CEL in a Developer view, like every other condition
  site. Its other-field picker numbers repeated labels.
- The Fields sub-row reads Catalog, Where fields appear and Where values come
  from. The data sources leave the Settings tab. Its sub-row then reads
  Process, What it takes in and gives back, and Access. Old addresses map
  onto the new place.
- Where values come from speaks the author's words. The source's key takes the
  caption Name. A kind picker names a data list or the cases of another
  process. The field's source picker and the column mapping's target picker
  print names.
- What it takes in and gives back lists fields by label. Its headings read
  What it takes in, What it gives back and How it can end.
- The field matrix prints labels alone in its headers and a kind word in
  place of the type. Its badges read Asked, Required and Read-only, and
  Condition replaces the CEL stamp. Its toolbar and legend drop the engine's
  words.
- Below 64rem the Fields tab's editor scrolls with the tab body, as the step
  page does (KEYFOLLOW-11). The Forms tab's legend says Group, as the palette
  does (NAMES-1).
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the field card's sections and contents, and the choice
  value rule. The Asked on rows, the Read by controls and the More fold. The
  check placement, the stacked layout, the matrix's words and the data
  sources view's words.
- `studio-process-tabs`: the three Fields views and three Settings views, the
  address map, the contract view's words.
- `studio-guided-vocabulary`: the rows for a choice, a data source kind and
  the places that name a view flag.
- `studio-field-validation-form`: the rule builder reads as a sentence with
  its CEL in a Developer view, and its other-field picker numbers repeats.
- `studio-column-mapping-form`: the target picker prints labels.
- `studio-forms-overview`: the legend's group mark reads Group.
- `studio-condition-builder`: the Developer view rule reaches the default
  value's CEL input.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: the card.
- New `panels/askedOnRows.ts` and `draft/choiceValue.ts`. A target per row
  in `panels/readByRows.ts`.
- The view move and the Read by navigation touch `panels/EntityTabs.tsx`,
  `panels/FieldsTabViews.tsx`, `panels/SettingsTab.tsx`,
  `panels/RemoveDataSourceDialog.tsx`, `routing.ts`, `draft/process-tabs.ts`
  and `screens/EditScreen.tsx`.
- The words touch `panels/DataSourcesPanel.tsx`, `panels/ContractPanel.tsx`,
  `panels/FieldMatrixGrid.tsx`, `panels/FieldMatrixPanel.tsx`,
  `panels/fieldMatrixLogic.ts` and `panels/formCardRows.ts`.
- The builders touch `panels/shared/RuleInput.tsx`,
  `panels/shared/ruleLogic.ts`, `panels/shared/DefaultValueEditor.tsx`,
  `draft/field-usage.ts`, `draft/guided-labels.ts` and
  `draft/publishedFields.tsx`.
- `packages/web/src/i18n/catalogs/studio.ts`: the keys design D12 lists.
- Tests under `packages/web/test/` for every module above.
- Docs: `.claude/rules/ui-glossary.md`, `DESIGN.md`, `docs/browser-checks.md`,
  `docs/decisions.md`, `docs/decisions-archive.md`,
  `docs/authoring-guide.md`, `ROADMAP.md`.
