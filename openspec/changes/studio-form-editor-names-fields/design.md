# Design

## Context

See proposal.md for the motivation. All paths below sit under
`packages/web/src/areas/studio/` unless they say otherwise.

- `screens/FormEditorScreen.tsx` draws the palette, the form canvas, the
  strip and the form preview. Its header holds "← Back to the process" and
  an `h2`. The `h2` prints the step's label in mono, or else its key.
- `screens/EditScreen.tsx` renders the editor in place of the whole process
  surface while the route carries `formStepId`. No tab row stands above it. The
  restore notice hides while the editor is open, because its buttons move
  the focus to a tab. The tab that opened the editor sits in `formOrigin`,
  and `formEditorReturnTab` (`draft/process-tabs.ts`) falls back to Steps.
- `draft/mintField.ts` maps five palette kinds onto engine kinds. "Choice"
  maps to plain `text`, and "Section" to `group`. A minted field gets
  `mintId("field")`, an empty key and an empty label.
- A card prints `labelFor(ref)`, which reads the field's **key**, through
  `renderFieldKey` in mono. Beside it stands the raw `type`, a `span/columns`
  mark and a "CEL" mark. A group legend and the strip heading read the key
  too. The note strip's group select lists keys.
- The Fields tab writes a label through `labelChangePatch`
  (`panels/fieldCatalogLogic.ts`), or `writeGroupLabel`
  (`draft/view-group-sync.ts`) for a group. Both derive and dedupe the key
  while `isFieldKeyLocked` allows it. `usePublishedFieldIds()` feeds the
  lock, and its provider wraps the whole process surface.
- `fieldKindWord` and `fieldKindIcon` (`draft/field-type-labels.ts`) name a
  field's kind from its `{type, format, control}` triple. They accept the
  bare `FIELD_KINDS` entry too.
<!-- antislop: allow synonym-rotation -->
<!-- Why: "Build the form" quotes the control text this change retires. -->
- The step page's Form section prints `N / M fields configured` and "Build
  the form". It is `panels/StepPage.tsx`, case `"form"`.
  `configuredFieldCount` (`panels/stepsPanelLogic.ts`) counts every field
  entry. The Forms tab's foot text (`FormsTab.tsx::footCountText`) counts
  field entries minus group entries, plus the required ones.
- The field catalog's empty "Used in" zone offers "Put this field on a
  step". It calls `onShowStep(initialStep ?? steps[0])`, which opens the Map
  tab. The initial step may be an end or a subprocess call.

## Shape brief (`/impeccable shape`, form editor)

The brief ran with stated assumptions and no interview. The owner
pre-approved every decision for stage 64 and asked for none.

1. **Job and audience.** A process author builds one step's form. Mode:
   Operate. The author arrives from the step page, a Forms card or a field
   with no home. They want a field to exist, carry a name and sit on the
   form, in one move.
2. **Outcome and proof.** The author presses "Number", types "Amount", and
   the card reads "Amount · Number". The Fields tab shows the same field,
   key `amount`. Nothing on the screen prints a key, a `type` or "CEL".
3. **Selected direction.** The established register world (`DESIGN.md`),
   refined in place. Thesis: the card is the field's name tag. The label is
   the card's identity in the written face, and the kind is its kicker. The
   palette is a list of kinds, the canvas is the form, and the breadcrumb
   is the way out. No new token, no new motion, no new component family.
4. **Scope and boundaries.** One screen plus its three entry points.
   Untouched: drag and drop, the group and tab rules, the preview, the
   override semantics. Anti-goals: no side inspector, no kind dialog, no
   key on screen, no third navigation row.
5. **States and ranges.** A form holds zero to about forty entries. A label
   runs 3 to 60 characters, and a German override up to 40% longer. The
   palette lists zero to fifty unplaced fields above sixteen kinds. A card
   carries a name, takes one, or has none and keeps its input.
6. **Interaction and layout.** The tab row stays above. The breadcrumb
   opens the editor's header, then the `h2`. The palette keeps its three
   sections: fields not on this form, "Add a field to the process", Notes.

   Each kind row reads icon then name. A press places the card last. A drop
   places it at the slot. The new card's input takes the focus.
7. **Constraints.** English-only studio catalog, one key per sentence. The
   name input is the shared `LocalizedTextInput`. The breadcrumb is a
   `<nav aria-label="Breadcrumb">` around an `<ol>`. The last crumb carries
   `aria-current="page"`. Lucide icons at 18px, stroke 1.75.

