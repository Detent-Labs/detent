## Context

`proposal.md` states the problem. This section records the code facts the
approach rests on. Paths start at `packages/web/src/areas/studio/` unless they
name another root.

- `panels/EntityTabs.tsx::FieldsTab.removeField` reads `neighbourAfterRemove`
  first. It then runs one `mutate` that writes
  `d.fields = removeFieldIn(...)`, and it selects the neighbour. It writes
  nothing else.
- `mutate` runs its recipe on a structured clone of the draft
  (`draft/store.tsx`). Every write one recipe makes lands in one state.
  `draft/view-group-sync.ts::moveFieldAndSyncViews` already relies on that for
  a move.
- `panels/FieldCatalogPanel.tsx` keys `FieldEditor` by the field's id. A new
  selection mounts a new editor, so the pressed Remove field button leaves the
  DOM.
- The tab's refocus effect focuses the element `refocusId` names after the
  next commit. It scrolls the element `refocusRailId` names into the rail's
  view. `railEntryId(fieldId)` names a rail entry's own button.
- The tab's live region carries the two move sentences and nothing else. Its
  label reads "Field moves".
- `panels/ProcessHeaderBar.tsx` defines `useConfirmDialog` and the dialog
  styles as file-local code. `PublishConfirmDialog` and `DiscardConfirmDialog`
  use them.
- The draft store keeps no history, so the studio has no undo.
- A view entry naming a missing field fails the Zod parse. While the parse or
  a structural check fails, the checks rail holds back the CEL group
  (`draft/validation.ts`, `draft/checksRail.ts`).

A field's reference kinds, and the check that reports each dangling one:

| Reference | Names the field by | Check when it dangles |
|---|---|---|
| view entry `ref` | id | Zod: `view ref does not resolve` |
| view entry or note `group` | the parent group's key | `compile.ts::checkViewGroupReferences` |
| `Action.output` target | id | Zod: `action output targets unknown field` |
| `subprocess.outputMapping` key | id | `compile.ts::checkIdResolution` |
| `contract.inputFields`, `contract.outputFields` | id | `compile.ts::checkIdResolution` |
| `columnMapping` target | id | `compile.ts::checkColumnMapping` |
| CEL `data.<key>` | key | CEL check, held back behind the checks above |
| `org.actor-from-field` `config.fieldId` | id | `compile.ts::checkActorFromFieldReference` |
| `valueFromField`, `instanceIdField` in a plugin config | id | publish only |
| `process.start` `config.inputMapping` values | key, inside CEL | none |

## Goals / Non-Goals

**Goals:**

- One recipe removes a field and every id reference to it. A removal leaves
  the draft exactly as valid as it was, apart from what CEL and plugin configs
  still name.
- One pure function measures a removal's reach. The dialog and its tests read
  the same answer.
- The removal dialog reuses the studio's existing dialog code and look.

**Non-Goals:**

- An undo, or a draft history.
- The same treatment for any other removal: data sources, steps, paths,
  outcomes and the canvas.
- Converting the two native `confirm()` prompts in `FieldCatalogPanel.tsx`.
- Rewriting a CEL expression, or clearing a plugin `config`.
- A new neighbour rule, or a new look for Remove field itself (FIELDS-10).
- FIELDS-2, FIELDS-8 and FIELDS-13. The live region keeps its FIELDS-2 layout
  defect until that entry's own change.

## Shape brief

On 2026-09-13 the owner chose mockup variant A, "counts only", and confirmed
this brief. Mockup: <https://claude.ai/code/artifact/fb6fe7ae-02fe-4a80-9a88-45a1ac81fd13>.

- **Job.** An author tidies the field catalog on the Fields tab, in Operate
  mode. A removal must break nothing unnoticed. An unused field must leave at
  once.
- **Direction.** The studio's existing dialog, in the shape of
  `DiscardConfirmDialog`. It is a native `<dialog>` in a 2px divider box, at
  most 34rem wide. A term and value grid holds the counts. The work does not
  add a look beyond a copy of the header bar's dialog shapes. No red, no
  toast, no motion.
- **States and ranges.** Reach runs from zero, which opens no dialog, to 18
  fields inside and 15 steps on the shipped examples. A field with an empty
  key shows its label alone. A long label wraps inside the dialog.
