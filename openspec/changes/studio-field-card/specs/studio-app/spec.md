# Spec Delta

## ADDED Requirements

### Requirement: The Fields view draws one card in sections

The Catalog view SHALL draw the selected field as one card in one column.
The card SHALL cap at 52rem and stand flush left beside the entity rail. The
card SHALL open with its name line, then the Name and Description inputs. Then its sections SHALL read Kind,
Choices, Asked on, Read by and More, in that order.

A group field SHALL add
"Fields inside this group" before More and have no Read by. Remove field
SHALL close the card. The view SHALL draw no half, no zone and no tab set.

#### Scenario: The card reads top to bottom

- **WHEN** the developer opens the Fields view on a `string` field
- **THEN** the name line prints the field's name, and the Name input
  follows it with no section heading between them
- **AND** the headings Kind, Choices, Asked on, Read by and More follow in
  that order
- **AND** no heading reads "What this field asks", "What kind of field",
  "Used in" or "Ask for this"

#### Scenario: A group's card has no Read by

- **WHEN** the developer opens the Fields view on a `group` field
- **THEN** the card shows "Fields inside this group" directly before More
- **AND** no Read by heading renders

#### Scenario: Each section stands under a ruled heading

- **WHEN** the developer opens the Fields view on any field
- **THEN** each heading after Kind carries a 1px hairline above it
- **AND** Remove field stands last, under a hairline of its own

### Requirement: A group's card adds a field inside it

A group field's "Fields inside this group" section SHALL draw none of the
group's fields. The entity rail lists them. It SHALL hold one
control, which adds a field at the end of the group. The tab SHALL then
select that new field, and keyboard focus SHALL land in its Name input. The
rail SHALL bring the new entry into view where it sits outside the rail's
visible part. It SHALL use no animated scroll and SHALL scroll no further.

#### Scenario: A group's own section adds a field and selects it

- **WHEN** the developer uses the control in a group field's "Fields inside
  this group" section
- **THEN** the group's `fields` array carries one more field, at its end
- **AND** the tab selects that field and shows its own card
- **AND** keyboard focus sits in that field's Name input

#### Scenario: The rail brings a new field in a long group into view

- **WHEN** a group holds 18 fields, and the rail shows the group's entry but
  not its last field's entry
- **AND** the developer uses the control in that group's section
- **THEN** the rail shows the new field's entry, carrying the current mark
- **AND** the rail reaches that position at once, with no smooth scroll

#### Scenario: A new entry the rail already shows moves no rail

- **WHEN** the rail shows a group's last field and the entry after it
- **AND** the developer uses the control in that group's section
- **THEN** the rail keeps its scroll position
- **AND** the new field's entry carries the current mark

#### Scenario: Only a group field holds the section

- **WHEN** the developer opens the Fields view on a group field, then on a
  `string` field
- **THEN** the group's card shows "Fields inside this group" before More
- **AND** the `string` field's card shows no such section

### Requirement: The Choices section shows for a field that can take choices

The card SHALL draw the Choices section for a field whose `control` is a
picker. It SHALL draw it for a `string` or `list` field with no `format`
too. It SHALL draw it for any field already carrying `options` or a
`dataSource`. Any other field with neither SHALL draw no Choices section. A field with no choice and no source SHALL
read "No choice yet, so a participant types freely. Add one to offer a list
instead." above the add control.

#### Scenario: A text field offers choices

- **WHEN** the developer opens the Fields view on a `string` field with no
  `options`
- **THEN** the Choices section shows the sentence that a participant types
  freely, and "+ Add a choice"

#### Scenario: A number field draws no Choices section

- **WHEN** the developer opens the Fields view on a `number` field with no
  `options` and no `dataSource`
- **THEN** no Choices heading renders

#### Scenario: A date field draws no Choices section

- **WHEN** the developer opens the Fields view on a `{type: "string",
  format: "date"}` field with no `options`
- **THEN** no Choices heading renders

### Requirement: A choice reads by its name alone

Each choice SHALL draw as one row holding the choice's name input and a
Remove command. No value input SHALL stand in the row. The section SHALL
end with "+ Add a choice". The section SHALL hold a closed Developer view
listing each choice's stored value in a mono input captioned "Stored value".
A new choice SHALL start with an empty name and an empty value.

#### Scenario: A choice row holds its name alone

- **WHEN** the developer opens a field carrying the options `open` and
  `closed`, labelled Open and Closed
- **THEN** the Choices section shows two rows, each with one name input and
  a Remove command
- **AND** neither row shows `open` or `closed` outside the Developer view

#### Scenario: The Developer view shows the stored values

- **WHEN** the developer opens the Choices section's Developer view
- **THEN** it lists "Stored value" inputs reading `open` and `closed`, in
  the mono face

### Requirement: A choice's value follows its name until the first publish

A choice's stored value SHALL follow its name the way a field's key follows
its label. A value the prior name derived SHALL take the new name's
derivation, stepped past the sibling values. An empty value SHALL take it
too. A value typed in the Developer view SHALL stay.

Once a choice's value
stands in a published version, that value SHALL NOT move. A choice added
after the publish follows its name. A moved value SHALL carry the field's
own `default` along where it equals the old value.

#### Scenario: Naming a new choice sets its value

- **WHEN** the developer adds a choice and types "In review" as its name
- **THEN** the draft's option carries `value: "in_review"`

#### Scenario: Renaming a choice moves a derived value

- **WHEN** a choice named "In review" carries the value `in_review`
- **AND** the developer renames it "Under review"
- **THEN** the option's value reads `under_review`

#### Scenario: A hand-set value stays

- **WHEN** the developer types `rv` into a choice's "Stored value" input and
  then renames the choice
- **THEN** the option's value stays `rv`

#### Scenario: A second choice steps past a sibling's value

- **WHEN** two choices are both named "Yes"
- **THEN** the second carries the value `yes_2`

#### Scenario: A published choice's value stays

- **WHEN** the draft's base version holds the field with the choice `open`
- **AND** the developer renames that choice
- **THEN** the option's value stays `open`
- **AND** the Developer view reads "This field is in a published version. The
  name no longer sets its values."

#### Scenario: A choice added to a published field follows its name

- **WHEN** the draft's base version holds the field without the choice
- **AND** the developer adds a choice and names it "In review"
- **THEN** the option's value reads `in_review` and follows a later rename

#### Scenario: A moved value carries the default along

- **WHEN** a field carries `default: "in_review"` and the choice `in_review`
- **AND** the developer renames that choice "Under review"
- **THEN** the field's `default` reads `under_review`

### Requirement: A field bound to a source states where its choices come from

A field carrying a `dataSource` SHALL draw no choice row and no add control.
Its Choices section SHALL read "The choices come from {source}." with the
source's name, then "Pick another source under More."

#### Scenario: A bound field names its source

- **WHEN** a field binds the data source named "Cost centres"
- **THEN** its Choices section reads "The choices come from Cost centres."
- **AND** no name input and no "+ Add a choice" renders

### Requirement: Asked on lists each step's marks as words

The Asked on section SHALL list one row per step whose form holds the
field, in draft order. A row SHALL name the step, or "(unnamed step)". It
SHALL print the marks Required, Read-only and Not asked as words in the
body face. They stand for a literal `required: true`, `readonly: true` and
`visible: false`. A `required` or `readonly` expression SHALL print no mark. No row
SHALL print a flag key or the mono face.

#### Scenario: A row prints its marks as words

- **WHEN** a field's entry on the step Review carries `required: true` and
  its entry on Approve carries `readonly: true`
- **THEN** the Asked on rows read "Review" with Required and "Approve" with
  Read-only
- **AND** no row prints `required` or `readonly`

#### Scenario: A hidden entry reads Not asked

- **WHEN** a field's entry on the step Review carries `visible: false`
- **THEN** that row prints the mark Not asked

#### Scenario: A conditional requiredness prints no mark

- **WHEN** a field's entry on Review carries `required: data.amount > 0.0`
- **THEN** the Review row prints no Required mark and no sentence for it

### Requirement: An Asked on row reads a step's own condition as a sentence

Where a step's entry carries a `visible` expression, its Asked on row SHALL
add that condition as a sentence. It stands under the step's name, as a
Read by row's does. An entry with no expression SHALL add no sentence. The rows
therefore read each step's condition while the steps disagree.

#### Scenario: A conditional entry reads its sentence

- **WHEN** a field's entry on Review carries `visible: data.amount > 0.0`
- **AND** the field `amount` carries the label "Amount"
- **THEN** the Review row reads "Amount is greater than 0."

#### Scenario: Disagreeing steps each read their own condition

- **WHEN** the entry on Review carries one `visible` expression and the
  entry on Approve carries another
- **THEN** each row reads its own sentence
- **AND** the Only ask this when control under them states that the steps
  disagree

### Requirement: An Asked on row opens the form and the map

Each Asked on row SHALL carry two authoring commands at its trailing edge.
"Open the form" SHALL open that step's form editor. "Show on the map" SHALL
open the Map tab with that step selected.

#### Scenario: Open the form reaches the step's form

- **WHEN** the developer presses "Open the form" on the Review row
- **THEN** the form editor opens for Review

#### Scenario: Show on the map selects the step

