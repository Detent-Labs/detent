# studio-form-editor Specification

## Purpose
A visual, drag-and-drop editor for a step's form layout, in the studio
area of `packages/web`. It replaces `ViewEditor`'s override-row list.
An author sees the form's actual shape while arranging it, instead of
reading an ordered list of field names.
## Requirements
<!-- antislop: allow synonym-rotation -->
### Requirement: The form editor opens as a full-screen routed page over the step's view

Two places open the form editor. The step page's Step form fields section
opens it for the step it holds. The Forms tab's card opens it for that card's
step. Both reach the same routed page at `edit/form/:stepId`.

The editor SHALL open as a full-screen routed page. It replaces the native
`<dialog>` this capability used before.

Leaving the editor SHALL return to the place the author came from. An author
who came from the Forms tab returns to the Forms tab. An author who came from
the step page returns to that step.

<!-- The screen's Discard control drops every unsaved change; removing a card takes one entry off the form. -->
<!-- antislop: allow synonym-rotation -->
The editor SHALL write directly to the in-browser draft as the author works.
It offers no Save button of its own. The screen's existing Save, Discard and
Publish controls stay the only ones that persist.

Navigating away from the editor and back SHALL carry the same draft state a
re-opened modal would have carried. The editor's writes already land in the
draft on every change, so it needs no separate state-preservation step.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that already has
  view fields
- **THEN** the page renders those fields in their current order and layout

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

#### Scenario: Leaving returns to the Forms tab

- **WHEN** the developer opens the form editor from a Forms tab card and then
  leaves it
- **THEN** the Forms tab is the open one

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

The palette SHALL also offer an "add a field to the process" section, by
type. Dragging one of those entries onto the canvas SHALL mint a new
catalog field of that type. It SHALL add that field to the view, at the
drop position, in the same move. A minted field is a top-level catalog
field, so it joins no group.

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

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

### Requirement: The canvas places fields at the view's column count, in array order

The canvas SHALL show the form at the step view's declared column
count (see the `runtime-api` and `form-ui` capabilities for `columns`
and `span`). Position on the canvas SHALL be the view array's own
order, read left to right, then down. This is the same order the
override-row list's `↑`/`↓` buttons already express.

The canvas SHALL draw a group's placed members inside that group's own
card. An entry with no `group` sits at the form's root. A group card
draws the entries naming its key, in the view array's order. That is
the nesting `form-ui` already renders. The canvas and the preview beside it
then agree on sight, for every draft a publish accepts.

A group field's own member fields SHALL show at the same column count
as the form around them. That matches how `form-ui` lays a group out
(see the `form-ui` capability). The editor SHALL offer no separate
column count for a group.

The canvas places view entries of either kind. A note card takes
its position from the same array and answers the same order rule. Nothing
here reads a card's kind: a note occupies a slot the way a field card does.
A note carrying a group's key draws inside that group, beside the field
members.

#### Scenario: A form built before this editor loads unchanged

- **WHEN** the developer opens the editor for a view whose fields carry
  no `span` or `columns`
- **THEN** the canvas shows one column, every field full width, in the
  view array's existing order

#### Scenario: Dragging a field to a new position changes the array

- **WHEN** the developer drags a placed field to a new position on the
  canvas
- **THEN** the view array's order changes to match, left to right then
  down

#### Scenario: A group's members draw inside its card

- **WHEN** the developer opens the editor for a view carrying a group
  entry and two entries naming that group's key
- **THEN** the canvas draws both member cards inside the group card
- **AND** neither appears at the form's root

#### Scenario: Members draw in the order the preview renders them

- **WHEN** a view holds a group's two members at array positions that
  another entry separates
- **THEN** the canvas draws them adjacent inside the group card, in
  array order
- **AND** the preview beside the canvas shows the same two, in the same
  order

The canvas SHALL draw an entry whose `group` resolves to no group card at
the form's root. Three drafts hold one:

- a body somebody hand-edited in the JSON view
- a body published before the parentage rule
- a group whose `key` is still empty mid-edit

The checks rail reports each of those, so the canvas SHALL show the entry
rather than hide it.

