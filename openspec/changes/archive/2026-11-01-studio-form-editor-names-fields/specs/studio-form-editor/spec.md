## REMOVED Requirements

### Requirement: The form editor opens as a full-screen routed page over the step's view

**Reason**: The editor no longer fills the screen. It stands under the tab
row, and a breadcrumb replaces its back control. Three requirements carry
its rules now. "The form editor opens under the tab row" and "A breadcrumb
leads out of the form editor" hold the place. "The form editor writes
straight into the draft" holds the writes.

**Migration**: None. The address `edit/form/:stepId` keeps working.

### Requirement: Each placed field shows its overrides as marks on its card

**Reason**: Its scenario "An expression override shows the CEL badge" names
a mark the card prints no more. A card shows no CEL word outside the
Developer view. "A placed field's card marks its overrides in words"
replaces it.

**Migration**: None.

### Requirement: A placed field's key breaks at its underscores before anywhere else

**Reason**: A card prints the field's label in place of its key. The label
is prose in the written face, and the browser's own line breaking serves
it.

**Migration**: None.

### Requirement: The preview stands under the canvas at 80rem and below

**Reason**: Its scenarios measure a field key on a card. "The preview
yields its column at 80rem and below" keeps the layout rule and measures
the label instead.

**Migration**: None.

## ADDED Requirements

### Requirement: The form editor opens under the tab row

The editor SHALL stand under the tab row, in place of one tab's body. That
tab SHALL stand current: Forms when a Forms card opened the editor, Steps in
every other case. A direct load counts as Steps.

Pressing any tab SHALL leave the editor and open that tab. The raw JSON view
SHALL stand in place of the editor while open, as in place of any tab body.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that already has
  view fields
- **THEN** the page renders those fields in their current order and layout

#### Scenario: The step page's editor keeps Steps current

- **WHEN** the author opens the form editor from the Approve step's Form
  section
- **THEN** the tab row stands above the editor with Steps current

#### Scenario: A Forms card's editor keeps Forms current

- **WHEN** the author opens the form editor from the Approve card on the
  Forms tab
- **THEN** the tab row stands above the editor with Forms current

#### Scenario: A tab press leaves the editor

- **WHEN** the author presses the Fields tab while the editor is open
- **THEN** the Fields tab opens and the editor closes
- **AND** the draft keeps every change the editor made

### Requirement: A breadcrumb leads out of the form editor

A breadcrumb SHALL stand at the editor's top edge, in place of a back
control. It reads the current tab's name, the step's label, then "Form".
The first crumb SHALL return to the current tab. The second SHALL open the
step's page on the Steps tab. The third SHALL mark the current place and
take no press.

Leaving the editor SHALL return the author to the current tab. That is the
Forms tab after a Forms card, and the step's page in every other case.

#### Scenario: The breadcrumb names the way back

- **WHEN** the author opens the form editor from the Approve step's Form
  section
- **THEN** the breadcrumb reads "Steps", "Approve", "Form"

#### Scenario: Leaving returns to the Forms tab

- **WHEN** the developer opens the form editor from a Forms tab card and then
  leaves it
- **THEN** the Forms tab is the open one

#### Scenario: The step crumb opens the step's page

- **WHEN** the author presses the "Approve" crumb
- **THEN** the Steps tab opens on Approve's step page

#### Scenario: The last crumb names the current place

- **WHEN** an assistive technology reads the breadcrumb
- **THEN** it reads a navigation landmark named "Breadcrumb"
- **AND** the crumb "Form" carries `aria-current="page"` and is no button

### Requirement: The form editor writes straight into the draft

<!-- The screen's Discard control drops every unsaved change; removing a card takes one entry off the form. -->
<!-- antislop: allow synonym-rotation -->
The editor SHALL write directly to the in-browser draft as the author works.
It offers no Save button. The screen's Save, Discard and Publish controls
stay the only ones that persist.

Navigating away and back SHALL carry the same draft state, since every
change already lands in the draft.

#### Scenario: Navigating away keeps every change

- **WHEN** the developer navigates away from the form editor after moving or
  adding a field
- **THEN** the draft keeps that change
- **AND** the screen's own Save, Discard and Publish controls still govern

#### Scenario: Returning to the editor shows the same state

- **WHEN** the developer navigates away from the form editor and back to it,
  without an intervening save
- **THEN** the page carries the same fields, in the same order, the developer
  left it in

### Requirement: A new field takes its name on its card