- **WHEN** the developer presses "Show on the map" on the Review row
- **THEN** the Map tab opens with Review selected

### Requirement: A Read by row opens the place it names

Each Read by row whose place the studio can open SHALL carry the authoring
command "Open". A way out's row SHALL open the Steps tab on that step with
that way out marked. A form condition's row and a step rule's row SHALL open
that step's form editor. A time limit's row and a child mapping's row SHALL
open the Steps tab on that step. A field rule's row and a default's row
SHALL select that field and open its More. A fallback place SHALL have no
command.

#### Scenario: A way out's row opens its step

- **WHEN** the developer presses "Open" on the row "On Review: way out
  Approve → Book"
- **THEN** the Steps tab opens on Review with that way out marked

#### Scenario: A field rule's row opens the other field

- **WHEN** the developer presses "Open" on the row "The rule for Total"
- **THEN** the rail selects Total and its card opens with More unfolded

#### Scenario: A fallback row has no command

- **WHEN** a Read by row reads "Another rule in this process"
- **THEN** that row has no "Open" command

### Requirement: More folds the rest of the card

The card's More SHALL be one disclosure, closed when the field opens. It
SHALL hold seven parts in order. They are Where values come from with the
column mapping, Default value and Validation. Then the Technical marker,
Move this field to, and How it will look. A Developer view closes it,
holding the key input and a plugin-typed field's envelope.

More SHALL open by itself while
a check inside it stands. The author's own toggle SHALL hold otherwise.

#### Scenario: More stands closed on open

- **WHEN** the developer opens the Fields view on a field with no check
- **THEN** More stands closed, and no Default value, Validation or key
  input is visible

#### Scenario: More holds its parts in order

- **WHEN** the developer opens More
- **THEN** Where values come from, Default value and Validation come first
- **AND** the Technical checkbox, Move this field to, How it will look and
  Developer view follow, in that order

#### Scenario: A check inside More opens it

- **WHEN** the selected field's validation pattern does not compile
- **THEN** More stands open, and the check shows under Validation

### Requirement: The source picker names each source

The "Values come from" picker in More SHALL print its first option as
"Nowhere: this field lists its own choices". Every other option SHALL print the
data source's name, or "(unnamed source)". No option SHALL print an id.

#### Scenario: The picker prints names

- **WHEN** the draft declares a data source named "Cost centres" and one with
  no name
- **THEN** the picker offers "Nowhere: this field lists its own choices",
  "Cost centres" and "(unnamed source)"
- **AND** no option prints a `ds_` id

### Requirement: The Technical marker reads as a sentence in More

The Technical checkbox SHALL stand in More, labelled "Technical: the
process fills this in by itself". It SHALL keep its clearing pass and
its confirmation. A group field SHALL still disable it.

#### Scenario: The marker stands in More under its sentence

- **WHEN** the developer opens More on a `string` field
- **THEN** a checkbox labelled "Technical: the process fills this in by
  itself" stands after Validation

### Requirement: Where values come from names a source in the author's words

The data source view SHALL head its editor with the source's name, or
"(unnamed source)". The name input SHALL carry the caption "Name" and take
the body face. The engine matches nothing by a source's key. The removal
dialog SHALL print the name in the body face too.

#### Scenario: The editor heads with the name

- **WHEN** the developer opens the source named "Cost centres"
- **THEN** the editor's heading reads "Cost centres"
- **AND** the input under "Name" reads "Cost centres" in the body face

### Requirement: The source's kind picker prints names

The kind picker SHALL stand under the legend "What kind of source". It SHALL
print each registered type's name. The name for `db.list` reads "A data list
an operator keeps". The name for `instance.query` reads "Cases of another
process". A type the table does not name SHALL print its registry type.

#### Scenario: The kind picker prints names

- **WHEN** the registry reports `db.list` and `instance.query`
- **THEN** the kind picker offers "A data list an operator keeps" and
  "Cases of another process"

#### Scenario: The rail names a source

- **WHEN** a draft holds a source named "Cost centres" and one with no name
- **THEN** the entity rail reads "Cost centres" and "(unnamed source)"

### Requirement: The matrix badges print each mark's word

Each bulk badge SHALL print the flag's one name: Asked, Required or
Read-only. No badge SHALL print a letter code. The three badges in one
header SHALL share one width, the widest word's.

#### Scenario: A badge reads its word

- **WHEN** the developer reads a column header's badges
- **THEN** they read Asked, Required and Read-only
- **AND** none reads `VIS`, `REQ` or `RO`

### Requirement: A condition mark reads Condition

A live cell whose flag carries an expression SHALL show a mark reading
"Condition" in place of that flag's control. The expression's source SHALL
stay in the mark's tooltip and its muted source span, and nowhere else.

#### Scenario: A CEL flag reads Condition

- **WHEN** a live cell's `required` carries an expression
- **THEN** the cell shows "Condition" where the Required box would stand
- **AND** no cell prints the word "CEL"

### Requirement: The Fields tab's editor scrolls with the tab body below 64rem

Below 64rem the entity rail SHALL stand above the card, capped at 20rem.
The card SHALL have no scroll box of its own. The view body SHALL scroll
the card instead. The tab then holds two scroll boxes, the rail and the
view body, and no third.

#### Scenario: The card has no scroll box at 1024px

- **WHEN** the developer opens the Fields view at 1024px wide
- **THEN** the card's container reads `overflow-y: visible`
- **AND** the view body scrolls the whole card

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: the heading repeats the live spec's wording, which a MODIFIED block must match. -->
### Requirement: The panels screen is a routed sub-state of the edit screen

<!-- antislop: allow trailing-negation synonym-rotation -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
The six tabs SHALL sit on a routed surface, not behind a dialog. The path
SHALL read `/processes/:id/edit/:tab`. Here `:tab` is one of `map`, `steps`,
`fields`, `forms`, `checks` or `settings`. A view of the Fields or Settings
tab rides as a further segment, `/processes/:id/edit/:tab/:view`.

That path SHALL be a sub-state of the `edit` route. It rides as an optional field
on the same route object, the shape `formStepId` already takes. The
`studio-form-editor` capability routes its own screen that way.

An unrecognized `:tab` SHALL fall back to the Map tab. The routing table
already answers an unrecognized path with the process list, and this is that rule
one level down.

<!-- antislop: allow trailing-negation -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
The surface SHALL stand the tab row above one body. The body SHALL hold the open
tab alone. No rail of tab names SHALL stand beside it. The rail's one-line
summary SHALL stand in the studio's area nav, not at the surface's bottom edge.
See the `studio-checks-rail` capability for what the rail carries there.

<!-- antislop: allow negation-habit -->
<!-- Why: the paragraph repeats the live spec's wording verbatim; this change edits one sentence of the block. -->
A tab SHALL fill the body. The tab row above it SHALL keep every other tab one
click away. The surface therefore needs no control back to the canvas.

A step target SHALL ride on the `edit` route at its own path segment,
`/processes/:id/edit/step/:stepId`, ranked after the `tab` and `formStepId`
matches.

Choosing a "Show on the map" control SHALL open the Map tab with that step
preselected. The Map tab SHALL read the target on every change of it, and on
mount. Reaching it from another tab therefore still selects the step.

Once read, the surface SHALL replace that history entry with the plain `edit`
route. It SHALL NOT leave the step target addressable. The browser's Back control
therefore still returns to the tab the navigation came from, per
`unified-shell`'s navigation requirement.

The body SHALL fill the height the header rows and the tab row leave. It SHALL
stop above the floor the surface uses. A taller window therefore carries a taller
body, and no empty band sits below it.

#### Scenario: The columns fill a tall window

- **WHEN** the author opens a tab on a window taller than the floor
- **THEN** the body reaches the surface's bottom edge
- **AND** no empty band sits below it

#### Scenario: A short window holds the floor

- **WHEN** the author opens a tab on a window shorter than the floor
- **THEN** the body holds that floor and the page scrolls

#### Scenario: The screen stands no checks column

- **WHEN** the author opens a tab
- **THEN** the open tab fills the body
- **AND** the checks summary stands in the area nav, in no column of its own

#### Scenario: A view has its own address

- **WHEN** the author opens Where values come from on the Fields tab
- **THEN** the address bar reads `/processes/:id/edit/fields/sources`, and
  loading that path directly opens the same view

#### Scenario: The Changes and Paths views have addresses too

- **WHEN** the author loads `/processes/:id/edit/changes`
- **THEN** the Versions screen opens, where the change list stands now
- **AND** loading `/processes/:id/edit/paths` opens the Steps tab

#### Scenario: A reload keeps the open view

- **WHEN** the author reloads the browser on the Settings tab's What it takes
  in and gives back view
- **THEN** the surface reopens on that view, with Map closed

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Back leaves the screen rather than the process

- **WHEN** the author reaches the Fields tab from the Map tab and presses
  the browser's Back control
- **THEN** the Map tab returns, and the draft keeps every change

<!-- The scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: Show on the canvas preselects a step

- **WHEN** the author picks "Show on the map" on a used-in row of the
  Fields tab
- **THEN** the Map tab opens and selects the step that row named

#### Scenario: An unknown view falls back to the canvas