The preview beside the canvas drops such an entry instead. `form-ui` reads a
`group` for truth rather than resolving it against the cards the view carries.
The entry then matches no root filter, and no group's own filter either. That
divergence reaches no publishable draft. It is the one case where the canvas
deliberately shows more than the preview.

#### Scenario: An entry naming an unknown group draws at the root

- **WHEN** a view holds a field entry whose `group` matches no group field
  the same view carries
- **THEN** the canvas draws that entry at the form's root
- **AND** the checks rail reports the unresolved group

#### Scenario: A field under a key-less group draws at the root

- **WHEN** the catalog nests a field inside a group field whose `key` is
  still empty
- **THEN** the canvas draws that field at the form's root, and draws no
  group card for the key-less group

#### Scenario: A note card takes its position from the same array

- **WHEN** the developer opens the editor for a view holding a field entry,
  a note and a second field entry
- **THEN** the canvas draws three cards in that order, left to right then
  down

### Requirement: The editor sets the form's own column count

A toggle above the canvas SHALL read and write the step view's
`columns`. It offers one column or two. Outside the JSON view, this is
the only control that writes `columns`. An author never has to leave
the editor to lay a form out in two columns.

Changing the toggle SHALL reflow the canvas at once. A card whose
`span` exceeds the new count SHALL show clamped, per the `form-ui`
capability's `min(span, columns)` rule. The editor SHALL NOT rewrite
that field's stored `span`. An author who returns the form to two
columns gets the spanning field back.

#### Scenario: The toggle writes the view's column count

- **WHEN** the developer sets the toggle to two columns
- **THEN** the draft's `view.columns` is `2`, and the canvas lays its
  cards out in two columns

#### Scenario: Narrowing the form clamps a spanning card without losing it

- **WHEN** a `span: 2` field sits on a two-column form and the
  developer sets the toggle to one column
- **THEN** that card renders full width at the new count, and the
  draft still records its `span` as `2`

### Requirement: Each placed field shows its overrides as marks on its card

A placed field's card SHALL mark required and readonly. It SHALL show
a CEL badge when `visible`, `required`, or `readonly` is an expression
rather than a literal. It SHALL show a dashed border when `visible`
resolves to a conditionally-hidden expression.

#### Scenario: A literal override shows as a plain mark

- **WHEN** a placed field's `required` is the literal `true`
- **THEN** its card shows a required mark with no CEL badge

#### Scenario: An expression override shows the CEL badge

- **WHEN** a placed field's `visible` is a CEL expression rather than
  a literal
- **THEN** its card shows the CEL badge, and a dashed border marking
  it conditionally hidden

### Requirement: A selected field's strip sets its overrides and span

Selecting a placed field SHALL show a strip below the canvas for that
field. The strip SHALL offer `visible`, `required`, and `readonly`.
Each is a three-way choice among `true`, `false`, and a CEL
expression. Choosing the expression option SHALL reveal an input for
that field's expression. The strip SHALL also offer `span`.

The strip SHALL offer no `group` control. The field catalog answers
where a field belongs, once, for the whole process. Its own
re-parenting control is where an author changes that. A select here
would offer one lawful value and several the publish rejects.

Where the selected field's `FieldDef` declares `technical: true`, the
strip SHALL NOT offer the `required` or `readonly` controls at all. The
definition contract rejects either key on that field's view entry. A
control the author could set there would only invite a rejected publish.
`visible` and `span` stay offered unchanged.

Each control SHALL start at the value the engine resolves for an absent
key. That value is true for `visible`. It is false for `required` and for
`readonly`. `resolveFlag` (`src/runtime/api.ts`) sets those three. The
strip SHALL show what the engine does, whatever the key holds.

Each control SHALL write its key only on a departure from that default.
On a return to the default, the control SHALL clear the key. A view
entry that carried no `visible` key SHALL carry none again, after a tick
and an untick.

That rule keeps `ProcessBody` still under a change that alters no
behaviour. A written `visible: true` moves `definitionHash`, and an
identical re-publish then stops being a no-op.

A `visible` of literal `false` SHALL disable the `required` and the
`readonly` control. It SHALL clear both keys. A `visible` that holds a
CEL expression SHALL leave both controls alone. Nobody can read an
expression's value without an instance.