A palette kind's press or drop SHALL place the new card with a name input in
place of its label. A group card takes the input in place of its legend's
name. The input SHALL take the focus with its text selected. The first
keystroke then replaces that text.

Enter or Escape SHALL end the naming and move the focus onto the card's own
control. Moving the focus elsewhere ends it too. A card whose field has no
label, in the content locale or the base locale, SHALL keep the input.

#### Scenario: The first keystroke names the field

- **WHEN** the author presses the palette's "Number" kind and types
  "Amount"
- **THEN** the new card reads "Amount"
- **AND** the catalog holds a field labelled "Amount"

#### Scenario: A drop names the field the same way

- **WHEN** the author drops the palette's "Date" kind on the canvas
- **THEN** the new card shows the name input, and the input holds the focus

#### Scenario: Enter ends the naming

- **WHEN** the author types a name into a new card's input and presses
  Enter
- **THEN** the card prints the name as its label
- **AND** the focus stands on the card's own control

#### Scenario: An unnamed field keeps its input

- **WHEN** the author ends the naming with the input empty
- **THEN** the card keeps the name input

#### Scenario: A new group takes its name on its legend

- **WHEN** the author presses the palette's "Group" kind
- **THEN** the new group card's legend shows the name input, holding the
  focus

#### Scenario: An untranslated label keeps its card

- **WHEN** the content locale differs from the base locale
- **AND** a field carries a label in the base locale alone
- **THEN** its card prints that label, and shows no name input

### Requirement: A new field starts with its kind's name

A minted field's label SHALL start as the kind's name in the base locale.
The draft then never holds a field without a label. No structural check
result appears while the author names it.

#### Scenario: A new field starts clean

- **WHEN** the author presses the palette's "Date" kind
- **THEN** the new field's label reads "Date" in the base locale
- **AND** the draft shows no structural check result for it

### Requirement: The name input states its purpose

The name input SHALL carry the accessible name "Field name" and the
placeholder "Name this field…".

#### Scenario: A screen reader names the input

- **WHEN** an assistive technology reads a new card's name input
- **THEN** it reads the name "Field name"

### Requirement: A name given in the form editor sets the key

A label written on a card or in the strip SHALL set the field's key. It
follows the rule of the Fields tab's label control. A field's key follows
the label until a CEL expression reads the key or a published version holds
the field. It stays unique across the whole catalog.

A group's key follows its label the way the Fields tab's group label does,
and no publish locks it. A group's label also rewrites the view entries
naming the group's key.

#### Scenario: A new field's key follows its name

- **WHEN** the author names a new field "Amount"
- **THEN** the field's key reads `amount`

#### Scenario: A taken key gains a number

- **WHEN** the catalog already holds a field with the key `amount`
- **AND** the author names a new field "Amount"
- **THEN** the new field's key reads `amount_2`

### Requirement: The strip names the selected field

The selected field's strip SHALL carry a Name control as its first control.
It writes the field's label for the content locale, for a field at any
nesting depth.

The strip's heading SHALL print the field's label in the written face. A
field with no label reads "(unnamed field)".

#### Scenario: The strip renames a placed field

- **WHEN** the author selects a placed field labelled "Amount" and changes
  its Name to "Total"
- **THEN** the card and the strip's heading read "Total"

#### Scenario: The strip renames a group's member

- **WHEN** the author selects a field the catalog nests inside a group and
  changes its Name
- **THEN** the catalog's nested field carries the new label

### Requirement: A placed field's card prints its label and its kind

A placed field's card SHALL print the field's label in the written face. It
SHALL print the kind's icon and the kind's name. That name is the word the
Fields tab's entity rail prints for the field. The card SHALL NOT print the
field's `key`. Some fields match no curated kind by type, format and
control. Such a card prints that triple in mono, as the entity rail does.

A group card's legend SHALL print the group's label. A note's card SHALL
print its text and the kind word "Note".

#### Scenario: A card reads label and kind

- **WHEN** a view holds an entry for the field labelled "First and last
  name", key `full_name`, kind Text
- **THEN** its card reads "First and last name" and "Text"
- **AND** the card shows no `full_name` text

#### Scenario: A group card's legend reads its label

- **WHEN** a view holds a group entry for the group labelled "Applicant"
- **THEN** the group card's legend reads "Applicant"

### Requirement: A placed field's card marks its overrides in words

A placed field's card SHALL mark required and readonly. It SHALL mark
"Condition" when `visible`, `required` or `readonly` holds an expression in
place of a literal. It SHALL show a dashed border when `visible` holds an
expression.

