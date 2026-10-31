# Proposal

## Why

An author who adds a field in the form editor cannot name it there. The
palette's "Text" or "Choice" entry places a card that reads "(unnamed
field)". The author then has to find the field in the Fields tab to give it
a name. Every card prints the field's key in mono and its raw `type` beside
it. The palette offers five kinds, and its "Choice" mints a plain text field
with no choices. Number and the other eleven kinds of the catalog's picker
are missing.

The owner rated B1, "A minted field cannot take a name in the form editor",
"bothers me". The owner rated M5, "Form building spans three editors",
important. Principle 3 of stage 64 says an author creates, names and places
a field in one move inside the form.

This is change 6 of stage 64 (`docs/studio-ui-concept.md`, section 8). It
builds on change 2, which shipped on 2026-10-31. Decision D3 option 2 keeps
the form editor a routed screen. It gains naming on create, and its cards
carry label and kind. The tab row stays, with a breadcrumb.

## What Changes

- A new field takes its name on the card. A click or a drop on a palette
  kind places the card with a name input that holds the focus. The first
  keystroke writes the label. Enter or Escape ends the naming and puts the
  focus on the card. A card whose field has no label keeps the input.
- The label writes the key the way the Fields tab writes it. The key
  follows the label until an expression reads it or a published version
  holds the field.
- The selected field's strip gains a Name control as its first control.
  It renames a placed field at any nesting depth.
- A card prints the field's label in the written face, and the kind's icon
  and name. The key and the raw `type` leave the card. The `1/2` width
  mark leaves it too: the canvas already draws the width.
- The card's and the strip's "CEL" mark reads "Condition". The strip's
  Width choice reads "One column" and "Both columns".
- A group card's legend and the strip's heading print the label. A note's
  group choice lists group labels.
- The palette's "Add a field to the process" section offers every kind of
  the engine's curated table. Each entry shows its icon and its catalog
  name. The list grows from five entries to sixteen, Number included.
- The three choice kinds (One choice, Several choices, Checkboxes) mint
  with two starter choices. The field then asks a real choice at once.
- The form editor stands under the tab row. The tab it opened from stays
  current: Forms from a Forms card, Steps from everywhere else. A
  breadcrumb, "Steps › Approve › Form", replaces "← Back to the process".
  A press on a tab leaves the editor for that tab.
- The step page's Form section reads the form's size as a sentence, "4
  fields, 1 required" or "No fields yet". Its control reads "Open the form"
  or "Start the form", the Forms card's own words.
- The Fields tab's "Put this field on a step" opens the form editor of the
  first step a person works. The field stands in that form's palette.
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-form-editor`: naming on create, the Name control, and cards with
  label and kind. It also covers every curated kind in the palette, the
  seeded choices, the tab row and the breadcrumb. The key's break rule goes
  with the key.
- `studio-forms-overview`: the editor opened from a card stands under the
  tab row with Forms current, and leaving returns there.
- `studio-step-page`: the Form section's sentence and its two control
  words.
- `studio-app`: the effect half's empty-state route opens the form editor
  in place of the canvas. The Form section's count drops the catalog's size.
  Section 8 lists no `studio-app` delta for change 6. Both rules live in
  `studio-app` today, so the change needs one.

## Impact

- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx` and
  `screens/EditScreen.tsx`.
- `packages/web/src/areas/studio/draft/mintField.ts`, plus a shared
  label writer in `draft/`.
- `panels/StepPage.tsx`, `panels/FormsTab.tsx`, `panels/formCardRows.ts`,
  `panels/FieldCatalogPanel.tsx`, `panels/EntityTabs.tsx`,
  `panels/FieldsTabViews.tsx`.
- The studio catalog, `packages/web/src/i18n/catalogs/studio.ts`.
- `.claude/rules/ui-glossary.md`: the form editor entry, the palette's
  word for a group and the form editor's place under the tab row.
- `docs/browser-checks.md`, `docs/decisions.md` and `ROADMAP.md`.
- The tests under `packages/web/test/` that pin the palette, a card's key,
  the strip or the back control.