- **WHEN** the author loads `/processes/:id/edit/nonsense`
- **THEN** the Map tab opens, and the surface reports no issue

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the process surface, a noun, and no verb of display. -->
Leaving a tab SHALL discard nothing. The surface SHALL state that plainly, so
leaving a tab never reads as a discard.

A tab's own unsubmitted input SHALL survive a switch between tabs. The contract
panel holds a half-typed outcome name in component state. The data sources panel
fetches its list keys on mount. The field matrix holds its selected cell in
component state. Every tab and every view SHALL therefore stay mounted for as
long as the process surface is open. Switching a tab or a view SHALL reveal
and hide them, rather than mount them.

The Fields tab's count says how many fields the catalog holds. A rail row's
issue mark says whether that entity is wrong. Only the issue mark takes the
refusal tone. A row SHALL have no issue mark while its entity has no issue.

Two views SHALL each stand an entity rail beside the open editor. They are
the Fields tab's Catalog view and its Where values come from view. The rail SHALL list that view's own entities, and an Add entry too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. On the Fields tab, the Add entry SHALL add a top-level field. A group
field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

The contract holds a single editor, so its view SHALL stand no entity rail.
The field matrix draws a grid, so its view SHALL stand none either.

A view SHALL stand its own rail alone. No view SHALL list another view's
entities.

Choosing a field nested inside a group SHALL select that field. The tab SHALL
open that field's own editor, the same one a top-level field opens. The rail
SHALL mark that entry alone, and it SHALL leave the group's own entry unmarked.

On the Fields tab, a newly chosen field's editor SHALL open at its top. A move
keeps the same field selected, and the editor keeps its scroll position.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Inside a group, the neighbour
SHALL be the next field of that group, then the previous one, then the group.
Switching to another tab and back SHALL keep the selection the first tab held.

Each entity entry SHALL carry its own issue mark, separate from the tab's issue
count. One entity at a time otherwise hides a broken entity behind whichever
entry an author has open.

The rail SHALL mark the selected entity with `aria-current`. A rail entry selects
an entity rather than disclosing adjacent content, so it SHALL NOT carry
`aria-expanded`. The `studio-process-tabs` capability states the tab row's own
tab-set semantics.

The rail SHALL cap indentation at two levels. A group field's children indent
once. A field nested deeper SHALL take its own top-level rail entry rather than a
deeper indent. This is a rail-rendering rule only: the draft's own field tree
SHALL keep whatever depth it declares.

The Fields rail entry SHALL name a field by its resolved label alone, on one
line. A label too long for the rail's width SHALL truncate there rather than
wrap onto a second line. An icon for the field's kind SHALL lead the label on
that same line. The issue mark SHALL follow the label there.

The entry SHALL print neither the kind name nor a group's name as visible
text. The indent alone SHALL show the group. The kind name SHALL stay the
icon's tooltip, and it SHALL stay part of the entry's accessible name. A
nested entry's accessible name SHALL also carry the name of the group that
holds its field. The indent shows that group to a sighted author alone.

The row SHALL NOT print the field's key. The key stays in the field
card's More, in its Developer view, once an author selects that field. The
engine's own exact-match value already lives there. The Data sources rail
entry names its data source through the same rail-row name element. An
over-long data source key SHALL truncate on its one line the identical way.

The kind icon and the kind name SHALL come from the same table the kind picker
reads. Each kind SHALL take an icon no other kind takes. A plugin-typed field
SHALL take one further icon. A field whose members name no kind SHALL take
another. A row naming the base type while the picker beside it names the kind
would give one field two vocabularies. The row's kind name therefore reads
"Date" where the picker reads "Date".

The rail SHALL keep the fallback name it carries today. It SHALL trigger on an
EMPTY RESOLVED LABEL rather than an empty key. The label is the row's primary
text now. A field carrying a key but no label needs the fallback exactly as an
empty-key field did before.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the author adds a field on the Fields tab and then opens the
  Map tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the contract view, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on Where fields
  appear and activates it
- **AND** the author opens the Settings tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Settings tab prints no count, and
  the contract view stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three, and that field's rail row carries an
  issue mark. Only the mark takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** no data source rail row carries an issue mark

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry instead of a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the author picks the second in
  the rail
- **THEN** the Fields tab renders that field's editor, and it renders neither
  of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the author picks the second
  in the rail
- **THEN** Where values come from renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens Where values come from on a draft that carries
  both fields and data sources
- **THEN** that view's rail lists the data sources, and it lists no field

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child now opens its own editor. -->
#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders that child's own editor, with both halves
- **AND** the rail marks the child's entry alone, and neither the group's
  entry nor a sibling's entry

#### Scenario: A newly chosen field's editor opens at its top

- **WHEN** the author scrolls a field's card down to its "Validation" part
- **AND** the author picks another field in the rail
- **THEN** the editor shows that field's card at its
  top

#### Scenario: The Fields rail adds a field

- **WHEN** the author picks the rail's Add entry on the Fields tab
- **THEN** the draft carries one more field, the rail lists it, and the tab
  renders that new field

<!-- The heading keeps the live spec's wording; the entry now offers the drag, and the editor holds the control. -->
#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry offers the drag that moves its field, and no
  data source entry offers one
- **AND** no rail entry carries a move control of its own

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; "names" means printed text, and a nested entry's accessible name carries the group's name. -->
#### Scenario: A rail entry names no group

- **WHEN** a draft carries a group field holding two fields
- **THEN** both child entries indent once under the group's entry
- **AND** neither child entry prints the group's name

#### Scenario: A nested entry's accessible name carries its group's name

- **WHEN** a draft carries a group field holding a field
- **THEN** the child entry's accessible name carries the group's name
- **AND** the entry prints no group name as visible text

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: Removing a field inside a group selects the field after it

- **WHEN** a group holds three fields, and the author removes the first
- **THEN** the tab renders the field that followed it in that group

#### Scenario: Removing a group's last field selects the field before it

- **WHEN** a group holds three fields, and the author removes the third
- **THEN** the tab renders the group's second field

#### Scenario: Removing a group's only field selects the group

- **WHEN** a group holds one field, and the author removes it
- **THEN** the tab renders the group's own editor

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on Where values come from
- **THEN** the draft carries one more data source, the rail lists it, and the
  view renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on Where values come from
- **THEN** the view renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: A nested field's entry marks its own check

- **WHEN** a field inside a group carries a check on its key
- **THEN** that field's own rail entry carries the issue mark
- **AND** the group's entry carries none for that check

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has a
  `label` carrying the base-locale value but no `de` value
- **THEN** the Fields tab carries the missing-translation warning next to
  that field's label input

#### Scenario: The Fields rail row shows no key

- **WHEN** the author opens the Fields tab on a draft whose fields each carry
  a `key`
- **THEN** every rail row carries the resolved label, the kind icon and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row's kind icon carries, as its tooltip, the word the kind
  picker shows for that field

#### Scenario: Each kind takes its own icon

- **WHEN** a draft carries one field of each kind the kind picker offers
- **THEN** each of those rail entries shows an icon no other entry shows
- **AND** no entry prints its kind name as visible text

#### Scenario: A plugin-typed field takes the plugin icon

- **WHEN** a draft carries a field whose `type` is a plugin envelope
- **THEN** its rail entry shows the plugin icon, and the icon's tooltip reads
  the kind picker's custom-type word

#### Scenario: A long field name truncates instead of wrapping

- **WHEN** a field's resolved label is longer than the rail entry's own
  width, especially once indented under a group
- **THEN** the rail entry shows the label truncated on its one line. It
  prints no character of it on a line of its own

<!-- A MODIFIED block keeps every scenario, so this heading stays though the kind name no longer prints. -->
#### Scenario: A long kind name truncates instead of wrapping

- **WHEN** a field's kind name is longer than any share of the rail entry's
  line
- **THEN** the rail entry keeps its one line and prints no character of the
  kind name on it. The icon's tooltip carries the kind name whole

#### Scenario: A long data source key truncates instead of wrapping

- **WHEN** a data source's `key` is longer than the Data sources rail
  entry's own width
- **THEN** the rail entry shows the key truncated on its one line. It
  prints no character of it on a line of its own

### Requirement: The field catalog's definition half offers a Technical control

The field card's More SHALL offer a Technical checkbox for the selected
field. Its label reads "Technical: the process fills this in by itself". A
field nested inside a group SHALL offer it in that field's own card.
Checking it SHALL write `technical: true`. Unchecking it SHALL delete the
`technical` key. Every other view-flag control in the studio already
follows that same convention for its own default value.

A group's child holds a value of its own, and a structural source can
write it. The compile rule and the rail's own finding both read the
flattened catalog. A control on the top-level field alone would leave
one gap. A nested field would state `technical` through the JSON view
alone.

Checking it SHALL also delete every `required` and `readonly` key that
any step's `view.fields[]` entry carries for that field. That deletion
SHALL happen in the same draft mutation. The definition contract rejects
those keys on a technical field's entry.

Every builder control that could clear one also goes away as the
developer checks the box. The strip omits them, the matrix cell disables
them, the row offers no bulk badge. Without the clearing pass, a stale
key would block the publish. The JSON view would be the only route back
to it. The pass SHALL walk every step, including a step the field matrix
omits.