The card SHALL print no width mark. The canvas draws a card's width itself.

#### Scenario: A literal override shows as a plain mark

- **WHEN** a placed field's `required` is the literal `true`
- **THEN** its card shows the mark "Required" and no "Condition" mark

#### Scenario: An expression override shows the condition mark

- **WHEN** a placed field's `visible` holds a CEL expression
- **THEN** its card shows the mark "Condition" and a dashed border
- **AND** the card shows no "CEL" text

### Requirement: The preview yields its column at 80rem and below

The form editor SHALL keep three columns only in a window wider than 80rem,
1280px. Those are the palette, the form canvas and the participant preview.

At 80rem and below, the preview SHALL leave its column. It SHALL stand under
the palette and the canvas, across both. The canvas then takes the width the
preview held. The 2px divider SHALL move from the preview's leading edge to
its top edge.

This width keeps a card's label readable beside its kind and its marks.

#### Scenario: Above 80rem the preview stands beside the canvas

- **WHEN** an author opens the form editor on IT Offboarding's "Submit the
  Exit Notification" step, in a window 1300px wide
- **THEN** the palette, the canvas and the preview stand in three columns

#### Scenario: At 80rem the preview stands under the canvas

- **WHEN** the same form editor opens in a window 1280px wide
- **THEN** the palette and the canvas stand side by side
- **AND** the preview stands under both, with the 2px divider on its top
  edge alone

#### Scenario: A laptop window keeps a label on one line

- **WHEN** the same form editor opens in a window 1100px wide
- **THEN** the preview stands under the palette and the canvas
- **AND** a two-word label reads on one line on its card

## MODIFIED Requirements

### Requirement: A left palette lists catalog fields not yet on the form, and offers minting a new one

The editor SHALL show every catalog field not currently referenced by
the step's view in a palette on the left. Dragging a placed-field entry
onto the canvas SHALL add it to the view, at the drop position.

A field the catalog nests inside a group is the exception to the drop
position. Dragging one onto the canvas SHALL place it inside that
group, whatever slot the drop named. A drop landing on another member's
own edge SHALL place it at that slot among the members. Every other
drop SHALL place it after the group's last member.

Where the group's own card is absent from the view, the same drop SHALL
place the group card too. One draft change carries both. The group card
goes at the slot the drop named. A member reaching a form without its
group would leave a draft no publish accepts.

On a tabbed form, a drop can place a member inside a group card another tab
draws. The canvas SHALL then show the card's tab, where the member landed. A
drop that changed nothing on the shown canvas would read as a failure.

The palette SHALL also offer an "add a field to the process" section. It
SHALL list every kind the engine's curated field-kind table names, in the
table's order, sixteen today. Each entry SHALL show the kind's icon and
name. The Fields tab's kind picker prints the same words.

Dragging one of those entries onto the canvas SHALL mint a new catalog field
of that kind. It SHALL add that field to the view, at the drop position, in
the same move. Pressing the entry SHALL mint the field and place it last.
A minted field is a top-level catalog field, so it joins no group.

A minted field of a choice kind SHALL carry two choices at once. It then
asks a real choice from the first draw. The choice kinds are One choice,
Several choices and Checkboxes. The seeded choices SHALL carry the
base-locale labels "Choice 1" and "Choice 2".

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

A place-an-existing-field row SHALL show that field's resolved label and
its kind icon. This is the same presentation the Fields tab's entity rail
already uses for the field (`studio-app`). It SHALL NOT show the field's
raw `key` or its raw `type` string as visible text. A field the catalog
nests inside a group SHALL indent under that group's own row. The indent
matches the same hierarchy the entity rail already draws.

#### Scenario: A field leaves the palette once placed

- **WHEN** the developer drags a palette field onto the canvas
- **THEN** that field appears on the canvas and no longer appears in
  the placed-an-existing-field list

#### Scenario: Removing a field returns it to the palette

- **WHEN** the developer removes a placed field from the canvas
- **THEN** that field reappears in the palette, and the view no longer
  references it

#### Scenario: Dropping a group's field outside the group still places it inside

- **WHEN** the developer drags a palette field the catalog nests inside
  a group, and drops it between two ungrouped cards
- **THEN** the card appears inside that group's card on the canvas
- **AND** the view entry carries the group field's key as its `group`

#### Scenario: A drop on a member's edge picks the position among the members

- **WHEN** the developer drags a palette field the catalog nests inside
  a group