Nothing else in the draft writes a selected field before the developer
submits its own step. When that holds, its `required` and `readonly`
controls SHALL gate each other. That is the same rule the field
matrix's live cell applies. Checking `required` SHALL disable
`readonly`, while `readonly` does not already read `true`. Checking
`readonly` SHALL disable `required`, while `required` does not already
read `true`.

"No other source, guaranteed before this step" means none of these
already write the field:

- an action's `output`, on a step whose action **dominates** the
  selected field's own step. Every path from `initialStep` to that
  step passes through the action's step.

- an action's `output` on the field's own step, set at `onEntry`.

- an action's `output` on the field's own step's timer `onFire`, when
  that timer declares a `targetPath`.

- a subprocess's `outputMapping`, on a step that dominates the
  selected field's own step.

- a field's `columnMapping`.

- a `contract.inputFields` entry.

- another editable view entry (`visible !== false`, `readonly !==
  true`) for the same field, on a step that dominates the selected
  field's own step.

A step dominating another is the same relation the compile pass's
`definition-contract` check (`checkUnsatisfiableRequiredReadonly`) and
the field matrix's live cell use. All three SHALL share one dominance
computation over the draft's `workflow.steps`. None can disagree with
the others about which step guarantees a value by the time the
developer submits a step.

A field editable only on a step that does NOT dominate the selected
field's own step does NOT count. Gating stays engaged regardless. That
non-dominating step may be reachable solely after it, or only via a
different branch.

Where a selected field already carries `required: true` and
`readonly: true` before either gate engages, neither control SHALL
disable. The developer keeps a path to uncheck either one.

#### Scenario: An absent visible key shows the field as visible

- **WHEN** the developer selects a placed field whose view entry carries
  no `visible` key
- **THEN** the strip's `visible` control reads true

#### Scenario: Returning to the default clears the key

- **WHEN** the developer sets a placed field's `visible` to false, then
  back to true
- **THEN** the view entry has no `visible` key

#### Scenario: A departure from the default writes the key

- **WHEN** the developer sets a placed field's `visible` to false
- **THEN** the view entry carries `visible: false`

#### Scenario: An absent required key reads false

- **WHEN** the developer selects a placed field whose view entry carries
  no `required` key
- **THEN** the strip's `required` control reads false

#### Scenario: Hiding a field disables and clears its other two flags

- **WHEN** the developer sets a placed field's `visible` to false on an
  entry carrying `required: true` and `readonly: true`
- **THEN** the strip disables the `required` and `readonly` controls
- **AND** the view entry carries neither key

#### Scenario: A CEL visible leaves the other two controls alone

- **WHEN** a placed field's `visible` is a CEL expression
- **THEN** the strip leaves the `required` and `readonly` controls
  enabled

<!-- antislop: allow trailing-negation - a MODIFIED scenario name must match the live spec's wording exactly -->
#### Scenario: Leaving the expression option restores the default, not false

- **WHEN** the developer switches a placed field's `visible` from the
  expression option to the boolean option
- **AND** that entry carries `required: true` and `readonly: true`
- **THEN** the view entry has no `visible` key
- **AND** the `required` and `readonly` keys stay as they were

#### Scenario: Switching an override to an expression reveals the input

- **WHEN** the developer sets a selected field's `required` choice to
  the expression option
- **THEN** a CEL expression input appears in the strip for `required`

#### Scenario: Changing span changes the field's width on the canvas

- **WHEN** the developer sets a selected field's `span` to `2` on a
  `columns: 2` view
- **THEN** that field's card widens to span both columns on the canvas

#### Scenario: Checking required disables readonly on an unwritten field

- **WHEN** the developer checks `required` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `readonly` does not already read `true`
- **THEN** the strip's `readonly` control disables

#### Scenario: Checking readonly disables required on an unwritten field

- **WHEN** the developer checks `readonly` on a selected field
- **AND** nothing else in the draft writes that field before its own
  step
- **AND** `required` does not already read `true`
- **THEN** the strip's `required` control disables

#### Scenario: A field something else writes keeps both controls free

- **WHEN** the developer checks `required` on a selected field
- **AND** some other source already writes that field, on a step that
  dominates the selected field's own step
