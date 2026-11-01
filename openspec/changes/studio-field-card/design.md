# Design

## Context

See `proposal.md` for the motivation. The Fields tab's Catalog view holds an
entity rail beside the panel in `panels/FieldCatalogPanel.tsx`. It draws two
halves over the selected field. Eleven zones stand in two columns. The zones
map checks through `panels/fieldCheckZone.ts`.

The module
`panels/readByRows.ts` lists the readers of a field as place and sentence.
The module `draft/field-usage.ts` lists the steps whose form holds the field and the
flag keys their entries carry.

The data sources stand on the Settings tab's Where values come from view
(`panels/EntityTabs.tsx::DataSourcesTab` inside `panels/SettingsTab.tsx`).
The concept's decision D4 puts them on the Fields sub-row, and change 9's
design left that move to this change. The contract editor
(`panels/ContractPanel.tsx`) and the field matrix
(`panels/FieldMatrixGrid.tsx`, `panels/FieldMatrixPanel.tsx`) still print
keys, type words and three-letter badges.

The step page's accordion (change 10) sets the pattern this card follows.
That is one column capped at 52rem, sentence summaries, the Developer view
last. The owner prefers guided, form-like layouts, measured on 2026-10-30.
Nothing machine-shaped stands outside a Developer view.

The definition contract stays. A field's `options[]` keep `value` and
`label`. A data source keeps `key`, `type` and `config`. Nothing in
`src/schema/definition.ts` changes.

## Goals / Non-Goals

**Goals:**

- One card per field, in sentences, with More folded.
- A choice named once, its value following it until the first publish.
- Every row the card lists offers a way to the place it names.
- The data sources beside the fields, in the author's words.
- The matrix, the contract view and the rule builder without engine words.
- The Fields tab scrolls with the tab body below 64rem.

**Non-Goals:**

- A per-step validation override control (stage 43) stays unbuilt. The card
  states nothing about it.
- The access lists keep their raw id inputs. No change in stage 64 owns them.
- The condition builder's expansion (change 16) stays out.
- The plugin envelope's generated form and its raw JSON escape hatch stay as
  they are. Only its legend and its kind names change.
- The step page's time-limit and mapping rows (SELECTS-9, SELECTS-10) stay.

## Shape brief (`/impeccable shape`, the Fields tab)

The shape interview ran with no human in the loop. Every assumption below
stands marked as one, and the concept's decision D4 answers most of them.

1. **Job and audience.** A process author, on the Fields tab, names a field
   and says what it asks and where. The mode is Operate. The author is
   mid-task, between the Steps tab and the form editor.
2. **Outcome and proof.** The author names a field, picks its kind and types
   its choices. Then the author sees which steps ask for it. Success means no
   key, no CEL and no type word on the page until a Developer view opens. The
   evidence is the nine example definitions. Their catalogs hold 3 to 22
   fields with choices, data sources and rules.
3. **Selected direction.** The step page's accordion is the visual authority.
   The card takes its column, its heading style and its Developer-view-last
   rule. The thesis is that the field reads top to bottom as one sentence.
   That sentence runs name, kind, choices, asked on these steps, read by
   these rules, more.
   Asked on is the focal moment, where the author sees the field's place in
   the process. Assumption: no accordion inside the card, since a field is
   small and one field is already the one subject.
4. **Scope and boundaries.** Shippable code, for the Catalog view and the two
   sibling views. Untouched: the entity rail, the form editor, the step
   page. Anti-goals: a side inspector, dense property rows, machine chips.
5. **States and ranges.** A catalog of 0, 1, 22 fields. A field on 0, 1 or 13
   steps. A field with 0, 3 or 12 choices. A field 0 or 5 rules read. A
   German label 40% longer than its English one.
6. **Interaction and layout.** One column, flush left, capped at 52rem, the
   rail at 20rem beside it. Sections ruled apart by a hairline. Rows in the
   register style: name, marks as words, a sentence under it, authoring
   commands at the row's trailing edge. More is a native disclosure.
7. **Constraints and open decisions.** English only. The card writes the
   draft on every change, as today. Builders keep their incomplete rows. The
   builder must not invent a word: every string is in D12.

## Decisions

### D1. The card's sections and their order

The card reads, top to bottom:

1. **Name**: the `<h3>` printing the field's name stays as the card's name
   line. Its comment gives the reason. Under it stand the label input
   captioned "Name" and the translation badge beside it. The rewrite line
   follows, then the description captioned "Description". No section heading
   stands between the name line and the inputs.
2. **Kind**: the kind picker captioned "Kind", then the kind's note sentence
   under it. The Technical marker leaves this section for More.
3. **Choices**: see D2. Shown for a field whose `control` is a picker
   (`select`, `radio` or `checkboxes`). Shown too for a `string` or `list`
   field with no `format`, and for any field already carrying `options` or a
   `dataSource`. A date, an email or a person field with none draws no
   Choices section.
4. **Asked on**: see D3.
5. **Read by**: see D4. A group has no such section.
6. **Fields inside this group**: a group field's add control, as today.
7. **More**: see D5.
8. **Remove field**: the ghost control, below a hairline, as today.

Sections 2 to 7 each carry a heading in the Title style (0.85rem, weight
800, 0.08em) and a 1px hairline above. Kind is the exception: it follows the
Name inputs with no rule. A section holding a check prints the check's
sentences under its heading, in the refusal tone, through `IssueItems`. The
heading takes the refusal tone too, as the zones do today.

Alternative considered: an accordion like the step page. Rejected, since a
field holds a tenth of a step's controls. Folding would hide Asked on, the
section the author reads first.

### D2. Choices as names, with a value that follows

A choice row holds one `LocalizedTextInput` for the name and a Remove
control in the authoring-command style. No value input stands in the row.
The section ends with "+ Add a choice".

A new module `draft/choiceValue.ts` decides the value:

- `nextChoiceValue(currentValue, priorName, newName, baseLocale, taken, locked)`
  mirrors `fieldCatalogLogic.ts::nextFieldKey`. It derives through
  `deriveKey` and `dedupeKey` over the sibling values. A value the prior name
  derived follows the new name. So does an empty value. A hand-set value
  stays.
- The flag `locked` is true for a choice whose value the base version's copy
  of this field carries. A choice added since the publish follows its name.
  `draft/publishedFields.tsx` gains `collectOptionValues(body)`, a
  `Map<fieldId, ReadonlySet<string>>`, and the provider carries it beside the
  ids. A new hook `usePublishedOptionValues()` reads it. While the base
  version loads, every non-empty value counts as locked, the safe side.
- When a derived value moves, the same mutation rewrites the field's own
  `default` where it equals the old value. For a `list` field it rewrites
  the matching member. No other reader moves: a guard literal stays, as
  Risks records.
- A new choice mints `{ value: "", label: seeded }`. The first keystroke sets
  the value.

The section's Developer view (`<details>`, closed) lists each choice's value
in an editable mono input captioned "Stored value". One sentence stands
under the list. It reads "The value follows the name until the first
publish." while no choice holds a lock. It reads "This field is in a
published version. The name no longer sets its values." while any choice
holds one.

A field bound to a data source draws the sentence "The choices come from
{source}." in place of the rows. The add control stays out. `{source}` is
the data source's name (D7). The sentence "Pick another source under More."
follows it.

A field with no choice and no source draws "No choice yet, so a participant
types freely. Add one to offer a list instead." above the add control.

### D3. Asked on

A new pure module `panels/askedOnRows.ts` exports
`askedOnRows(draft, fieldId, contentLocale): AskedOnRow[]`, one row per step
whose view holds the field, in draft order:

```ts
interface AskedOnRow {
  stepId: string;
  stepLabel: string;        // stepText(), "(unnamed step)" when unlabelled
  marks: ("required" | "readonly" | "hidden")[];
  sentence?: string;        // the visible expression as a readerSentence
}
```

`required` and `readonly` mark a literal `true`. `hidden` marks a literal
`visible: false` and prints "Not asked". A `visible` expression yields
`sentence` through `readerSentence` over `buildOperands` with no child. A
`required` or `readonly` expression yields no mark and no sentence. The
form editor's strip owns those two expressions, and the matrix prints
them as Condition.

A row draws the step's label first. The marks follow as the words Required,
Read-only and Not asked in the body face. The sentence stands on its own line
in slate. Two authoring commands close the row, "Open the form" through
`onOpenForm` and "Show on the map" through `onShowStep`. The function
`fieldUsage` in `draft/field-usage.ts` stays for its other callers and drops
its `step.key` fallback. The row type `FieldUsageRow` keeps its shape.