```
 Map  Steps  Fields  Forms  Checks  Settings          ← tab row, Steps current
 ─────═════──────────────────────────────────
 Steps › Approve › Form                                ← breadcrumb
 The form for Approve                                  ← h2, written face
 ┌──────────────────┬───────────────────────────────┬──────────────┐
 │ FIELDS NOT ON    │ COLUMNS [One] [Two]           │  preview     │
 │ THIS FORM        │ ┌───────────────────────────┐ │              │
 │  T Reason        │ │ Amount                    │ │              │
 │ ADD A FIELD TO   │ │ # NUMBER          REQUIRED│ │              │
 │ THE PROCESS      │ └───────────────────────────┘ │              │
 │  T Text          │ ┌───────────────────────────┐ │              │
 │  ¶ Long text     │ │ [Name this field…       ] │ │              │
 │  ◉ One choice    │ │ 📅 DATE                   │ │              │
 │  📅 Date …       │ └───────────────────────────┘ │              │
 │  # Number …      │  Drop a field here …          │              │
 │  📁 Group        │                               │              │
 │ NOTES            │ AMOUNT                        │              │
 │  [Add a note]    │ Name [Amount         ]        │              │
 │                  │ Asked ☑  Required ☑  …        │              │
 └──────────────────┴───────────────────────────────┴──────────────┘
```

## Goals / Non-Goals

**Goals:**

- One move creates, names and places a field.
- Every word on the editor is the author's word. The key stays in the Fields
  tab's Developer view and the JSON surface.
- The editor sits inside the tab row's frame, D3 option 2.

**Non-Goals:**

- The key-follows-name rule until the first publish, and the key rewrite in
  the Developer view: change 7.
- The field card in sentences on the Fields tab: change 11.
- The one dialog form for removals: change 13. Remove stays dialog-free.
- A plain dropdown kind. The curated table names none (see D5).

## Decisions

### D1. The editor stands inside the origin tab's panel

`EditScreen.tsx` renders the editor inside the `tabPanel` of the origin tab,
`formEditorReturnTab(formOrigin)`. The tab row's `open` reads the same tab
while the route carries `formStepId`. That tab's own body stays mounted
inside a wrapper carrying `hidden`. The step page or the Forms tab thus keeps
its half-typed state. The glossary's "all six bodies stay mounted" rule holds. The tab
button's `aria-controls` then names the panel the editor stands in.

The JSON surface hides the editor through the panel's existing `hidden`
logic. The "step not found" banner renders in the same panel.

The restore notice now renders over the editor too. Its old reason, "a form
editor has no tab row", lapses.

`ProcessTabRow`'s `onOpen` is `goToTab`, which navigates to the plain `edit`
route and drops `formStepId`. A press on the current tab therefore leaves
the editor as well.

`openFormEditor(target, from)` also calls `onSelectStep(target)`. The step
crumb and a return to the Steps tab then land on the form's own step.

Alternative: keep the full-screen page and add a breadcrumb only. Rejected:
D3 option 2 keeps the tab row, and the author would lose the five other tabs.

### D2. The breadcrumb replaces the back control

The header holds a `<nav aria-label="Breadcrumb">` with an `<ol>` of three
`<li>`s. The first two are `<button type="button">` crumbs. The third is a
`<span aria-current="page">`. A `›` separator stands between crumbs in an
`aria-hidden` span.

- Crumb 1 reads the origin tab's own name (`tabs.steps` or `tabs.forms`) and
  calls `onBack`, the existing return.
- Crumb 2 reads the step's label, or `steps.unnamedStep`, never the key. It
  calls a new `onOpenStep` prop, which selects the step and opens Steps.
- Crumb 3 reads `formEditor.crumbForm`, "Form".

On the Steps origin, crumbs 1 and 2 reach the same step page. The breadcrumb
mirrors the tab row; the redundancy costs nothing and keeps one shape for
both origins.

The `h2` reads `formEditor.heading`, "The form for {step}", in the written
face. The mono step span goes.

The crumbs take the authoring-command look minus the mono face. They print
body text in slate that turns to ink on hover, with no underline at rest. Focus shows the shared
ring.

### D3. Naming on create: an explicit card variant