- **AND** that source is one the requirement above already lists
- **THEN** the strip's `readonly` control stays enabled

#### Scenario: A field editable only on a non-dominating step keeps gating engaged

- **WHEN** the developer checks `required` on a field selected on the
  process's first step
- **AND** the field's only other writer is an action output or a
  subprocess output mapping on a non-dominating step
- **AND** that non-dominating step is reachable only after this first
  step, or only via a different branch
- **THEN** the strip's `readonly` control disables

#### Scenario: An own-step post-gate output does not clear gating

- **WHEN** the developer checks `required` on a selected field
- **AND** the field's only other writer is an action's `output` on the
  field's own step at `onExit`, `onPath`, or `onCancel`
- **THEN** the strip's `readonly` control still disables. An own-step
  post-gate output fires after the submission gate. It does not count
  as a source that writes the field before the developer submits this
  step.

#### Scenario: An entry already carrying both flags stays editable

- **WHEN** the developer selects a field whose entry already carries
  `required: true` and `readonly: true`
- **AND** nothing else in the draft writes that field before its own
  step
- **THEN** neither the `required` nor the `readonly` control disables
- **AND** the developer can uncheck either one

#### Scenario: A technical field's strip omits required and readonly

- **WHEN** the developer selects a placed field whose `FieldDef` declares
  `technical: true`
- **THEN** the strip shows `visible` and `span`
- **AND** the strip shows no `required` or `readonly` control

#### Scenario: A field's strip offers no group control

- **WHEN** the developer selects a placed field the catalog nests inside
  a group
- **THEN** the strip shows no control for `group`
- **AND** the view entry keeps the `group` it carries

<!-- antislop: allow trailing-negation - a MODIFIED heading must match the live spec's wording exactly -->
### Requirement: A field's position is reachable by keyboard, not drag alone

Every placed field SHALL offer keyboard-operable move commands, in
addition to its drag handle. The commands are move up and move down. A
keyboard move SHALL change the view array the same way a drag does.

A move-to-group command is gone from the set. The catalog holds a
field's group now, and the strip offers no control for it either.

A member of a group SHALL move among that group's own entries alone.
Move-up on the group's first entry and move-down on its last SHALL be
unavailable. A drag that would land a member outside its group SHALL
change nothing.

An entry carrying no `group` SHALL move among the form's root entries
alone, skipping over a group card's members. A group card is one root
entry, and a move past it clears the whole group.

A note placed inside a group answers the member rule. A note at the
form's root answers the root rule.

#### Scenario: A keyboard move reorders the same way a drag does

- **WHEN** the developer uses a placed field's move-up command
- **THEN** the view array's order changes exactly as it would from
  dragging that field one position up

#### Scenario: A member's move-up stops at its group's first entry

- **WHEN** the developer opens a group's first member and reads its
  move-up command
- **THEN** the command is unavailable

#### Scenario: A member's move-down stops at its group's last entry

- **WHEN** the developer opens a group's last member and reads its
  move-down command
- **THEN** the command is unavailable

#### Scenario: A member's move swaps it with its own sibling

- **WHEN** the developer uses the move-up command on a group's second
  member
- **THEN** that member and the group's first member trade places
- **AND** no entry outside the group changes its place on the canvas

#### Scenario: A drag out of a group changes nothing

- **WHEN** the developer drags a group member onto a drop slot at the
  form's root
- **THEN** the view array keeps every entry where it was
- **AND** the member stays inside its group

#### Scenario: A root entry's move steps over a whole group

- **WHEN** the developer uses the move-down command on a root entry
  sitting directly above a group card holding three members
- **THEN** that entry lands below the group card and all three members

### Requirement: A "Developer view" disclosure holds two existing CEL and JSON escape hatches

A selected field's override strip already lets `visible`, `required`,
and `readonly` fall back to a CEL expression. That escape hatch SHALL
move behind a "Developer view" disclosure on the strip. It stays
reachable; it starts collapsed.

The process-field catalog panel already lets a custom field type carry
a raw JSON textarea for its plugin envelope. The
`studio-plugin-config-form` capability does not cover this position,
per its own carve-out. That escape hatch SHALL move behind its own
"Developer view" disclosure, on the same collapsed-by-default pattern.