Unchecking SHALL write no `required` or `readonly` key back. The pass
records no prior state, so an uncheck cannot restore an authored
`required: true` or `readonly: true` the check deleted. Restoring a
default-valued key instead would move `definitionHash` under a change
that alters no behaviour. Restoring an authored one is not possible.

Checking Technical SHALL need a confirmation before the clearing
pass runs. The confirmation SHALL name the count of `required` and
`readonly` keys the pass will delete. Declining it SHALL leave the
draft as it stands, with no `technical` key written. Checking
Technical on a field carrying no such key SHALL run no confirmation.

A field of `type: "group"` SHALL disable the control, at any nesting
depth. The definition contract rejects `technical: true` on a group
field. Offering the control there would only invite a rejected publish.

#### Scenario: Checking Technical writes the key

- **WHEN** the developer checks Technical on a non-group field in the
  field catalog
- **THEN** that field's `technical` key becomes `true`

#### Scenario: Checking Technical clears the field's stale flag keys

- **WHEN** one step's view entry for a field carries `required: true`
- **AND** another step's entry for it carries `readonly: false`
- **AND** the developer checks Technical on that field
- **THEN** neither entry carries a `required` or a `readonly` key
- **AND** the draft publishes

#### Scenario: Unchecking Technical deletes the key

- **WHEN** the developer unchecks Technical on a field already carrying
  `technical: true`
- **THEN** that field has no `technical` key
- **AND** no view entry regains a `required` or `readonly` key

#### Scenario: A group's child offers the control

- **WHEN** the developer selects a field nested inside a `type: "group"`
  field
- **THEN** that field's own card offers the Technical checkbox, in More

#### Scenario: A group field disables the Technical control

- **WHEN** the developer selects a field of `type: "group"` in the field
  catalog
- **THEN** the field catalog disables the Technical checkbox

#### Scenario: Checking Technical confirms the keys it will delete

- **WHEN** the developer checks Technical on a field whose view entries
  carry three `required` or `readonly` keys across the draft's steps
- **THEN** the field catalog asks for a confirmation naming that count
  of keys
- **AND** declining it leaves every one of those keys in place, and
  writes no `technical` key

#### Scenario: A field with no stale key confirms nothing

- **WHEN** the developer checks Technical on a field no view entry
  carries a `required` or `readonly` key for
- **THEN** the field catalog asks for no confirmation

### Requirement: A field's key input stands in a Developer view

The field card's More SHALL hold a "Developer view" disclosure, closed
when the field opens, as its last part. It SHALL hold the key input under
"Key". No key input SHALL stand outside it, for a `group` too.

#### Scenario: The key stands behind the Developer view

- **WHEN** the author opens a field in the field catalog
- **THEN** no key input is visible until the Developer view opens

### Requirement: The field editor lists what reads the field

The field card SHALL hold a "Read by" section after Asked on. A `group`
has no such section. The section SHALL list one row per CEL expression
that reads `data.<key>`, in draft order. It counts the way a key change
does.

A row SHALL name its place in the author's words. A condition's row SHALL
add its sentence (`studio-condition-builder`). No row
SHALL print CEL, a key or an id. With no reader the section SHALL read "No
condition reads this field."

#### Scenario: A guard reads as its way out and its sentence

- **WHEN** a way out "Approve → Book" on the step "Review" carries the guard
  `data.amount > 1000.0`
- **AND** the field `amount` carries the label "Amount"
- **THEN** the "Read by" section of "Amount" holds a row "On Review: way out
  Approve → Book"
- **AND** that row reads "Amount is greater than 1,000."

#### Scenario: A field nothing reads says so

- **WHEN** no expression reads `data.amount`
- **THEN** the "Read by" section of "Amount" reads "No condition reads this
  field."

#### Scenario: The zone prints no CEL

- **WHEN** three expressions read `data.amount`
- **THEN** the "Read by" section of "Amount" contains no `data.`

### Requirement: Column headers name the step and flag steps with no view

Each column header SHALL show the step's resolved label alone, or
"(unnamed step)". No column header SHALL print the step's `key`. Where a
step declares no `view` at all, its column header SHALL carry the note "No
form". That column also draws hatched.

#### Scenario: A column header shows the step's key and label

- **WHEN** the developer opens the field matrix
- **THEN** every column header shows that step's resolved label
- **AND** none shows a `key`

#### Scenario: A step with no view carries a note in its own header

- **WHEN** a workflow step declares no `view`
- **THEN** that step's column header carries the note "No form"

### Requirement: Row headers name the field and its type

Each row header SHALL show the field's resolved label, or "(unnamed
field)". Its kind word SHALL stand beside it, the word the kind picker
shows. A field
whose members name no kind SHALL show its raw triple in the mono face. No
row header SHALL print the field's `key` or its base `type`.

#### Scenario: A row header shows the field's key and type

- **WHEN** the developer opens the field matrix
- **THEN** every row header shows that field's label and its kind word
- **AND** none shows a `key` or a bare `type`

### Requirement: The three bulk flag badges render at one shared width

Each bulk flag badge the field matrix draws SHALL render at one shared
width. The width SHALL be the same for `visible`, `required` and
`readonly` alike. It SHALL fit the widest word, Read-only. The badges then
read as members of one group. This holds on the column and row headers
wherever they carry a bulk badge.

#### Scenario: The readonly badge is no narrower than its neighbors

- **WHEN** the field matrix draws a column or row header whose eligible
  set holds more than one flag
- **THEN** each badge renders at the same width as its neighbors
- **AND** the `readonly` badge is no narrower than the `visible` or
  `required` badge

### Requirement: The panels screen's field matrix toolbar filters inert columns and reports coverage

The Field matrix tab mounts the only field matrix, and this requirement covers
it.

The field matrix SHALL carry a toolbar above the grid. Its toggle "Hide steps
with no form" hides every step with no `view` from the grid while engaged.
The toggle SHALL affect only the grid's columns. It SHALL leave every row in
place.

The toolbar SHALL also carry one live count line. That line SHALL state four
numbers. A note entry SHALL raise neither the declared field-entry count nor,
through it, the undeclared-cell count. The one case below is its only exception.
The fourth number subtracts the first from a grid of cells, so the two must count
the same thing.

- the number of placements, the declared field entries
- the field count
- the count of steps the grid currently draws
- the number of empty cells, those among those steps with no entry

That case moves two of the four numbers. Where a note is the first entry in a
step that declared no `view`, that step stops being inert. It then joins the
drawn columns. `stepCount` rises by one, and `undeclaredCells` by the whole field
count.

That is one more cell than a first field entry moves it. A field entry adds a
declared entry, and the fourth number subtracts that entry back out. A note adds
none. The note itself still counts as no entry and occupies no cell.

#### Scenario: Hiding inert columns removes steps with no view

- **WHEN** the author engages the "Hide steps with no form" toggle on a draft
  where 3 of 13 steps declare no view
- **THEN** the grid draws 10 columns, and none of them belongs to a step with
  no view

#### Scenario: The toggle leaves every row in place

- **WHEN** the author engages the "Hide steps with no form" toggle
- **THEN** the grid still draws every catalog field as a row

#### Scenario: The count line reflects the currently drawn columns

- **WHEN** a draft carries 54 field entries, 22 fields and 13 steps, of which
  3 declare no view
- **AND** the author engages the "Hide steps with no form" toggle
- **THEN** the count line reads 54 placements, 22 fields, 10 steps, and
  166 empty cells

#### Scenario: A note moves none of the four numbers

- **WHEN** a step that already declares a view in that same draft gains three
  note entries
- **THEN** the count line still reads 54 placements and 166 empty cells,
  because a note occupies no cell

#### Scenario: A note in a viewless step joins the drawn columns

- **WHEN** a note is the first entry in one of that same draft's 3 steps
  declaring no `view`
- **AND** the author engages the "Hide steps with no form" toggle
- **THEN** the count line reads 54 placements, 22 fields, 11 steps, and
  188 empty cells

### Requirement: The panels screen's field matrix toolbar explains its marks with a legend

The Field matrix view mounts the only field matrix, and this requirement
covers it.

The toolbar SHALL carry a legend. The legend SHALL explain seven marks, in
the author's words:

- a badge sets the whole column or row it sits on
- an unchecked box writes nothing
- Condition means a rule decides in place of a fixed yes or no
- a dash marks a field this step's form does not hold
- a marked cell stands in Checks
- Technical means the process fills the field in by itself
- which color maps to Asked, which to Required, and which to Read-only

No legend entry SHALL print "CEL", "view", "key" or "engine". The seventh
entry SHALL carry a swatch in each of the three checkbox colors beside that
flag's word. A swatch SHALL use the exact color the live cells' checkboxes
use for that flag. The legend defines no separate color of its own.

#### Scenario: The legend is visible without further interaction

- **WHEN** the author opens the Field matrix tab
- **THEN** the toolbar's legend is visible, with no click or hover needed to
  reveal it

#### Scenario: The legend's color entry matches the grid's own colors

- **WHEN** the author compares the legend's Asked, Required and Read-only
  swatches against a live cell's checkboxes