`FormEditorScreen` holds `naming: FieldId | undefined`. `mintAndPlace` sets
it to the new field's id. A leaf card renders one of two explicit variants
(`vercel-composition-patterns`: explicit variants over a boolean mode):

- `CardBody`: today's draggable `<button>`, now printing label and kind.
- `CardNameInput`: a `<div>` holding `LocalizedTextInput`
  (`id={formCardNameInputId(fieldId)}`, `aria-label` "Field name",
  placeholder "Name this field…", `autoComplete="off"`) and the kind line.

The input variant renders when `naming === ref`, or when the field's label
for the content locale is empty. An effect focuses the input when `naming`
changes. Enter and Escape call `preventDefault`, clear `naming` and focus the
card's body button (`formCardBodyId(fieldId)`) on the next frame. An empty
label keeps the input variant, and the focus then stays in it. Blur clears
`naming`.

The input variant is not draggable, so the input keeps text selection. The
move and remove controls stay beside it. A card in the input variant offers
no selection, so its strip opens once the field has a name.

Minting clears the selection, as it does today. The selection is an array
index the insert shifts. A selected new card would also print a second Name
input in the strip.

### D4. One label writer for the form editor

A new `draft/fieldLabel.ts` exports
`writeFieldLabel(d, fieldId, label, baseLocale, published)`. It finds the
field at any depth through `draftFields(d)` inside the `mutate` callback. A
group goes through `writeGroupLabel`. Every other field takes
`Object.assign(field, labelChangePatch(d, field, label, baseLocale, published))`.
The card's input and the strip's Name control both call it through `mutate`.

The Fields tab keeps its own `updateLabel`, which also bumps the usage tint.
It calls the same two functions, so the key rule cannot drift.

### D5. The palette lists every curated kind

`PALETTE_FIELD_KINDS` becomes the keys of `FIELD_KINDS`, in the table's own
order: sixteen entries, Text first, Group last. `PaletteFieldKind` becomes
`FieldKindName`. `KIND_BY_PALETTE_KIND` goes, and `baseTypeForPaletteKind`
returns `FIELD_KINDS[kind]`. Each row prints
`fieldKindIcon(FIELD_KINDS[kind])` and `fieldKindLabel(kind).name`. The five
`formEditor.mint*` keys go.

The curated table names no plain dropdown. A `text` field with choices reads
"Text" on the Fields tab. A palette entry minting one would name a kind
the catalog never shows. "One choice" stands for the single choice.

`mintCatalogField(kind, label, baseLocale)` seeds two options on
`radioChoice`, `multiChoice` and `checkboxChoice`:
`{ value: "choice_1", label: { [baseLocale]: "Choice 1" } }` and the same for
2. The label comes from `formEditor.seedChoice`, "Choice {n}". The base
locale carries it because the localization invariant asks for a non-empty
base-locale entry.

The palette heading "Section" leaves with the mint keys. The glossary's note
that *section* names a form group "on the form editor's palette" drops the
palette. The Forms tab's legend keeps "Section", recorded as an open point.

### D6. A card prints label, kind and marks in words

| Part | Text | Style |
|---|---|---|
| label | the resolved label | body, written face, `overflowWrap: anywhere` |
| kind line | icon + `fieldKindWord(field)` | Label role: 11px, uppercase, 0.1em, slate |
| marks | "Required", "Read-only", "Condition" | Label role; "Condition" keeps the 2px accent border |
| note | its text + kind word "Note" | as today, kind word in the Label role |

`renderFieldKey`, the `typeLabel` helper, the `formCardKey` style and the
`span/columns` mark go. `formEditor.markCel` reads "Condition". The strip's
`OverrideField` prints the same mark. A group legend reads the group's label,
or `formEditor.unnamedField`.

`labelFor` becomes the resolved label for the content locale. The strip
heading drops `fonts.mono`.

### D7. The strip gains Name and wordy widths