- **AND** drops it on the leading edge of that group's second member
- **THEN** the card appears between the group's first and second members

#### Scenario: A group's first field brings the group card with it

- **WHEN** the canvas has no card for a given group
- **AND** the developer drags a palette field the catalog nests inside
  that group onto the canvas
- **THEN** the view carries the group's own entry and the member entry
- **AND** the canvas draws the member inside the group card

#### Scenario: A drop into a group card on another tab shows that tab

- **WHEN** a tabbed form carries a group's card on its second tab
- **AND** the developer drops that group's field from the palette onto the
  first tab
- **THEN** the member lands inside the group card
- **AND** the canvas shows the second tab

#### Scenario: Dropping an "add a field" entry mints and places a field

- **WHEN** the developer drags a "Text" entry from the "add a field to
  the process" section onto the canvas
- **THEN** a new catalog field of type `string` exists in the draft
- **AND** that field appears on the canvas at the drop position

#### Scenario: A minted field joins no group

- **WHEN** the developer drops an "add a field" entry inside a group
  card on the canvas
- **THEN** the minted field sits at the form's root, carrying no `group`

#### Scenario: A minted field is reachable through the field catalog too

- **WHEN** the developer mints a field through the form editor's
  palette
- **THEN** that field appears in the process's field catalog
- **AND** it appears there the same way a field minted on the panels
  screen's Fields view does

#### Scenario: A palette row shows the field's label and kind icon

- **WHEN** the developer opens the form editor for a step
- **AND** the catalog carries an unplaced field with key `full_name` and
  resolved label "First and last name"
- **THEN** the palette row for that field reads "First and last name"
- **AND** the row carries that field's kind icon
- **AND** the row shows no `full_name` text

#### Scenario: A palette row indents a group's member under the group

- **WHEN** the catalog nests a field inside a group
- **AND** neither the group nor the member is yet on the form's view
- **THEN** the palette lists the group's own row
- **AND** the member's row indents under it, the same depth the Fields
  tab's entity rail draws for that member

#### Scenario: The palette offers every curated kind

- **WHEN** the author opens the form editor
- **THEN** the "add a field to the process" section lists sixteen kinds,
  from Text to Group
- **AND** it lists "Number"

#### Scenario: Number mints a number field

- **WHEN** the author presses the palette's "Number" kind
- **THEN** a new catalog field of type `number` exists in the draft

#### Scenario: A choice kind mints a choice

- **WHEN** the author presses the palette's "One choice" kind
- **THEN** the new field reads as One choice in the Fields tab
- **AND** it carries two choices, labelled "Choice 1" and "Choice 2"

### Requirement: The strip and the card marks print each flag's one name

The selected field's strip SHALL caption its controls "Name", "Asked",
"Required", "Read-only" and "Width". The Width control SHALL offer "One
column" and "Both columns". A placed field's card SHALL print its marks as
"Required", "Read-only" and "Condition". A note's strip SHALL caption its
text "Text", its group "Group" and its tab "Tab". No caption on the form
editor SHALL be the JSON key the control writes. No option SHALL be the raw
value it writes.

#### Scenario: The strip captions its controls in words

- **WHEN** an author selects a placed field
- **THEN** the strip's captions read Name, Asked, Required, Read-only and
  Width
- **AND** the Width choices read One column and Both columns

#### Scenario: A card's marks read in words

- **WHEN** a placed field's `required` and `readonly` are both the literal
  `true`
- **THEN** its card prints the marks "Required" and "Read-only"

#### Scenario: A note's strip captions its controls in words

- **WHEN** an author selects a note
- **THEN** the strip's captions read Text, Asked, Width and Group
- **AND** the Width choices read One column and Both columns

### Requirement: A note's strip sets its text, its span, its group and its visibility

Selecting a note SHALL open a strip that sets the note's text. It covers the
body's base locale and any other locale the body declares. The strip SHALL set
the note's `span` and its `group`. For `visible` it SHALL offer the same
condition input a field card's strip offers.

A note has no catalog parent, so its group is a per-step choice. In the form
editor, the note strip is the one place an author makes that choice. The
renderer honors a note's `group`, per the `form-ui` capability. A strip
omitting the control would leave that choice out of an author's reach.

The group control SHALL list each group card of the view by the group's
label. It writes the group's key, and it prints no key.

The strip SHALL offer no requiredness, no readonly state and no validation. A
note carries none of those. Offering them would invite an author to expect a
value the note never holds.

#### Scenario: An author writes a note's text in the base locale