- **THEN** each swatch's color equals that flag's checkbox color in the grid

### Requirement: The field matrix's count line counts field entries

The matrix toolbar's count line SHALL lead with the total of placements,
under that word. A placement is a field entry on any step in the draft. A
live cell represents one of that same total. A note entry SHALL count as
none of them. The count answers how much a step binds to the catalog, and a
note binds to nothing.

#### Scenario: The entity count matches the live-cell total

- **WHEN** the author opens Where fields appear on a draft with 54 field
  entries across its steps
- **THEN** the toolbar's count line reads 54 placements

#### Scenario: A note leaves the field matrix count alone

- **WHEN** a draft holds one step whose view carries two field entries and
  three notes
- **THEN** the toolbar's count line reads 2 placements

#### Scenario: A step holding notes alone contributes no entity count

- **WHEN** a draft holds one step whose view carries notes alone
- **THEN** that step raises the toolbar's placement count by none

### Requirement: Both process-wide field views take the area's field rule

<!-- antislop: allow synonym-rotation -->
<!-- Why: carried from the live requirement, with the mono rule scoped to the key. -->
Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A field's `key` SHALL print in mono and
a data source's name in the body face. A hairline SHALL divide rail rows, and a
rule SHALL sit under a view's heading. No corner SHALL take a radius.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field, and its More
- **THEN** the field's key prints in the mono face

#### Scenario: The Data sources view takes the same rule

- **WHEN** the developer opens the Data sources view on any data source
- **THEN** each label sits above its own control, a hairline divides the
  rail rows, and no corner takes a radius

### Requirement: A field's checks stand at the zone each one belongs to

The Fields view SHALL place a check on the selected field at the section
the check names. A check on the key, the name or the description stands
at the card's top, beside the name line. A check on the kind stands under
Kind. A check on an option or the source stands under Choices. A check on
a default, a validation rule or a column mapping stands inside More, which
opens for it.

A check on the key or on the technical marker opens More too, so its
control shows. The key's Developer view opens with it.

A check the view cannot place SHALL stand at the top of the card. No check
SHALL go unshown for want of a matching section.

Placement SHALL read the check's own location in the body. A check
carries that location today. The studio's issue model drops it, so this
rule needs the model to carry it through. The `studio-app` capability
states no shape for that model. What it states is the outcome: two
checks on one field, naming two sections, stand apart.

A nested field's check SHALL stand in that field's own card, at the
section the check names. The group's card SHALL show the group's own checks
alone.

The view SHALL have no consolidated check list of its own. The
draft-wide roll-up and the publish gate sit in the docked summary the
`studio-checks-rail` capability states.

A section holding a check SHALL take the refusal tone at its own heading.
An author scanning the card then sees which section is wrong, with
nothing to open.

#### Scenario: A key check stands at the key's zone

- **WHEN** the selected field's key breaks the identifier grammar
- **THEN** the check shows at the card's top, beside the name line
- **AND** More and its Developer view stand open, so the key input shows

#### Scenario: An unplaceable check stands at the top

- **WHEN** the selected field carries a check naming no section the view
  draws
- **THEN** the check shows at the top of the card

<!-- antislop: allow negation-habit -->
<!-- The live heading and body, unchanged; the negation names what the rule forbids. -->
#### Scenario: The view carries no consolidated list

- **WHEN** the developer opens the Fields view on a field carrying two
  checks in two sections
- **THEN** each check shows at its own section, and no list gathers both
  in one place

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the child row is now the child's own editor. -->
#### Scenario: A group's child row keeps its own list

- **WHEN** a field nested inside a group carries a check on its key
- **THEN** selecting that field shows the check at its own card's top
- **AND** selecting the group shows the group's own checks alone

### Requirement: The effect half states its own empty state

The Asked on section SHALL show an empty state for as long as no step view
references the selected field. It SHALL read "No step asks for this field
yet." The requiredness checkbox and the Only ask this when control SHALL
stay out while it shows.

It SHALL offer the route from there to a step's form, "Put this field on a
step". That route SHALL open the form editor (`studio-form-editor`) for the
first step a person works. The selected field then stands in the editor's
palette.

A step a person works is neither an end nor a call to another process. The
route takes the initial step when a person works it. Otherwise it takes the
first such step in the draft's own order. A draft with no step a person
works SHALL offer no route.

<!-- antislop: allow trailing-negation -->
<!-- Why: copied word for word from the live requirement. -->
The empty state SHALL take the empty tone, never the refusal tone. A
field no step asks for yet is an unfinished draft, not a broken one.

#### Scenario: An unused field draws the empty state

- **WHEN** the developer selects a field no step view references
- **THEN** the Asked on section says that no step asks for the field yet
- **AND** it offers the route to a step view, in the empty tone

#### Scenario: The empty state clears when a step references the field

- **WHEN** a step view gains a reference to the selected field
- **THEN** the Asked on section lists that step, and the empty state goes

#### Scenario: The route opens the first step's form

- **WHEN** the initial step is a step a person works, labelled Submit
- **AND** the author presses "Put this field on a step"
- **THEN** the form editor opens for Submit
- **AND** the selected field stands in its palette

#### Scenario: The route skips a step no person works

- **WHEN** the initial step calls another process
- **AND** the next step in the draft's order is one a person works, labelled
  Review
- **AND** the author presses "Put this field on a step"
- **THEN** the form editor opens for Review

#### Scenario: No step a person works offers no route

- **WHEN** every step of the draft is an end or a call to another process
- **THEN** the Asked on section offers no "Put this field on a step" control

### Requirement: The Fields view's definition half states values, a default and a preview

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the halves are now one card. -->
The card SHALL belong to the selected field alone, at any nesting depth. A
field nested inside a group SHALL take the same card a top-level field
takes. A group field's card SHALL have no editor for any of its children.
Inside the card, only the group's preview draws them.

Translation status SHALL show as a badge beside the Name input. The badge
SHALL name the current locale's missing count. The field SHALL have no
separate translation-status list. Adding a language SHALL stay
draft-scoped in the Process view's add-a-language control.

"How it will look" SHALL sit inside More, in a collapsed `<details>`
disclosure of its own. It SHALL start closed. The Developer view SHALL keep
its own separate `<details>` disclosure, last in More.

Remove field SHALL sit below a hairline at the card's end. It SHALL read as
the card's least frequent action.

Every section SHALL stay mounted while a field stays selected. A
disclosure SHALL keep its own open state for as long as the same field
stays selected. Each builder holds an incomplete row the draft does not
carry. The Developer view holds a half-typed config in component state.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, rewrapped so no code span breaks across a line. -->
The Default value part of More SHALL offer a literal input matching the
field's type and its declared format. For a field carrying static `options`
that input SHALL be a `<select>` bound to those options, or the
multi-value equivalent when the field's type is `list`.
For a `string` field declaring a `format` it SHALL be that format's own
native input.

<!-- antislop: allow negation-habit sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
Either control SHALL offer no option when the field is
`dataSource`-bound, since the draft carries no resolved rows for one.
That is the same carve-out named below for the preview. The Developer
view's CEL input SHALL still work there. A field declaring `format: "person"`
and neither `options` nor `dataSource` SHALL get the identical carve-out,
whether its type is `string` or `list`: the draft resolves no
`allowedGroups`-sourced people list either, since that resolution needs
a live database read the draft editor does not have. The CEL input
still works there too.

<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
The note the part shows in the person case SHALL name the people list
rather than a data source. The existing note names a data source by hand, and
this field declares none; an author reading it would learn the wrong
thing about their own draft.

For a `file` field the whole Default value part SHALL show disabled. It
SHALL state that the type accepts no default here. This mirrors "Only
ask this when" 's own disabled state for a field no step view
references.

For a `group` field the whole Default value part SHALL also show
disabled. It SHALL state that a group's own default is never read. A
group has no slot of its own in the flat data payload. A literal
or CEL default written there would silently never apply.

Every other type gets a Developer view under the literal input. It SHALL
hold a raw CEL text input for an expression default.
`studio-condition-builder`'s "A default value's expression stands in a
Developer view" states it. The part SHALL NOT mount the guard-shaped condition-builder
component. A default is a value rather than a boolean. It does not need a
comparison-row builder.

Writing through the literal input SHALL set the field's `default` key
to that literal value. Writing through the CEL input SHALL set it to `{
lang: "cel", src }`. Clearing either input SHALL remove the `default`
key.

"How it will look" SHALL preview the field through the shared form
component, read-only, inside its disclosure. Every previewed entry's
`readonly` SHALL read `true`, and the preview's container SHALL carry
`inert`.

The preview runs over a synthesized single-field view. For a group
field it synthesizes the group's own entry, plus one entry per
descendant. That reaches every depth, beyond the group's immediate
children.

A group holding a group SHALL preview both levels. That is the
grouping the shared form component itself applies. The synthesis
SHALL also carry the sample values in the shape that component reads
them, keyed by field id.

<!-- antislop: allow paragraph-length sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
A dataSource-backed field SHALL preview with no option list. The
draft has no resolved rows for one. The row stating so SHALL name
that the field resolves at runtime. An author previews what a
participant gets. A field declaring `format: "person"` and neither
`options` nor `dataSource` SHALL preview the same way, for the
identical reason: the draft cannot reach the live `allowedGroups`
expansion either. That field SHALL get its own row wording. It names the
people list rather than a data source it does not declare.