`FormEditorStrip` gains a first control, `Name`: a `LocalizedTextInput` in
the strip's field layout. It calls a new `onChangeLabel` prop, which the
screen wires to `writeFieldLabel`. The Width select's options read
`formEditor.spanOne` ("One column") and `formEditor.spanBoth` ("Both
columns"), with the values 1 and 2 unchanged.

`NoteEditorStrip`'s `groupKeys: string[]` becomes `groupOptions:
{ key, label }[]`. Each option prints the label and writes the key.

### D8. The Form section shares the Forms card's words

`formCardRows.ts` exports `formSizeText(fieldCount, requiredCount)`, moved
from `FormsTab.tsx::footCountText`. It returns `undefined` at zero.
`FormsTab` keeps its behavior through it. The step page computes the two
counts for its step with the same `miniatureEntry` rule, through a new
export `formCounts(step, fields)`. It prints `formSizeText(...)` or
`formsTab.miniatureEmpty` ("No fields yet"). Its control reads
`formsTab.startForm` or `formsTab.openForm`.

`configuredFieldCount`, its test block, and the keys
`stepSections.viewFieldsConfigured` and `stepSections.viewBuildForm` go.

### D9. "Put this field on a step" opens the form

A new pure helper `firstWorkedStepId(draft)` (`draft/stepKinds.ts`) returns
the initial step when it is a task step and not an end. Otherwise it returns
the first such step in draft order, or `undefined`. A task step is one whose
`type` is `"task"` or absent, without `terminal: true`.

`FieldCatalogPanel` takes a new `onOpenForm(stepId)` prop for the empty
state's route alone. The used-in rows keep `onShowStep`.
`EntityTabs` and `FieldsTabViews` thread the prop through. `EditScreen`
passes `(target) => openFormEditor(target, "steps")`.

### D10. Catalog keys

Added: `formEditor.heading` (reworded to "The form for {step}"),
`formEditor.breadcrumb` ("Breadcrumb"), `formEditor.crumbForm` ("Form"),
`formEditor.nameLabel` ("Name"), `formEditor.nameInputLabel` ("Field
name"), `formEditor.namePlaceholder` ("Name this field…"),
`formEditor.seedChoice` ("Choice {n}"), `formEditor.spanOne`,
`formEditor.spanBoth`, `formEditor.markCondition` ("Condition"),
`formEditor.noteKind` ("Note").

Removed: `formEditor.mintText`, `formEditor.mintChoice`,
`formEditor.mintDate`, `formEditor.mintFile`, `formEditor.mintSection`,
`formEditor.markCel`, `formEditor.noteType`,
`stepSections.viewFieldsConfigured`, `stepSections.viewBuildForm`.

`formEditor.back` stays for `FormEditorBoundary`'s fallback button alone.
The editor's own header no longer reads it. The footer note
`formEditor.navigateAwayKeepsChanges` swaps "toolbar" for "header bar".

### D11. Spec cut

- `studio-form-editor`: REMOVED + ADDED for four requirements. They are
  the full-screen page, the marks, the key's break rule and the 80rem rule.
  A base scenario of each states a rule that goes. MODIFIED covers the
  palette, the flag names and the note strip. The new requirements cover
  the tab row, the breadcrumb and the draft writes. They also cover naming
  on create, the key rule, the strip's Name, and the card's label and kind.
- `studio-forms-overview`: MODIFIED "A card opens the form editor for its
  step".
- `studio-step-page`: two ADDED requirements for the Form section.
- `studio-app`: MODIFIED for the empty-state route and the Form section's
  count.

At sync, each ADDED successor moves to its removed predecessor's place.

## Risks / Trade-offs

Each entry names the risk, then its mitigation.

- The hidden tab body keeps its own focus targets. Its wrapper carries
  `hidden`, which takes it out of the tab order.
- A card left with an empty label offers no strip. The input says what to
  do, and the Fields tab still edits the field. Open Questions records it.
- Sixteen kinds lengthen the palette by about 400px. The palette scrolls
  with the page today. The browser check measures it at 1280px and 1440px.
- The origin tab is component state. A reload opens the editor under Steps
  even after a Forms card opened it. The spec names a direct load as Steps.
- The choice values `choice_1` and `choice_2` are machine words. They stay
  behind the Fields tab's options editor. A label rename leaves them alone.
- The restore notice now stands over the editor. A restore can remove the
  open step. The editor already says "This step no longer exists in the
  draft" then.

## Migration Plan

No data migration. The definition contract, the Zod schema and the API stay
as they are. A rollback reverts the commit.

## Open Questions

- Should the Forms tab's legend say "Group" in place of "Section", to match
  the palette? Change 11 owns the wording across Fields.
- Should an unnamed card offer selection beside its input? Change 11's field
  card may answer it.