Neither disclosure changes what its escape hatch writes. Both match the
structure editor's own "Developer view" placement convention (see
`studio-canvas`).

#### Scenario: The override strip's CEL input starts collapsed

- **WHEN** a developer selects a placed field whose `required` override
  is already set to a CEL expression
- **THEN** the strip shows no CEL input until the developer opens its
  "Developer view" disclosure

#### Scenario: The field catalog's JSON textarea starts collapsed

- **WHEN** a developer selects a custom field type in the field catalog
  panel
- **THEN** the panel shows no JSON textarea until the developer opens
  its "Developer view" disclosure

### Requirement: An author places a note on the form canvas

The form editor SHALL offer adding a note to the step's view. A note SHALL
appear on the canvas as a card among the field cards. It sits at its own
position in the view array. The card shows the text an author gave it.

The palette lists catalog fields not yet on the form. A note belongs to no
catalog, so the editor SHALL offer it beside the palette rather than inside it.

A placed note SHALL answer the same gestures a field card answers. That
includes the keyboard route reaching a field's position without a drag.

#### Scenario: An author adds a note and positions it

- **WHEN** an author adds a note and moves it above the first field card
- **THEN** the note occupies the view array's first position, and the step's
  draft records it there

#### Scenario: A note is reachable without a drag

- **WHEN** an author moves a note using the keyboard route that moves a field
  card
- **THEN** the note changes position the same way a field card does

### Requirement: A note's strip sets its text, its span, its group and its visibility

Selecting a note SHALL open a strip that sets the note's text. It covers the
body's base locale and any other locale the body declares. The strip SHALL set
the note's `span` and its `group`. For `visible` it SHALL offer the same
condition input a field card's strip offers.

A note has no catalog parent, so its group is a per-step choice. In the form
editor, the note strip is the one place an author makes that choice. The
renderer honors a note's `group`, per the `form-ui` capability. A strip
omitting the control would leave that choice out of an author's reach.

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

- **WHEN** an author selects a note and picks a group field's key in its strip
- **THEN** the draft records that key as the note's `group`, and the note
  renders inside that group's container

#### Scenario: The editor reports a note missing its base-locale text

- **WHEN** a step's view holds a note whose text is empty for the body's
  `baseLocale`
- **THEN** the editor reports it before publish, rather than letting publish be
  the first place an author learns of it

### Requirement: A note marks no catalog field as used

A note SHALL appear in no field usage list. A note SHALL mark no catalog field
as used, so the palette keeps offering every field the notes sit beside.

The count of a step's configured fields lives outside the form editor, on the
Form section. The `studio-app` capability states its rule.

#### Scenario: A note leaves the usage list alone

- **WHEN** a step's view holds one field entry and three notes
- **THEN** that step appears in the usage list of the one field alone

#### Scenario: A note marks no catalog field as used

- **WHEN** a step's view holds notes alone
- **THEN** the palette still offers every catalog field, and the editor reports
  that step as using none

### Requirement: The form editor renders from compiled styles

`screens/FormEditorScreen.tsx` SHALL render from compiled component
styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration.

The "How it will look" preview has a two-column layout. It SHALL pick
its style from a parameterized style function, keyed on the column
count. That is the same pattern `form-ui`'s own field renderer uses
for its own columns/span choice. The preview MAY still render a
`data-columns` fact on its container, for a test or another consumer
to read. No stylesheet SHALL select on it after migration.

#### Scenario: The form editor keeps its look

- **WHEN** a browser renders the form editor
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

#### Scenario: The two-column preview switches correctly

- **WHEN** an author toggles a field group between one and two columns
- **THEN** the preview's computed grid layout matches the deleted
  stylesheet's own two-column and one-column rules
- **AND** no compiled or hand-written stylesheet rule selects on a
  `data-columns` or `data-span` attribute after the migration

### Requirement: A live participant preview stands beside the form canvas

The form editor SHALL carry a preview of what a participant meets. The preview
SHALL stand beside the form canvas, in the editor's trailing pane.