- **Focus.** The dialog opens on Cancel. A decline returns focus to Remove
  field. A removal focuses the next rail entry and scrolls it into view. An
  emptied catalog focuses "Add the first field".

Copy, from the studio catalog, one key per sentence:

| Place | Text |
|---|---|
| Heading, field | `Remove “{field}”?` |
| Heading, group | `Remove the group “{field}”?` |
| Fact terms, each shown only with a hit | `Field` or `Group`, then `Fields inside it`, `Steps showing it`, `Actions and mappings writing it`, `Contract entries`, `Column mappings targeting it`, `CEL expressions reading it`, `Plugin settings naming it` |
| Fact values | the label with its key in mono, then one bare count per row |
| Note, always | `Removing it also clears every step entry and reference that names it.` |
| Note, group | `Every field inside the group leaves with it.` |
| Notes, when a CEL or settings count is above zero | `CEL expressions and plugin settings keep their text.` and `Check each one before you publish.` |
| Controls | `Remove field` or `Remove group`, then `Cancel` |
| Announcement | `{field} removed.`, `{field} removed, with the one field inside it.`, `{field} removed, with the {count} fields inside it.` |
| Live region name | `Field moves and removals` |

A fact value holds a bare count, and its term names what the count counts. That
avoids singular and plural keys for eight rows. The announcement alone needs
the one and many forms.

## Decisions

### A removal with reach confirms, and undo stays a separate change

The owner chose this on 2026-09-13. The studio already confirms this way
twice. The Technical control confirms only when it clears keys. Arrange
confirms only when it would lose a hand-placed layout. A dialog on every
removal would ask about a field nobody uses, and it trains a blind confirm.

An undo needs a draft history, which the store does not keep. It also needs a
new pattern to offer it, since `DESIGN.md` bans the toast. Three live
requirements also state the missing undo as their reason for a confirmation.
A fourth states it as the reason for a bulk write's count. An undo is its own
change.

### Remove every id reference, and leave CEL and plugin configs

A view-only cleanup was the direction FIELDS-1 recorded. It fails in two
places. A dangling `Action.output` target still fails the Zod parse, so every
check group stays held back. A contract list entry for a removed id also
has no checkbox on the Contract tab. Only the JSON view could clear it.

CEL names a field by key, inside an expression the author wrote.
`studio-condition-builder` states that a guard naming a deleted field keeps its
text. A plugin `config` belongs to its plugin's schema. Clearing
`config.fieldId` would fail that schema and still leave the step without a
field to read. Both need an author's decision, so the dialog counts them and
the removal leaves them.

### Reach is one pure walk over the draft

`draft/field-removal.ts` exports `fieldRemovalReach(draft, fieldId)`. It
answers `undefined` for an id no field carries. Otherwise it answers the
removed field and one count per kind:

- `fieldsInside`: the fields below the removed field, at every depth.
- `steps`: the steps whose view carries an entry whose `ref` names a removed
  id, or whose `group` names a removed group's key.
- `writers`: the `output` keys naming a removed id in the five action
  positions, plus the `subprocess.outputMapping` keys naming one.
- `contractEntries`: the `contract.inputFields` and `contract.outputFields`
  entries naming a removed id.
- `columnMappings`: the `columnMapping` entries, on a field that stays, whose
  target names a removed id.
- `celReads`: the expressions the removal keeps whose parsed tree holds the
  member path `data.<key>` for a removed field's key. One expression counts
  once.
- `pluginSettings`: the string values inside any plugin `config` that equal
  a removed id. That covers an action, a data source, an assignment strategy
  and the `type` of a plugin-typed field that stays.

An expression is any object in the draft that carries `lang: "cel"` and a
string `src`. The walk visits the whole draft, so a `process.start` mapping
value counts too. It skips every expression the removal takes along: the
`validation.rule` and `default` of a removed field, the flags and
`validation.rule` of a view entry the removal takes out, and the value of an
`output` or `outputMapping` entry keyed by a removed id. The rule builder
writes `data.<key>` into a field's own rule, so that rule leaves with the
field. The walk also skips an empty key and a key a remaining field holds. An
expression that fails to parse counts when its text matches `data.<key>` on
word boundaries, for a non-empty key alone. The helper `hasReach(reach)`
answers true when any count sits above zero.