- **WHEN** an author selects a note and types its text
- **THEN** the draft records that text under the body's `baseLocale`

#### Scenario: A note's strip offers visibility and group but no requiredness

- **WHEN** an author selects a note
- **THEN** the strip shows a condition input for `visible`, a span control and
  a group control
- **AND** it shows no required, readonly or validation control

#### Scenario: An author places a note inside a group from its strip

- **WHEN** an author selects a note and picks the group labelled "Applicant"
  in its strip
- **THEN** the draft records that group's key as the note's `group`, and the
  note renders inside that group's container

#### Scenario: The editor reports a note missing its base-locale text

- **WHEN** a step's view holds a note whose text is empty for the body's
  `baseLocale`
- **THEN** the editor reports it before publish, rather than letting publish be
  the first place an author learns of it

### Requirement: The form editor renders from compiled styles

<!-- antislop: allow synonym-rotation -->
<!-- Why: the body is copied from the live requirement with one cited name swapped. -->
The screen `screens/FormEditorScreen.tsx` SHALL render from compiled
component styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration, apart from the
width at which the preview turns. The requirement "The preview yields its
column at 80rem and below" states that width.

The "How it will look" preview has a two-column layout. It SHALL pick
its style from a parameterized style function, keyed on the column
count. That is the same pattern `form-ui`'s own field renderer uses
for its own columns/span choice. The preview MAY still render a
`data-columns` fact on its container, for a test or another consumer
to read. No stylesheet SHALL select on it after migration.

#### Scenario: The form editor keeps its look

- **WHEN** a browser renders the form editor
- **THEN** its computed spacing, color and border equal the values the
  deleted stylesheet declared
- **AND** so does its layout, apart from the width at which the preview
  turns

#### Scenario: The two-column preview switches correctly

- **WHEN** an author toggles a field group between one and two columns
- **THEN** the preview's computed grid layout matches the deleted
  stylesheet's own two-column and one-column rules
- **AND** no compiled or hand-written stylesheet rule selects on a
  `data-columns` or `data-span` attribute after the migration

### Requirement: A live participant preview stands beside the form canvas

The form editor SHALL carry a preview of what a participant meets. In a
window wider than 80rem, the preview SHALL stand beside the form canvas, in
the editor's trailing pane. The requirement "The preview yields its column
at 80rem and below" states where it stands in a narrower window.

The preview SHALL mount the same `packages/form-ui` renderer the Player mounts.
No second renderer SHALL exist for it. What an author reads in the preview is
therefore what a participant gets.

The preview SHALL follow the view's own column count and its label position.
It SHALL name the process and the step above the fields. Below the fields it
SHALL carry one control per manual path the step declares, taking each path's
own label. A step declaring only automatic paths SHALL carry one submit
control.

A manual path can carry a guard. The runtime offers its control only while
that guard holds. The preview has no instance data to test the guard against.
It SHALL still draw the control. It SHALL print a line under the controls that
names the path and its condition.

The line reads the path's label, then the condition in the words the canvas
edge uses. A guard the builder cannot read prints its CEL
text instead. A manual path with no guard SHALL get no line.

The preview SHALL take no keyboard focus and no pointer interaction. It carries
the `inert` attribute, so a screen reader passes over it. Every change in the
form canvas SHALL reach the preview at once, without a reload.

#### Scenario: The preview follows the view order

- **WHEN** an author moves a field above another in the form canvas
- **THEN** the preview prints the two fields in the new order

#### Scenario: The preview follows the column count

- **WHEN** an author sets the form to two columns
- **THEN** the preview lays its fields in two columns

#### Scenario: The preview names the manual paths

- **WHEN** the step declares two manual paths labelled "Approve" and "Reject"
- **THEN** the preview carries one control reading "Approve"
- **AND** the preview carries one control reading "Reject"

#### Scenario: A guarded manual path names its condition

- **WHEN** the step declares a manual path labelled "Approve" with the guard
  `data.amount > 1000.0`
- **THEN** the preview carries the control "Approve"
- **AND** a line under the controls names "Approve" and its condition in words

#### Scenario: An unguarded manual path gets no line

- **WHEN** the step declares a manual path with no guard
- **THEN** the preview prints no condition line for that path

#### Scenario: The preview takes no focus

- **WHEN** an author walks the form editor with the Tab key
- **THEN** the focus never lands inside the preview

#### Scenario: A required entry marks itself in the preview

- **WHEN** a view entry declares `required: true`
- **THEN** the preview marks that entry's label as required