The preview SHALL mount the same `packages/form-ui` renderer the Player mounts.
No second renderer SHALL exist for it. What an author reads in the preview is
therefore what a participant gets.

The preview SHALL follow the view's own column count and its label position.
It SHALL name the process and the step above the fields. Below the fields it
SHALL carry one control per manual path the step declares, taking each path's
own label. A step declaring only automatic paths SHALL carry one submit
control.

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

#### Scenario: The preview takes no focus

- **WHEN** an author walks the form editor with the Tab key
- **THEN** the focus never lands inside the preview

#### Scenario: A required entry marks itself in the preview

- **WHEN** a view entry declares `required: true`
- **THEN** the preview marks that entry's label as required

### Requirement: A tab strip above the canvas authors the form's tabs

A strip above the canvas SHALL read and write the step view's `tabs`. It
SHALL offer adding a tab, renaming one, reordering the list and removing a
tab. Outside the JSON view, this is the only control that writes `tabs`.

A form with no tab SHALL show the strip's add control alone. The canvas then
lays every entry out the way it does today.

The strip SHALL change a tab's name as authored text. It writes the content
locale the studio already resolves authored text for. Adding a tab SHALL seed its
`label` with a non-empty base-locale entry. The draft then never carries a
tab that fails the base-locale rule.

The editor SHALL mint a tab's `key`, unique within the view. The author
names the label; nothing asks them for a key.

The editor SHALL NOT rewrite a tab's `key` afterwards. Renaming a tab changes
its `label` alone. The definition contract makes that key the anchor every
entry's `tab` names. A rewrite would orphan them.

Selecting a tab in the strip SHALL show that tab's own entries on the canvas
and hide the others. Every existing canvas behavior SHALL keep working
within the selected tab. That covers placement, the column count, spans,
groups and the keyboard move commands.

#### Scenario: Adding the first tab

- **WHEN** the developer adds a tab to a form that had none
- **THEN** the draft's `view.tabs` holds one member with a minted key and a
  seeded base-locale label

#### Scenario: Renaming a tab writes its label

- **WHEN** the developer renames a tab
- **THEN** the draft records the new text under the content locale
- **AND** the tab keeps its key, so every entry naming it still resolves

#### Scenario: Selecting a tab filters the canvas

- **WHEN** the developer selects the second tab
- **THEN** the canvas shows the entries naming that tab alone, at the form's
  own column count

### Requirement: Creating and removing a tab leaves no entry stranded

Adding the FIRST tab to a form SHALL move every existing root entry into it.
The draft then satisfies the definition contract's rule for a tabbed view.
The author has no step to remember.

Removing the LAST remaining tab SHALL clear `tab` from every entry and leave
the view with no `tabs` key. The form returns to the shape it had before any
tab existed.

Removing a tab while others remain SHALL move its entries to the tab before
it in the strip. They move to the tab after it when the removed tab was the
first. The editor deletes no entry. It opens no dialog either.

Reordering the strip SHALL change the tab order alone. It SHALL move no entry
between tabs.

#### Scenario: The first tab sweeps up the existing form

- **WHEN** a form holds four root entries and the developer adds a tab
- **THEN** all four entries name that tab, and the canvas shows all four

#### Scenario: Removing the last tab returns the form to one page

- **WHEN** a form holds one tab and the developer removes it
- **THEN** `view.tabs` is gone, no entry carries a `tab`, and every entry
  renders on one canvas

#### Scenario: Removing a middle tab hands its entries to its left neighbour

- **WHEN** a form holds three tabs and the developer removes the second
- **THEN** the second tab's entries name the first tab, in their existing
  order

#### Scenario: Removing the first tab hands its entries to its right neighbour

- **WHEN** a form holds two tabs and the developer removes the first
- **THEN** its entries name the remaining tab

#### Scenario: Reordering moves no entry

- **WHEN** the developer moves the third tab to the front
- **THEN** `view.tabs` records the new order, and every entry keeps the tab
  it named

### Requirement: A selected entry's strip assigns it to a tab

The strip that already sets an entry's overrides SHALL carry a tab picker. It
SHALL list the form's tabs and write the selected entry's `tab`. This covers
both entry kinds. A note's strip carries the picker beside the note's group
picker. A field's strip has no group picker, since the field catalog decides
a field's group.