The tree comes from `parseAst` and `panels/shared/conditionLogic.ts::memberPath`,
the way the condition builder already reads CEL. A text match alone would count
`'data.amount'` inside a string literal. The tree misses an index read such as
`data["amount"]`. The count informs the author, and the checks rail stays the
authority on what breaks.

The settings walk names no plugin type. A special case for three plugin types
beside the registries would be a second mechanism for one concept. A future
plugin that names a field by id counts with no studio code of its own.

### One recipe collects, then cleans, then prunes

`removeFieldAndReferences(draft, fieldId)` runs inside one `mutate`. It first
collects the removed ids from the catalog as it stands. It also collects the
removed group keys: the non-empty keys of removed groups that no remaining
group holds. The helper `writeGroupKey` treats a shared key the same way. It
then works in this order:

1. It filters every step's `view.fields`. An entry leaves when its `ref` names
   a removed id, or when its `group` names a removed group key. Notes follow
   the same rule.
2. It removes each `output` key naming a removed id, in all five action
   positions. An `output` left empty leaves the action.
3. It removes each `subprocess.outputMapping` key naming a removed id. The map
   stays when it empties, since the definition contract requires the key.
4. It filters `contract.inputFields` and `contract.outputFields`.
5. It removes each `columnMapping` entry targeting a removed id, on every field
   that stays. A `columnMapping` left empty leaves the field.
6. It prunes the catalog through `removeFieldIn`.

The collect step comes first because the prune changes what the catalog
answers. The view filter does not need an index walk. The removed group keys
cover every nesting level of a card's members. One pass over each view
therefore matches what `draft/view-tree.ts::removeViewEntry` does. That helper
removes one entry by index in one view, and each call needs the old catalog.

### The dialog hook moves into a shared studio module

`useConfirmDialog` moves into `panels/shared/confirmDialog.tsx`.
`ProcessHeaderBar.tsx` imports it back, with no new signature. The dialog
styles stay in `ProcessHeaderBar.tsx`. `RemoveFieldDialog.tsx` declares its
own copy of those shapes, since `web-styling` puts a component's styles in its
own module. `stylex-phase-3-studio` D9 keeps that copy the norm.

A copy of the hook would put a second mechanism beside the first. A copy of a
style shape does not add a mechanism.

### The tab renders the dialog, and focus follows the removal

- `FieldCatalogPanel`'s `onRemove(fieldId)` reaches a new
  `FieldsTab.requestRemove(fieldId)`. It measures the reach on the render's
  draft. With no reach it calls `removeField` at once. With reach it stores the
  pending removal and renders a new `panels/RemoveFieldDialog.tsx`.
- The dialog renders in `FieldsTab`, outside the keyed `FieldEditor`. A
  confirm mounts a new editor, and that remount must not take the dialog along
  mid-press.
- Remove field carries `removeControlId(fieldId)`, a helper beside
  `moveControlId` in `panels/fieldCatalogLogic.ts`. When the dialog opens,
  `FieldsTab` points the hook's trigger ref at that button. On a decline, the
  hook's cleanup focuses it. Leaving the Fields tab with the dialog open
  declines the removal, and a return to the tab shows no dialog.
- On a confirm, `FieldsTab` clears the trigger ref first. Only the refocus
  effect then places focus.
- `removeField` sets `refocusId` and `refocusRailId` to the neighbour's
  `railEntryId`. When the neighbour rule answers nothing, it takes the first
  rail entry the pruned catalog keeps. An emptied catalog takes a new id on the
  "Add the first field" button. A pure `focusAfterRemove(fields, fieldId)` in
  `panels/fieldCatalogLogic.ts` picks that id.

### Announcements and the live region's name

`removeField` resolves the field's label before its `mutate`, with the rail's
own fallback for an unnamed field. A pure function picks the sentence:
`removalAnnouncement(label, fieldsInside)`. It takes the field sentence at
zero, the one form at one and the many form above one. Three new keys carry
the sentences under `panelsScreen`. The key `panelsScreen.moveAnnouncerLabel` becomes
`panelsScreen.fieldAnnouncerLabel`, with the text "Field moves and removals".

### No delta for web-styling or spa-accessibility

`web-styling` binds every `.btn-destructive` control to carry `.btn-secondary`
and the accent outline. The new confirming control does both. Its sentence
"Which controls carry the class stays as it stands" recorded the scope of the
change that wrote it.