Under the rows, in order:

- the checkbox "Required on every step that asks for it". It writes through
  `applyRequiredOverride`, as today's "Ask for this" does, with its
  divergence note. That note takes the note style, and the box shows
  indeterminate while the steps disagree;
- the sub-heading "Only ask this when" and the `ConditionInput`, wired as
  today, with the divergence notes. SENTENCE-6 closes because each row
  above already reads its own condition as a sentence.

The rows name every step a write reaches, so no "Writes to:" line stands
under them. A group field keeps its rows and commands. It shows neither the
checkbox nor the condition, since a group has no value.

With no row the section reads "No step asks for this field yet." It offers
"Put this field on a step", as today's empty state does. The checkbox and
the condition input stay out then.

### D4. Read by rows reach their place

`readByRows.ts` adds a `target` to each row:

```ts
type ReadByTarget =
  | { kind: "wayOut"; stepId: string; pathId: string }
  | { kind: "form"; stepId: string }
  | { kind: "step"; stepId: string }
  | { kind: "field"; fieldId: string };
```

A guard yields `wayOut`. A view flag, a note's condition and a step rule
yield `form`. A time limit and a child mapping yield `step`. A field rule
and a default yield `field`. The fallback places yield no target, and their
row draws no control.

Each row with a target draws the authoring command "Open". `FieldsTab`
receives `onOpenPlace(target)`:

- `wayOut` and `step` call `EditScreen`'s `openTabFromRow({ tab: "steps",
  stepId, pathId })`. The step page then opens on that step with the way out
  marked.
- `form` calls `openFormEditor(stepId, "steps")`.
- The pure `placeAction(place)` in `draft/process-tabs.ts` decides these
  three, and `EditScreen` runs its answer.
- `field` selects that field in the rail and opens its More fold. `FieldsTab`
  holds `openMoreFor: string | undefined`. The card reacts to it in an
  effect, since a field's own rule targets the already-mounted card. Then
  `FieldsTab` clears it once the card has opened More. A later manual close
  then holds.

### D5. More

More is one `<details>` whose summary reads "More" in the Title style. It
holds, in order, each under a sub-heading in the Legend style:

1. "Where values come from": the source picker, captioned "Values come
   from". Its first option reads "Nowhere: this field lists its own choices". Its
   other options print each source's name (D7). The column mapping follows
   when `showsColumnMapping` holds, with its target picker printing labels.
2. "Default value": `DefaultValueEditor`, per D9.
3. "Validation": `FieldValidationEditor`, with the rule per D10.
4. The Technical checkbox, labelled "Technical: the process fills this in by
   itself" (D12), with its confirmation as today.
5. "Move this field to": `MoveFieldControl`.
6. "How it will look": the preview, inside its own `<details>` as today.
7. "Developer view": the key input and its notice, then the custom type's
   `PluginEnvelopeEditor` for a plugin-typed field. One `<details>`.

More stands closed on open. It opens by itself while a check inside it
stands, as the key's Developer view does today. The author's own toggle
holds otherwise. `fieldCheckZone` keeps its six zones. The card maps `asks`
to the name line, `kind` to Kind and `values` to Choices. It maps `default`,
`validation` and `columnMapping` to More. A check `fieldCheckZone` cannot
place stands at the card's top, as today.

Two checks reach a control inside More while their sentence stands outside
it. A check `namesFieldKey` places prints beside the name line. It opens
More and its Developer view, as `keyChecked` opens the key's Developer view
today. A check on `technical` prints under Kind and opens More, since the
Technical checkbox stands there.

### D6. The views move

`routing.ts`: `FieldsView = "catalog" | "matrix" | "sources"` and
`SettingsView = "process" | "contract" | "access"`. `FIELDS_VIEWS` and
`SETTINGS_VIEWS` follow. `RETIRED_TAB_TARGET.dataSources` and
`PANEL_VIEW_TARGET.dataSources` read `{ tab: "fields", view: "sources" }`.
A `settings/sources` address, which `tabHoldsView` no longer admits, falls to
the Settings tab's first view, as any unknown view does. `process-tabs.ts`'s
`dataSource` case returns `{ tab: "fields", view: "sources" }`.

`FieldsTabViews.tsx` adds the third view body, mounting `DataSourcesTab`
with `visible && view === "sources"`. `SettingsTab.tsx` drops its sources
body and its `token` use for it. The sub-row labels: `fieldsViews.sources`
"Where values come from"; `settings.sources` goes.

### D7. Where values come from, in the author's words

`DataSourcesPanel.tsx`:

- The panel heading prints the source's name, or "(unnamed source)".
- The key input takes the caption "Name" and the body face. The engine
  matches nothing by a data source key: fields bind by id, and CEL reads no
  source. The reserved-namespace rule stays a publish check.
- The envelope's legend reads "What kind of source". A new
  `dataSourceKindLabel(type)` in `draft/guided-labels.ts` names each
  registered type for the picker. The entry `db.list` reads "A data list an
  operator keeps". The entry `instance.query` reads "Cases of another
  process". A type the table does not name prints its registry type, as the
  assignment picker does.

`EntityTabs.tsx::DataSourcesTab`'s rail rows read the name or "(unnamed
source)". `panelsScreen.unnamedDataSource` changes to "(unnamed source)".
The field's source picker (D5) reads the same words. The dialog
`RemoveDataSourceDialog` prints a named source in the body face, no longer
in `<code>`. The name is no word the engine matches.

### D8. What it takes in and gives back

`ContractPanel.tsx` drops its "Contract" heading. The checkbox reads "Other
processes can call this one". The three fieldsets read "What it takes in",
"What it gives back" and "How it can end". The field checkboxes print the
field's label at the content locale, or "(unnamed field)". An outcome name
stays mono: a caller's guard reads `child.outcome == "approved"`, so the
engine matches it exactly. The input's placeholder reads "Name of an
ending", its control "+ Add an ending", a row's "Remove".

### D9. The default value's CEL in a Developer view

`DefaultValueEditor.tsx` drops its two toggle words. The literal input
stands first. A `<details>` labelled "Developer view" follows, holding the
CEL input captioned "CEL expression". It stands closed while the default is
a literal or absent.

While the default is an expression, the note "A rule computes this
default." replaces the literal input. The disclosure stands open then. Typing
CEL writes the expression. Clearing the CEL text drops the key, and the
literal input returns. "Clear default" stays beside the literal input.

The literal picker over a field's `options` prints each choice's name, in
its select and its checkbox branches. It reads the name through
`resolveDraftLocalizedText`, or prints "(unnamed choice)". The option's value stays `opt.value`, so the written
`default` stays the stored value.

### D10. The rule builder reads as a sentence

`RuleInput.tsx` takes `ConditionInput`'s shape: the `RuleBuilder`, then the
sentence in the note style, then a closed `<details>` "Developer view"
holding the CEL input. The "Writes" readout and the toggle go. The sentence
comes from a new `ruleLogic.ts::ruleSentence(condition, operands, stored)`.
It joins the complete rows' clauses by "and", through the same
`condition.clause.*` phrases. A field-valued row prints the other field's
label as its value. The empty states read as `conditionSentence`'s
do, with `ruleBuilder.empty` for no row and nothing stored.

`buildRuleOperands` numbers repeated labels among the other fields through
`optionText.ts::numberRepeats`, the helper the condition picker already
uses, in catalog order. "this answer" stays first and takes no count.

### D11. The matrix's words

- `fieldMatrixLogic.ts::FieldMatrixRow` gains `kind: string` and
  `unmatched: boolean` from `fieldKindWord` and `isUnmatchedKind`; `type`
  goes. The row header prints the field's label (`resolveDraftLocalizedText`,
  else "(unnamed field)") and the kind word, mono only when `unmatched`.
- The column header prints the step's label alone; the key span goes.
- `FLAG_LETTER` goes. A badge prints `t(FLAG_LABEL_KEY[key])`: Asked,
  Required, Read-only. The badge grid's columns read `repeat(3, 1fr)`. In a
  shrink-to-fit header, three `1fr` tracks each take the widest track's
  max-content. That is the shared width the spec asks for. The badge's
  width drops to `100%`.
- The cells' checkbox grid keeps `repeat(3, 1.75rem)`. A badge keeps its
  slot order over the checkboxes and no longer its pixel column. The
  bulk-toggle requirement drops that pixel claim.
- The CEL stamp reads `fieldMatrix.markCondition` "Condition". The source
  stays in the title and in the muted span, mono, as today, since it is a
  Developer-facing hover.
- `formEditor.markCel` goes, with no reader left.
- The toolbar and legend keys take D12's texts.

### D12. Catalog keys

Added:

| Key | Text |
|---|---|
| `fieldCard.nameLabel` | Name |
| `fieldCard.kindHeading` | Kind |
| `fieldCard.choicesHeading` | Choices |
| `fieldCard.askedOnHeading` | Asked on |
| `fieldCard.moreHeading` | More |
| `fieldCard.choiceNamePlaceholder` | Name of the choice |
| `fieldCard.addChoice` | + Add a choice |
| `fieldCard.removeChoice` | Remove |
| `fieldCard.choiceValueLabel` | Stored value |
| `fieldCard.choiceValueFollows` | The value follows the name until the first publish. |
| `fieldCard.choiceValuePublished` | This field is in a published version. The name no longer sets its values. |
| `fieldCard.choicesFromSource` | The choices come from {source}. |
| `fieldCard.choicesFromSourceNote` | Pick another source under More. |
| `fieldCard.choicesEmpty` | No choice yet, so a participant types freely. Add one to offer a list instead. |
| `fieldCard.hiddenMark` | Not asked |
| `fieldCard.unnamedChoice` | (unnamed choice) |
| `fieldCard.openForm` | Open the form |
| `fieldCard.openPlace` | Open |
| `fieldCard.requiredEverywhere` | Required on every step that asks for it |
| `fieldCard.noSourceOption` | Nowhere: this field lists its own choices |
| `fieldCard.technicalLabel` | Technical: the process fills this in by itself |
| `fieldCard.kindNoteWithChoices` | One pick from the choices below. |
| `fieldMatrix.markCondition` | Condition |
| `fieldMatrix.rowKindLabel` | Kind |
| `fieldsViews.sources` | Where values come from |
| `dataSources.nameCaption` | Name |
| `dataSources.kindLegend` | What kind of source |
| `dataSourceKind.db.list` | A data list an operator keeps |
| `dataSourceKind.instance.query` | Cases of another process |
| `dataSourceKind.static` | A list typed into this process |
| `defaultValue.computedNote` | A rule computes this default. |
| `defaultValue.developerView` | Developer view |
| `formsTab.legendGroup` | Group |

Changed:

| Key | Text |
|---|---|
| `fieldCatalog.usedInEmpty` | No step asks for this field yet. |
| `fieldCatalog.conditionNoSteps` | removed |
| `fieldCatalog.requiredNoSteps` | removed |
| `fieldCatalog.readByEmpty` | No condition reads this field. |
| `panelsScreen.unnamedDataSource` | (unnamed source) |
| `contract.callableCheckbox` | Other processes can call this one |
| `contract.inputFieldsLegend` | What it takes in |
| `contract.outputFieldsLegend` | What it gives back |
| `contract.outcomesLegend` | How it can end |
| `contract.newOutcomePlaceholder` | Name of an ending |
| `contract.addOutcome` | + Add an ending |
| `contract.removeOutcome` | Remove |
| `ruleBuilder.empty` | No rule yet: every answer passes. |
| `fieldMatrix.hideInertToggle` | Hide steps with no form |
| `fieldMatrix.countLine` | {declared} placements · {fields} fields × {steps} steps · {cells} empty cells |
| `fieldMatrix.legendBulk` | A badge sets the whole column or row it sits on. |
| `fieldMatrix.legendDefault` | An unchecked box writes nothing. |
| `fieldMatrix.legendCel` | Condition means a rule decides in place of a fixed yes or no. |
| `fieldMatrix.legendBlank` | A dash marks a field this step's form does not hold. |
| `fieldMatrix.legendFlagged` | A marked cell stands in Checks. |
| `fieldMatrix.legendTechnical` | Technical means the process fills the field in by itself. |
| `fieldMatrix.legendColors` | Each box's color names its mark: |
| `fieldMatrix.columnInertNote` | No form |
| `fieldMatrix.hatchedCell` | No form on this step |
| `fieldMatrix.emptyNoFields` | This process has no field yet, so there is nothing to line up. |
| `fieldMatrix.emptyNoColumns` | Hide steps with no form is on, and it leaves no step to show. Turn it off to see them. |
| `fieldMatrix.gatedNotWritten` | Nothing fills this field before this step, so the mark would strand the participant. |
| `fieldMatrix.gatedTechnical` | A technical field cannot take this mark. |
| `fieldMatrix.bulkSetColumn` | Turns this on for every field on step {name}. Cells it writes: {total}. Already on: {set}. |
| `fieldMatrix.bulkClearColumn` | Turns this off for every field on step {name}. Cells it writes: {total}. |
| `fieldMatrix.bulkSetRow` | Turns this on for {name} on every step that asks for it. Cells it writes: {total}. Already on: {set}. |
| `fieldMatrix.bulkClearRow` | Turns this off for {name} on every step that asks for it. Cells it writes: {total}. |

Removed: `fieldCatalog.whatAsksHeading`, `fieldCatalog.whatKindHeading`,
`fieldCatalog.definitionHalfLabel`, `fieldCatalog.effectHalfLabel`,
`fieldCatalog.usedInHeading`, `fieldCatalog.askForThisHeading`,
`fieldCatalog.requiredLabel`, `fieldCatalog.labelLabel`,
`fieldCatalog.optionValuePlaceholder`, `fieldCatalog.optionLabelPlaceholder`,
`fieldCatalog.removeOption`, `fieldCatalog.addOption`,
`fieldCatalog.technicalLabel`, `fieldCatalog.showOnCanvas` stays,
`fieldMatrix.rowTypeLabel`, `fieldMatrix.technicalRowMark` stays,
`dataSources.heading`,
`formEditor.markCel`, `condition.celReadout`, `condition.celEmpty`,
`defaultValue.editAsCel`, `defaultValue.useValue`, `contract.heading`,
`dataSources.keyCaption`, `dataSources.pluginLegend`, `settings.sources`,
`formsTab.legendSection`, `fieldCatalog.requiredScopeNote`,
`fieldCatalog.conditionScopeNote`. The ones marked "stays" keep their text.

### D13. The stacked layout below 64rem

`EntityTabs.tsx`'s `layout` reads, under `NARROW`, `height: "auto"`,
`overflow: "visible"` and rows `"auto auto"`; `editor` reads `overflowY:
"visible"` there and keeps its padding. The rail keeps its 20rem cap.

The `layout` also reads `flex: "0 0 auto"` under `NARROW`, as the Steps
tab's grid does. A zero flex basis would hold the grid at the view's height.
`FieldsTabViews.tsx`'s `view` style gains `overflowY: "auto"`,
`overscrollBehavior: "contain"`, `padding: focus.reach` and `scrollPadding:
focus.reach`, the four keys `SettingsTab.tsx`'s `view` carries, which
`studio-scrollBoxRingRoom.test.ts` demands of every studio scroll box. The
view body then scrolls as the step page's tab body does. At 1024px the card
scrolls with the view. The label and Read by stand in one scroll.

### D14. Tests

- `packages/web/test/studio-choiceValue.test.ts`: derivation, dedupe, the
  hand-set value, the per-choice lock, a choice added to a published field,
  the default rewrite.
- `packages/web/test/studio-askedOnRows.test.ts`: marks, the sentence, a
  conditional requiredness with no mark, the unnamed step, draft order.
- `studio-readByRows.test.ts`: a target per place kind, none for the
  fallbacks.
- `studio-fieldCatalogPanel.test.tsx`: the section order and no half label.
  The choice rows without a value input, and the Developer view's value
  inputs. The Asked on row's words and commands, and the Read by row's Open.
  More closed, and opened by a check. The literal-text test
  (`studio-panels-literal-text.test.ts`) stays green.
- `studio-ruleLogic.test.ts` (or the existing rule test): `ruleSentence` and
  the numbered picker. New `studio-ruleInput.test.tsx`: the sentence and the
  Developer view, no "Writes".
- New `studio-defaultValueEditor.test.tsx`: the disclosure, the computed
  note, choice names in the picker and no value as text.
- `studio-fieldMatrix*.test.ts*`: labels in headers, the kind word, the
  badge words, "Condition", the legend's seven entries.
- `studio-routing.test.ts`, `studio-processTabs.test.ts` and
  `studio-subRow.test.tsx`: the address map and the ids. New
  `studio-fieldsTabViews.test.tsx`: the three view ids and `DataSourcesTab`
  under `sources`. New `studio-settingsTab.test.tsx`: three ids and no
  `DataSourcesTab`.
- `studio-contractPanel.test.tsx` (new): the words and the labels.
- `studio-dataSourcesPanel.test.tsx` (new): Name, the kind names, "(unnamed
  source)". `studio-removeDataSourceDialog.test.tsx`: the body-face name.
- `studio-vocabulary.test.ts`, `studio-formCardRows.test.ts` and
  `studio-formsTab.test.tsx`: Group. `studio-fieldMatrixBadge.test.ts`: the
  badge grid's tracks.
- `studio-guidedSurfaceStyle.test.ts`: the stacked layout's values.

### D15. Docs

- `.claude/rules/ui-glossary.md`: the sub-row row reads three Fields views
  and three Settings views. New rows "field card" (the Catalog view's editor
  over the selected field, in sections) and "card section". "Read by zone"
  becomes "Read by section". The Developer view row names the card's More.
  The Settings tab row drops the data sources. The "data sources" row moves
  to the Fields tab.
- The glossary's author's-word table gains the two rows the
  `studio-guided-vocabulary` delta adds.
- `DESIGN.md`: the Field Matrix entry reads "A column header takes the Legend
  style over the step's label". It says the badges print words. A new "The
  Field Card" entry stands under Components. It names one column at 52rem
  and Title-style section headings over a hairline. It names register rows
  with authoring commands, and More as a native disclosure.
- `docs/browser-checks.md`: a new entry "The field card (`studio-field-card`)"
  with the checks of tasks 6.7 to 6.11. Stale passages get a rewrite in
  place. Those name the two halves or a retired zone heading. Others name
  the Settings tab's Where values come from, or the matrix's keys.
- `docs/decisions.md`: MAPLABELS-10, SENTENCE-1, SENTENCE-4, SENTENCE-6,
  SELECTS-3, SELECTS-7, KEYFOLLOW-9, KEYFOLLOW-11 and NAMES-1 move to
  `docs/decisions-archive.md` word for word, each with a resolution line.
  The six-tabs Settings-bodies entry shrinks to the access lists, since
  Sources and the contract ship here. SELECTS-9 and SELECTS-10 lose their
  change-11 pointer and read "needs its own change". A section "Open from
  studio-field-card" takes this change's findings.
- `docs/authoring-guide.md`: the options paragraph gains two sentences. The
  studio derives a choice's value from its name until the first publish. A
  key follows a label the same way.
- `ROADMAP.md`: item 11 appends "Shipped 2026-11-01." and the status line
  reads "CHANGES 1 TO 11 AND 14 DONE, REST NOT STARTED".
- `docs/studio-ui-concept.md` keeps its text as the dated record.

## Risks / Trade-offs

- [A choice rename moves a value a guard compares] → A guard compares an
  option value as a literal. The rewrite covers keys
  alone. The Developer view shows the value. The lock stops the move after
  publish. Recorded as an open point with an upgrade entry: rewrite literals
  too.
- [A moved value reads as two change-list rows] → The change list pairs
  options by `value`, its base rule. The rule stays. The Publish dialog shows both rows, and the author reads the
  rename as such.
- [Word badges stand wider than the 1.75rem checkbox columns beneath] →
  Only the slot order aligns. The bulk-toggle requirement says so.
- [Moving the data sources breaks a bookmarked `settings/sources` address]
  → It falls to the Settings tab's Process view, the unknown-view rule. No
  deployment runs this studio.
- [The matrix badges grow to a word's width] → One shared width keeps the
  three aligned. The grid's column
  widens. The horizontal scroll already absorbs that.
- [A form-flag "Open" stops one press short of the flag] → The author
  opens the field's Developer view in the strip. Recorded as an open point.
- [The card grows past the two halves' height] → More folds seven controls.
  The column scrolls, and at 1440px a 12-choice field stays under two
  screens.

## Migration Plan

No data migration. The change ships in one PR. Rollback is a revert.

## Open Questions

None that change the specs. Three later choices stay recorded under "Open
from studio-field-card" in `docs/decisions.md`. One is whether a choice
rename should rewrite guard literals. Another is whether a form-flag "Open"
should land on the strip's Developer view. The third is a `fields` origin
for the form editor, so that leaving it returns to Fields rather than Steps.