The picker SHALL stay inert for an entry that names a group. Its group
decides its tab, per the definition contract's rule that a group and its
members share one tab. The picker SHALL show that group's tab, with a note
saying the group decides it.

Assigning a note to a group SHALL clear that note's own `tab`. Clearing a
note's group on a tabbed form SHALL set its `tab` to the tab the canvas is
showing. A field entry's group changes through the catalog move alone. The
`studio-app` capability states what that move does on a tabbed form. Neither
path leaves a draft the contract rejects.

The picker SHALL offer no empty choice on a tabbed form. A root entry there
always names a tab. No selectable state then reaches a draft the contract
rejects.

Moving a group between tabs SHALL move its members with it. The members have
no `tab` of their own, so nothing else has to change.

#### Scenario: The picker writes the selected entry's tab

- **WHEN** the developer selects a root field and picks the second tab
- **THEN** the draft records `tab` on that entry, and the card leaves the
  first tab's canvas

#### Scenario: A grouped entry's picker stays inert and says why

- **WHEN** the developer selects a field that names a group
- **THEN** the tab picker shows the group's tab and stays inert
- **AND** it states that the group decides the tab

#### Scenario: A field's strip offers a tab picker and no group picker

- **WHEN** the developer selects a root field on a tabbed form
- **THEN** the strip shows the tab picker
- **AND** it shows no control for `group`

#### Scenario: Moving a field into a group clears its tab

- **WHEN** the canvas shows a root field on a tabbed form
- **AND** the developer moves that field into a group in the field catalog
- **THEN** the entry carries the group and no longer carries a `tab`

#### Scenario: Moving a field out of a group assigns the shown tab

- **WHEN** the canvas shows a group card and its member field on the second tab
- **AND** the developer moves that field out of the group in the field catalog
- **THEN** that entry names the second tab

#### Scenario: Placing a note in a group clears its tab

- **WHEN** the developer picks a group in a root note's strip
- **THEN** the note entry carries the group and no longer carries a `tab`

#### Scenario: Taking a note out of a group assigns the shown tab

- **WHEN** the developer clears a note's group while the canvas shows the
  second tab
- **THEN** that note names the second tab

#### Scenario: A note takes a tab the same way a field does

- **WHEN** the developer selects a note and picks the third tab
- **THEN** the draft records `tab` on the note entry

### Requirement: The live preview beside the canvas shows the form's tabs

The participant preview SHALL show the draft's tabs, through the same
`FieldForm` a participant gets. It SHALL open the tab the canvas is showing.
The two halves of the editor then never disagree about which tab is open.

The strip the preview draws SHALL NOT be interactive. This capability's own
live requirement gives the preview the `inert` attribute, so it takes no
pointer interaction and no keyboard focus. A tab there is part of what an
author reads.

The canvas carries the strip an author operates. At the editor's default
width the preview stands beside that canvas, in its own column. It drops
below only under the narrow breakpoint. Either way the two strips show one
selection, and only one of them takes a click. The author gives up nothing.

One selected-tab value SHALL drive both halves. The editor owns it and passes
it to `FieldForm` as `activeTab`, taking `onTabChange` back. That is the
`form-ui` capability's own controlled shape, so the two halves cannot drift.
`onTabChange` stays wired and stays silent while `inert` holds.

#### Scenario: The preview opens the tab the canvas shows

- **WHEN** the developer selects the second tab on the canvas
- **THEN** the preview draws the tab strip with the second tab open

#### Scenario: The preview's own strip takes no click

- **WHEN** the developer clicks a tab inside the preview
- **THEN** nothing moves, because the preview carries `inert`
- **AND** the canvas keeps showing the tab it showed

### Requirement: Removing a group card removes the members placed inside it

Removing a group card from the canvas SHALL remove every entry placed
inside that group. One draft change carries all of it. That covers
field members and note members alike.

The catalog keeps every field. Each removed member SHALL return to the
palette, and the group's own entry SHALL return with them.

A member cannot outlive its group card on a form. The definition
contract already refuses a body whose entry names a group the view
leaves out. Leaving the members behind would hand the author a draft
that no publish accepts. Nothing on the canvas would explain it.