`spa-accessibility` states the announcement rule for a reordering gesture. A
removal reorders nothing. `studio-app` carries the removal's focus and
announcement rule beside its neighbour rule.

### Tests stay pure and static

The web package has no DOM harness, so each test calls a pure function or
renders static markup.

- `packages/web/test/studio-fieldRemoval.test.ts` covers
  `fieldRemovalReach` for each kind, a group's subtree, one count per
  expression, the config walk and an unknown id.
- The same file covers `removeFieldAndReferences` for each kind, a nested group
  with notes, and untouched entries of other fields. It checks that an empty
  `output` and `columnMapping` leave, an empty `outputMapping` stays, and the
  CEL and configs the removal keeps stay unchanged.
- The same file removes "Access Excel updated or prepared" and "Processing
  (Fabrikam)" from `examples/it-offboarding.json`. The studio's `runValidation`
  then reports the issues it reported before the removal.
- The same file removes "Booking Status" from `examples/expense-approval.json`.
  Its issues then gain exactly the two guards' CEL issues.
- `packages/web/test/studio-removeFieldDialog.test.tsx` renders the dialog. It
  checks the heading per kind, rows only for hits and the key in mono. It also
  checks the notes per case, `aria-labelledby`, Cancel's `autoFocus` and the
  confirming control's classes.
- `removalAnnouncement` gets its own cases for zero, one and many.
- `focusAfterRemove` gets one case per branch of that order.
- `packages/web/test/studio-no-confirm.test.ts` also scans
  `panels/EntityTabs.tsx`, `panels/RemoveFieldDialog.tsx` and
  `panels/shared/confirmDialog.tsx`.

The browser walk covers what static markup cannot: focus after each close
route, Escape, and the live region's text.

## Risks / Trade-offs

- [The reach count misses an index read such as `data["key"]`.] → The count
  informs. The checks rail reports the unknown key after the removal.
- [A removed column mapping field stops writing its targets. A target's entry
  with literal required and readonly then fails
  `compile.ts::checkUnsatisfiableRequiredReadonly`.] → The dialog counts no
  such entry. The checks rail reports it.
- [A later field that derives a removed key rebinds old `data.<key>`
  expressions without a word.] → A new `docs/decisions.md` entry records it.
- [Moving the hook alters `PublishConfirmDialog` or `DiscardConfirmDialog`.]
  → The move changes no markup. The static tests and task 5.1's rerun of the
  dialog focus walk cover both dialogs.
- [The removal dialog reuses `useConfirmDialog`. Tab from its Cancel lands on
  `<body>`, and its `.btn-ghost` Cancel misses 4.5:1 on its washes. Both are
  open entries in `docs/decisions.md`.] → Out of scope. Task 5.2 files an
  audit finding on either defect into its open entry.
- [Two check messages mislead about a missing field. A kept
  `org.actor-from-field` setting reads as naming a field that lacks
  `format: "person"`. Clause 3 of `compile.ts::checkViewGroupReferences` calls
  a field the catalog lacks a top-level field.] → A new `docs/decisions.md`
  entry records both.
- [A kept `valueFromField` or `instanceIdField` setting fails at publish
  alone, and a kept `process.start` mapping value fails at no check.] → A new
  `docs/decisions.md` entry records both.
- [The walk parses every CEL expression on each press of Remove field.] → One
  press runs it once. A render never runs it. A `ponytail:` comment names the
  ceiling and the upgrade: cache the answer per draft value.
- [After “Remove data source” or “Remove this step”, focus stays on that
  button. The button then targets the next entity.] → A new
  `docs/decisions.md` entry records this code reading, which no browser run has
  confirmed.
- [The same announcement twice in a row stays silent, since the region's text
  does not change. Every unnamed field shares the rail's fallback label.] →
  `removeField` empties the region first. It writes the sentence on the next
  animation frame.

## Migration Plan

- The change touches the studio alone, and no stored data needs a migration.
  A draft keeps any dangling reference an earlier removal left. The checks
  rail reports it as today, and no automatic repair runs.
- The renamed catalog key orphans any stored UI string override for
  `panelsScreen.moveAnnouncerLabel`. No deployment runs this engine, so none
  exists.
- Rollback reverts the change's commits. No draft depends on the new code.

## Open Questions

None. The owner settled the guard, the cleanup scope, the dialog variant and
its copy on 2026-09-13.