<!-- antislop: allow sentence-length -->
<!-- Why: the live requirement's own words, with its em-dash rewritten as two sentences. -->
The preview's sample value SHALL match the shape the field's own type
takes. A `format` narrows the value domain, so a formatted field
previews that format's sample rather than its type's. A `{type:
"list"}` field holds an array whatever its format, so its sample SHALL
be the format's sample inside an array. A scalar there would draw a
multi-select with nothing selected, since the shared form component
reads a non-array value as an empty selection.

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the group's halves now draw no child at all. -->
#### Scenario: A group's children render without halves of their own

- **WHEN** the developer selects a `group` field carrying two children
- **THEN** the card draws no row for either child
- **AND** the rail still lists both children, indented under the group

#### Scenario: A nested field takes the same two halves

- **WHEN** the developer selects a `string` field nested inside a `group`
  field
- **THEN** the view shows that field's card
- **AND** its More holds the Default value part and the preview

#### Scenario: Translation status shows as a badge

- **WHEN** the studio's `contentLocale` is `de`, and a field's label
  carries a base-locale value but no `de` value
- **THEN** a badge beside the label input names its missing count for
  the active content locale
- **AND** no separate translation-status list renders
- **AND** the badge names no locale of its own. The content-locale
  switcher already names `de` once, on the Settings tab

#### Scenario: A disclosure survives a selection that returns

- **WHEN** the developer opens the preview disclosure, selects another
  field, and selects the first field again
- **THEN** the preview disclosure state follows the rule the view
  states, and no half remounts

#### Scenario: Remove field sits below a rule

- **WHEN** the developer opens the Fields view on any field
- **THEN** Remove field is the card's last control, below a hairline
  that separates it from every other control

#### Scenario: The definition half shows its zones ruled apart

- **WHEN** the developer opens the Fields view on any field
- **THEN** the headings Kind, Choices, Asked on, Read by and More show,
  in that order
- **AND** a hairline sits above each heading after Kind

#### Scenario: A literal default writes the field's raw value

- **WHEN** the developer types `100` into a Number field's Default
  value input, with its Developer view closed
- **THEN** the draft's field carries `default: 100`

#### Scenario: A CEL default writes an expression

- **WHEN** the developer opens the Default value's Developer view and
  types `data.subtotal * 1.1`
- **THEN** the draft's field carries `default: { lang: "cel", src:
  "data.subtotal * 1.1" }`

#### Scenario: Clearing the default drops the key

- **WHEN** the developer clears a field's Default value input, whether
  literal or CEL
- **THEN** the draft's field has no `default` key

#### Scenario: A literal default on a Choice field uses its own options

- **WHEN** the developer chooses one of a `string` field's own
  `options` in its Default value part, through the value input
- **THEN** the draft's field carries `default` set to that option's
  value

#### Scenario: A dataSource-bound field's default offers no option list

- **WHEN** the developer opens the Default value part on a
  `dataSource`-bound `string` field
- **THEN** the literal control offers no option
- **AND** the Developer view's CEL input still lets the developer write an
  expression default

#### Scenario: A bare person field's default offers no option list

- **WHEN** the developer opens the Default value part on a `{type:
  "string", format: "person"}` field declaring neither `options` nor
  `dataSource`
- **THEN** the literal control offers no option
- **AND** the Developer view's CEL input still lets the developer write an
  expression default
- **AND** the note names the people list rather than a data source

#### Scenario: A bare person list's default offers no checkbox group

- **WHEN** the developer opens the Default value part on a `{type:
  "list", format: "person"}` field declaring neither `options` nor
  `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the literal control offers no option, rather than a checkbox
  group over an empty option set, and the Developer view's CEL input still
  lets the developer write an expression default

#### Scenario: The Default value zone disables for a reference or file field

- **WHEN** the developer opens the Fields view on a `file` field
- **THEN** the Default value part shows disabled, and states that the
  type accepts no default here

#### Scenario: A formatted string field's default uses that format's input

- **WHEN** the developer opens the Default value part on a
  `{type: "string", format: "date"}` field, with its Developer view closed
- **THEN** the literal input is a native date input

#### Scenario: The Default value zone disables for a group field

- **WHEN** the developer opens the Fields view on a `group` field
- **THEN** the Default value part shows disabled, and states that a
  group's own default is never read

#### Scenario: The preview shows one field, read-only

- **WHEN** the developer opens a field's preview
- **THEN** the shared form component shows that field with sample
  values
- **AND** none of the preview's controls take keyboard or pointer
  interaction

#### Scenario: A group field previews its group and its children

- **WHEN** the developer opens the preview on a group field carrying
  two children
- **THEN** the shared form component draws the group and both children
  inside it

#### Scenario: A bare person field previews with no option list

- **WHEN** the developer opens the preview on a `{type: "string",
  format: "person"}` field declaring neither `options` nor `dataSource`
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the preview shows no option list, and the row states that
  the field's people list resolves at runtime, naming no data source

#### Scenario: A person list previews an array sample

- **WHEN** the developer opens the preview on a `{type: "list", format:
  "person"}` field
<!-- antislop: allow sentence-length -->
<!-- Why: copied byte for byte from the live requirement. -->
- **THEN** the synthesized sample value is an array holding the person
  format's own sample rather than that sample as a bare scalar
- **AND** the `{type: "string"}` twin still previews the scalar

### Requirement: The Fields view's effect half states usage, a condition and requiredness

<!-- The heading keeps the live spec's wording, since a MODIFIED block keeps every scenario; the effect half is now the Asked on section and More. -->
<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the live requirement. -->
"Column mapping" SHALL show inside More, under Where values come from,
only when the field's data source is mappable. The existing
`showsColumnMapping` rule decides that. Its absence draws no rule of its own. A column
mapping writes into other fields, so it stands beside the source it reads.

Asked on SHALL list every step whose view references the field, with the
marks those references set as words. "Open the form" on a row SHALL open
the step's form. "Show on the map" SHALL open the Map tab with that step
preselected.

"Only ask this when" stands under the Asked on rows. It is a third
condition-builder site, alongside the path guard and the view-override
sites `studio-condition-builder` already names. It SHALL read the `visible`
overrides of every step view that references the field.

When those views disagree, the row SHALL state that plainly. Each Asked on
row above it reads its own condition. A `visible` override is `boolean` or an
expression. The row edits expressions alone. A referencing view holding
a literal SHALL therefore count as a disagreement, and the row SHALL
name it.

When no step view references the field, the row SHALL stay out. The
section's empty state says that no step asks for it yet.

The row's operand picker SHALL withhold `child.*`. No `visible` override
admits `child`: the runtime resolves the flag with no child in scope.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.

An unfinished row SHALL write nothing. Each referencing view's `visible`
key SHALL stand as it did until the row is complete. That holds when the
views disagree.

The row SHALL carry a "Clear on <steps>" command in the builder's footer,
beside the Developer view. It SHALL show only while some referencing view
has a `visible` key. Pressing it SHALL drop the `visible` key from every
referencing view. Its label SHALL name every step it clears, so the scope
stands before the press.

Removing the last row of a condition the views hold SHALL clear it too, on
the same terms. Removing a row the author just added, when no view holds a
condition, SHALL change nothing. The field SHALL NOT keep a field-level
condition.

The checkbox "Required on every step that asks for it" SHALL read and
write the `required` override. It reaches every step view that references
the field. The catalog declares no `required` key of its own, so this control
writes the view and never the field. That is the definition contract's own
rule, and this control does not bend it.

When those views disagree, the checkbox's note SHALL state that plainly and
name the differing step. Updating SHALL name the write before it happens,
on the same terms the condition row takes. A technical field SHALL show
the checkbox disabled, since `technical` already forces `required: false`
on every step. A field no step view references SHALL show no checkbox.

#### Scenario: A mappable field shows Column mapping in the effect half

- **WHEN** the developer opens the Fields view on a field whose data
  source is mappable
- **THEN** "Column mapping" shows inside More, under Where values come
  from

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Fields view on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and its neighbour draws
  no rule below it for a part that isn't there

#### Scenario: Used in lists steps and modes

- **WHEN** a field's ref appears in two step views, one with
  `required` and one with `readonly`
- **THEN** the Asked on rows name both steps, one marked Required and the
  other Read-only

#### Scenario: A condition writes every referencing view

- **WHEN** the developer sets "Only ask this when" on a field that
  two step views reference
- **THEN** both views carry the same `visible` override, and the row
  named both steps before the write

#### Scenario: Clearing the condition names its scope

- **WHEN** the developer presses "Clear on <steps>" in "Only ask this when"
  on a field that two step views reference
- **THEN** the command's label named both steps before the press, and
  neither view carries a `visible` key afterwards

#### Scenario: Adding a row to diverging views writes nothing

- **WHEN** one referencing view carries `visible: false` and another carries
  an expression
- **AND** the developer presses "Add row" and leaves it unfinished
- **THEN** both views keep the `visible` value they carried
- **AND** removing that row leaves both views as they were

#### Scenario: The clear command shows only with something to clear