#### Scenario: Removing a group takes its members off the form

- **WHEN** the developer removes a group card holding two placed member
  fields
- **THEN** the view carries neither the group entry nor either member
- **AND** all three appear in the palette again

#### Scenario: Removing a group takes a note placed inside it

- **WHEN** the developer removes a group card holding a note
- **THEN** the view carries neither the group entry nor the note

#### Scenario: Removing a group leaves the catalog alone

- **WHEN** the developer removes a group card holding two placed member
  fields
- **THEN** the field catalog still declares the group and both fields,
  nested as before

#### Scenario: Removing one member leaves the group standing

- **WHEN** the developer removes a single member card from inside a
  group
- **THEN** the group card stays on the canvas, with its other members

### Requirement: On a tabbed form, a group card holds its members on its own tab

On a tabbed form the canvas SHALL draw the shown tab's root entries. A group
card among them SHALL nest its members, and a member SHALL draw nowhere else.
A member has no `tab` of its own, so its card's tab is its tab. The canvas
and the preview then agree on which entries each tab draws.

A root entry's move commands SHALL step among the roots the shown tab draws.
A move past a group card SHALL clear the card and every member at once. An
entry another tab draws SHALL neither stop the move nor count as a step. A
member's move commands SHALL step among its own group's members, whatever tab
the canvas draws.

A root card's drag SHALL land only among the roots its own tab draws. A
member's drag SHALL land only among its own group's members. No canvas drop
SHALL place a member outside its group.

A palette drop on a tabbed form SHALL give the shown tab to the one root entry
it places. That entry is the outermost group card it places, or a top-level
field. A member and an inner card SHALL have no `tab`. A member joining a
card the form already carries SHALL land on that card's tab.

Removing a group card on a tabbed form SHALL remove its members as it does on
an untabbed form. Every other entry SHALL keep its `tab`.

Adding the first tab SHALL give its key to the root entries alone. Removing a
tab SHALL move a group card on it like any root entry. The card's members
SHALL move with it.

#### Scenario: A tab draws a group card with its members

- **WHEN** a tabbed form's first tab holds a group card with two members
- **AND** its second tab holds a root field
- **THEN** the canvas on the first tab draws both members inside the group card
- **AND** it draws no card for the root field

#### Scenario: A group card draws on no other tab

- **WHEN** the developer selects the second tab of that form
- **THEN** the canvas draws the root field alone, and neither the group card
  nor a member

#### Scenario: A root's move steps over a group and past another tab's entry

- **WHEN** the developer uses the move-down command on a root field directly
  above a group card on the shown tab
- **AND** an entry the second tab draws sits between the two in the view array
- **THEN** the root field lands below the group card and all its members on
  the canvas
- **AND** the second tab draws that entry where it drew it before

#### Scenario: A member's move reads its group alone

- **WHEN** the developer uses the move-down command on a group's first member
  on a tabbed form
- **THEN** that member and the group's second member trade places

#### Scenario: A root's drag stays on its tab

- **WHEN** the developer drags a root card on a tabbed form
- **THEN** only drop slots among the roots of that card's own tab accept it

#### Scenario: A palette drop gives the tab to the outermost card

- **WHEN** the catalog nests a field inside a group inside another group
- **AND** the developer drags that field onto a tabbed form carrying neither card
- **THEN** the outer group card carries the shown tab
- **AND** neither the inner group card nor the member carries a `tab`

#### Scenario: Removing a group card on a tabbed form

- **WHEN** the developer removes a group card holding two members on a tabbed
  form
- **THEN** the view carries neither the card nor either member
- **AND** every other entry keeps the `tab` it carried

#### Scenario: The first tab gives no member a tab

- **WHEN** the developer adds the first tab to a form holding a group card and
  its members
- **THEN** the group card carries the new tab, and no member carries a `tab`

#### Scenario: Removing a tab carries a group card's members along

- **WHEN** a form holds two tabs, with a group card and its members on the
  second
- **AND** the developer removes the second tab
- **THEN** the group card names the first tab
- **AND** its members still sit inside it, carrying no `tab`