- **WHEN** no referencing view carries a `visible` key
- **THEN** the row shows no "Clear on <steps>" command
- **AND** the command shows once a view carries a `visible` key

#### Scenario: The condition row names diverging views

- **WHEN** one referencing view carries a different `visible`
  override than the others
- **THEN** the condition row says so and names the differing step

#### Scenario: A literal override counts as a disagreement

- **WHEN** one referencing view carries `visible: false` and another
  carries an expression
- **THEN** the condition row says the views disagree and names the step
  holding the literal
- **AND** the write notice names that step too

#### Scenario: The condition row offers no child operand

- **WHEN** the developer opens "Only ask this when" on a field a
  subprocess step's view references
- **THEN** the operand picker offers the catalog and the instance and
  actor context, and it offers no `child.outcome` or `child.data` entry

#### Scenario: An unreferenced field disables the condition row

- **WHEN** the developer opens "Only ask this when" on a field no step
  view references
- **THEN** the row shows disabled and states that no step asks for
  the field yet

#### Scenario: Ask for this writes every referencing view

- **WHEN** the developer checks "Required on every step that asks for it"
  on a field that two step views reference
- **THEN** both views carry `required: true`, and the row named both
  steps before the write

#### Scenario: Ask for this names disagreeing views

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live scenario. -->
- **WHEN** one referencing view carries `required: true` and another
  carries no `required` key
- **THEN** the checkbox's note says the views disagree and names the
  differing step

#### Scenario: A technical field disables Ask for this

- **WHEN** the developer selects a field carrying `technical: true`
- **THEN** the requiredness checkbox shows disabled, and the draft's view
  entries keep no `required` key

### Requirement: A Read by row names each kind of place

A condition's place SHALL read:

- a way out's condition: "On {step}: way out {way out}", with the step it
  leaves and its row heading;
- a step form's conditions: "When {step} asks for {field}", "When {step}
  requires {field}", "When {field} is read-only on {step}";
- a note's condition: "When {step} shows a note";
- rules: "The rule for {field}", "The rule for {field} on {step}".

#### Scenario: A form condition names the step and the field

- **WHEN** the step "Review" asks for the field "Note" only when
  `data.amount > 0.0`
- **THEN** the "Read by" section of "Amount" holds a row "When Review asks for
  Note"

### Requirement: A Read by row names a value's place

Any other place SHALL read:

- "The default value of {field}" and "The time limit on {step}";
- "Values passed to the called process on {step}", "Values copied back
  from the called process on {step}";
- else "Another rule on {step}", or "Another rule in this process".

#### Scenario: A time limit names its step

- **WHEN** the step "Review" carries a time limit whose deadline reads
  `data.due`
- **THEN** the "Read by" section of the field `due` holds a row "The time limit
  on Review"

### Requirement: Column and row headers offer bulk flag toggles on the panels screen

The Field matrix tab mounts the only field matrix, and this requirement covers
it. The wrapper adds these badges to the bare grid.

Each column header and each row header SHALL offer `visible`, `required` and
`readonly` toggle badges. This holds wherever that column or row carries at least
one live cell. A badge SHALL flip every live, non-CEL cell in that column or row.

A `required` or `readonly` badge SHALL skip any cell already gated for that flag.
Gated means one of two things. The cell's own `visible` resolves to `false`, or
the field's other flag among `required`/`readonly` already resolves to `true`.
The second case applies only while nothing else in the draft writes that field.
Such a writer must land before the participant submits that cell's own step.
That is the same dominance-scoped test "A live cell edits its own view entry
inline" defines.

Every `required` and `readonly` bulk badge SHALL treat a technical field's cell
as gated, unconditionally. This holds on a column header and on a row header
alike. This matches a cell that already carries the flag's opposite. The
definition contract rejects either key on a technical field's view entry. A bulk
badge SHALL NOT write one there, even where the column's other rows are eligible.

Where every eligible cell already carries the flag's non-default value, the badge
SHALL turn that flag off across those cells. It turns the flag on otherwise.

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live requirement. -->
A column or row with no live cell SHALL carry no bulk toggle badge.

The matrix SHALL NOT stand a single badge whose own eligible cell set is empty.
Gating a cell only stops the write. It leaves the button in place. A button that
answers no click reads as a broken control.

This rule widens the live-cell rule above, from the whole badge group to one
badge. It covers a technical field's row with no second exclusion mechanism.
`visible` keeps a non-empty eligible set there. That badge stays, and the other
two go. The rule also removes a badge from a row whose cells the studio gates for
any other reason.

A column header's `visible`/`required`/`readonly` badges SHALL sit in three fixed
slots, one per flag. The slots follow the order the same three flags hold in the
column's own cells below. A badge prints its flag's word. The slots therefore
stand wider than the checkbox columns beneath and share no pixel edge with them. A badge can be
absent because its eligible set is empty. Its slot SHALL stay empty then, rather
than let the remaining badges shift into it.

#### Scenario: A column's bulk badge sets every eligible cell in that step

- **WHEN** the author picks a column's `required` badge, on a step where none
  of its live, non-CEL, non-gated cells carry `required: true`
- **THEN** every one of those cells' `required` value becomes `true`

#### Scenario: A row's bulk badge clears every eligible cell for that field

- **WHEN** every live, non-CEL, non-gated cell for one field already carries
  `required: true`, across every step
- **AND** the author picks that field's `required` badge
- **THEN** every one of those cells' `required` key clears

#### Scenario: A bulk badge skips CEL and gated cells

- **WHEN** the author picks a column's or row's `required` or `readonly`
  badge
- **THEN** it changes no cell whose relevant flag carries a CEL expression
- **AND** it changes no cell whose `visible` resolves to `false`

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live scenario. -->
#### Scenario: A column with no live cell carries no bulk badge

- **WHEN** a workflow step declares no `view`
<!-- antislop: allow negation-habit -->
- **THEN** that step's column header carries no bulk toggle badge

#### Scenario: A bulk badge skips a cell gated by the required/readonly rule

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`, on a field
  nothing else in the draft writes before that cell's own step
- **THEN** the badge leaves that cell's `readonly` value alone

#### Scenario: A bulk badge does not skip a cell written only on a non-dominating step

- **WHEN** the author picks a column's or row's `readonly` badge
- **AND** a targeted cell already carries `required: true`
- **AND** the field's one other editable placement sits on a non-dominating
  step
- **AND** that step follows this cell's own step, or sits on a different
  branch
- **THEN** the badge still skips that cell
- **AND** the non-dominating placement makes it no more eligible

#### Scenario: A technical field's row never receives a bulk required or readonly toggle

- **WHEN** the author picks a column's `required` or `readonly` badge for a
  step where a technical field's cell is otherwise live
- **THEN** the badge leaves that cell's `required` and `readonly` value alone

#### Scenario: A technical field's row offers no required or readonly bulk badge of its own

- **WHEN** the field matrix draws the row header for a technical field with
  at least one live cell
- **THEN** that row header offers no `required` or `readonly` toggle badge
- **AND** it still offers the `visible` toggle badge

#### Scenario: A row already gated on every cell offers no bulk badge either

- **WHEN** every live cell for one field already carries `required: true`
- **AND** nothing else in the draft writes that field before each cell's own
  step
- **AND** no cell's field declares `technical: true`
- **THEN** that row header offers no `required` toggle badge

#### Scenario: A column header with only one eligible badge still aligns with its column's checkboxes

- **WHEN** every one of a column's live cells is a technical field
- **AND** `visible` stays eligible there, while `required` and `readonly`
  have no eligible cell
- **THEN** that column header carries the `visible` badge alone
- **AND** the `visible` badge sits in the first slot, the order a `visible`
  checkbox holds in that column's cells
- **AND** the badge does not shift toward where `required` or `readonly`
  would otherwise sit

### Requirement: A field moves into a group and out of it from the catalog rail

The catalog rail's drag SHALL move a field into a group field and out of it,
in place. The field editor's move control SHALL make the same move. The move
SHALL neither remove the group nor rebuild it. It SHALL neither remove the
moved field nor rebuild it.

The move SHALL write the field's place in the draft's field array. The
field SHALL keep its `id`, its `key` and every other key it carries. No
CEL expression and no column mapping SHALL change.

That holds because a group has no entry in the flat data payload,
and `FieldDef.key` is unique across every depth. A leaf field takes a
flat address through its own key, whatever group it sits in. Views and
column mappings reference the `id`. The `definition-contract` capability
states both rules, and this requirement rests on them rather than
restating them.

A view entry is the one reference the move SHALL rewrite. The definition
contract binds a field entry's `group` to the field's catalog parent. A
move that leaves the entries alone therefore strands every one of them.
The move SHALL set the `group` of every view entry whose `ref` names the
moved field, to the destination group's `key`. A move to the top level
SHALL remove that key instead of writing it.

The same contract refuses an entry whose `group` names a card its view
does not carry. A step's view may carry the moved field without the
destination group's card. The move SHALL then place that card on the view,
immediately before the moved field's entry.

A destination nested inside other groups SHALL bring every missing ancestor
card too, outermost first. Each placed card SHALL name its own parent's key
as its `group`. A view already carrying a card SHALL gain no second one. A
move to the top level SHALL place nothing.

The rewrite and every placed card SHALL reach every step in the draft. Both
SHALL land in the same draft change as the field-array write. A reader
between the writes would see a catalog and a set of views that disagree.

A tabbed form keeps the definition contract's tab rules through the move.
Each entry's former tab is the tab the form editor's canvas drew it on. A
root's former tab is its own, and a member's is its outermost group card's.

An entry the move puts inside a group SHALL lose its `tab`, since its card
names the tab. A card the move places at the form's root SHALL take that
entry's former tab. An inner card of a placed chain SHALL have no `tab`. An
entry the move lifts to the top level SHALL take its former tab. On a form
declaring no tabs, the move SHALL write no `tab` anywhere.

A group moved into another group follows the same rule. Its own card loses
its `tab`, and the destination card holds the tab instead. A card the move
places takes the moved card's former tab. A card the form already carries
keeps its own.

A note entry SHALL stay untouched. A note names no catalog field, so no
move can carry it.

A pointer SHALL move the field by dragging its rail entry. The keyboard
SHALL move the same field through the move control in that field's own
editor. A field nested inside a group carries that control in its own
editor too. The `spa-accessibility` capability names this route for a
move into a group or out of one. Both gestures SHALL reach one write.

The two gestures SHALL reach the same set of destinations. A drop names
its target by the row it lands on, so it reaches every group. The move
control SHALL therefore name every group too, and the top level beside
them. A control offering one direction fails this rule. It reaches the
nearest group alone. Every other group then needs a pointer.

The move control SHALL name the group that holds the field, or the top
level. After a move made through the control, keyboard focus SHALL return
to it.

A move may nest a field below the rail's own two-level indentation cap.
The rail SHALL then draw that field at the cap. The draft's own field
tree SHALL keep whatever depth the move produces.
That split is the rail-rendering rule the panels screen already states.

A move SHALL keep the moved field selected. The view SHALL keep showing
that field's own card.

#### Scenario: A field moves into a group with a pointer

- **WHEN** the developer drags a top-level field's rail entry onto a
  group field's entry
- **THEN** the draft carries that field inside the group's `fields`
  array, and the group keeps its own `id` and `key`

#### Scenario: A field moves out of a group with the keyboard

- **WHEN** the developer focuses the move control in a group child's own
  editor, and picks the top level
- **THEN** the draft carries that field at the top level, and the
  group's remaining children keep their order

#### Scenario: The keyboard reaches every group the pointer reaches

- **WHEN** the developer moves a top-level field with the keyboard, on a
  draft carrying two group fields
- **THEN** the move control names both groups and the top level
- **AND** the field reaches whichever group the developer picks

#### Scenario: Focus returns to the move control after a move

- **WHEN** the developer moves a group child to the top level through its
  move control
- **THEN** the tab selects that field, and keyboard focus sits on the move
  control in the field's own editor

#### Scenario: A move rewrites no reference

- **WHEN** the developer moves a field that two step views reference
  and one column mapping targets
- **THEN** both view entries and the column mapping still resolve, and
  neither carries a changed `id`
- **AND** each view entry's `group` now names the destination group

#### Scenario: A move to the top level clears the group on every entry

- **WHEN** the developer moves a group child out to the top level
- **AND** three step views carry an entry naming that field
- **THEN** none of the three entries carries a `group` key any more

#### Scenario: A move brings the destination group's card to a form lacking it

- **WHEN** the developer moves a top-level field into a group
- **AND** a step view carries that field but not the group's card
- **THEN** that view carries the group's card immediately before the
  field's entry
- **AND** the field's entry names the group's key

#### Scenario: A move into a nested group brings the whole missing chain

- **WHEN** the developer moves a field into a group that sits inside
  another group
- **AND** a step view carrying the field carries neither group's card
- **THEN** that view carries the outer card, then the inner card naming
  the outer key, then the field's entry

#### Scenario: A form already carrying the group's card gains no second one

- **WHEN** the developer moves a field into a group whose card a step view
  already carries
- **THEN** that view still carries exactly one card for that group

#### Scenario: A group moved into another group brings the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a step view carries the first group's card and its members, but
  not the second group's card
- **THEN** that view carries the second group's card immediately before
  the first group's card
- **AND** the first group's members keep their places after its card

#### Scenario: A move to the top level places nothing

- **WHEN** the developer moves a group child out to the top level
- **THEN** every step view keeps the cards it carried, and gains none

#### Scenario: A move into a group takes the entry's tab off

- **WHEN** the developer moves a top-level field into a group
- **AND** a tabbed step view carries that field on its second tab, but not the
  group's card
- **THEN** that view carries the group's card on the second tab, immediately
  before the field's entry
- **AND** the field's entry names the group's key and has no `tab`

#### Scenario: Only the outermost placed card takes the tab

- **WHEN** the developer moves a field on a tabbed form into a group nested
  inside another group
- **AND** that view carries neither group's card
- **THEN** the outer card carries the field's former tab
- **AND** neither the inner card nor the field's entry carries a `tab`

#### Scenario: A move to the top level gives the entry its card's tab

- **WHEN** the developer moves a group child out to the top level
- **AND** a tabbed step view carries the child inside a group card on the
  second tab
- **THEN** the child's entry names the second tab

#### Scenario: A form without tabs gains no tab from a move

- **WHEN** the developer moves a group child out to the top level
- **AND** a step view carrying it declares no tabs
- **THEN** the child's entry has no `tab`

#### Scenario: A group moved into a group hands its tab to the destination card

- **WHEN** the developer moves a group field into a second group
- **AND** a tabbed step view carries the first group's card on its second tab,
  but not the second group's card
- **THEN** that view carries the second group's card on the second tab
- **AND** the first group's card has no `tab`

#### Scenario: A move leaves a note inside the group alone

- **WHEN** the developer moves a field out of a group whose view also
  holds a note naming that group's key
- **THEN** the note still names that group's key

#### Scenario: A move keeps the key

- **WHEN** the developer moves a field whose `key` is `amount` into a
  group
- **THEN** the field's `key` still reads `amount`, and every CEL
  expression naming `data.amount` still resolves

#### Scenario: The moved field stays selected

- **WHEN** the developer moves the selected field into a group
- **THEN** the view still shows that field's card

### Requirement: An empty field catalog offers a start state

<!-- antislop: allow negation-habit -->
<!-- Why: copied byte for byte from the live requirement. -->
The Fields view SHALL show a start state when the draft carries no
field at all. That state SHALL replace the card, since it has no field to
describe.

The start state SHALL do more than report the count. It SHALL name what
a field is for in this process. It SHALL carry the control that adds the
first field. That control SHALL be the same call the rail's Add entry
makes.

<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the live requirement. -->
The start state SHALL take the empty tone. A draft with no field yet is
a new draft, not a broken one.

The state SHALL go as soon as the draft carries one field. The view
SHALL then select that field and show its card.

#### Scenario: A fresh draft shows the start state

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
- **THEN** the view shows the start state instead of a card
- **AND** it carries a control that adds the first field

#### Scenario: Adding the first field leaves the start state

- **WHEN** the developer chooses the start state's add control
- **THEN** the draft carries one field, the view selects it, and it
  shows that field's card

#### Scenario: The start state takes the empty tone

- **WHEN** the developer opens the Fields view on a draft carrying no
  field
<!-- antislop: allow negation-habit -->
- **THEN** the start state carries no refusal tone and no issue mark

### Requirement: The removal dialog counts each kind of reach

The dialog's heading SHALL name the removed field by its label. Its facts SHALL
name the field's key beside the label, when the field carries a key. For a
group, the heading SHALL say that the removal takes a group.

The facts SHALL state one count per kind of reach the removal carries. The
kinds are these:

- the fields inside a removed group, at every depth
- the steps whose view carries an entry naming a removed field
- the action outputs and subprocess output mappings that write a removed field
- the contract list entries naming a removed field
- the column mapping entries that target a removed field
- the CEL expressions the removal keeps that read a removed field's key
- the plugin config values that name a removed field's id

The facts SHALL state no row for a kind the removal does not carry. The dialog
SHALL name no step, no expression and no config by itself. The Asked on
section already lists the steps.

#### Scenario: A group states the fields inside it and its steps

- **WHEN** the author presses Remove field on the group "Processing (Fabrikam)" in
  the IT Offboarding draft
- **THEN** the dialog's heading says the removal takes a group
- **AND** its facts state 18 fields inside and 10 steps

#### Scenario: Only the kinds a removal carries appear

- **WHEN** the author presses Remove field on "Booking Status" in the Expense
  Approval draft
- **THEN** the facts state 2 steps, 1 writing action output, 1 contract list
  entry and 2 CEL expressions
- **AND** the facts lack a column mapping row and a plugin config row

## REMOVED Requirements

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: The Fields view divides into a definition half and an effect half
**Reason**: Decision D4 replaces the two halves with one card in sections.
Their eleven zone headings, their tint and their side-by-side layout go.
**Migration**: "The Fields view draws one card in sections" states the card.
"A group's card adds a field inside it" keeps the group zone's add control
and its rail scenarios. The tint has no successor: a section's heading
takes the refusal tone for a check, and nothing animates.
