## MODIFIED Requirements

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
component state. All four tabs SHALL therefore stay mounted for as long as the
process surface is open. Switching a tab SHALL reveal and hide them, rather than
mount them.

Each of those four tabs SHALL carry two numbers, and they SHALL read as different
things. The entity count says how many fields, data sources, outcomes or live
cells the tab holds. The `studio-process-tabs` capability states which tab prints
one. The issue count says how many of them are wrong. Only the issue count takes
the refusal tone. A tab SHALL have no issue count while its subject has no
issue.

The Fields tab and the Data sources tab SHALL each stand an entity rail beside
the open editor. The rail SHALL list that tab's own entities, and an Add entry
too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. A group field's children indent one level under it.

A field entry SHALL be the drag source that moves its field into a group and
out of it. The entry SHALL have no move control of its own, since the field's
editor carries that control. The move requirement below states the drag, its
keyboard route and what the move writes. Data source entries SHALL take no
part in a move, since a data source nests under nothing.

Contract holds a single editor, so its tab SHALL stand no entity rail. The field
matrix draws a grid, so its tab SHALL stand none either.

A tab SHALL stand its own rail alone. No tab SHALL list another tab's entities.

A group field SHALL keep one recursive editor. Choosing a child in the rail SHALL
select the parent group and scroll the child into view inside that editor.

A selection SHALL live in component state and SHALL take no address of its own.
The tab SHALL select the first entity on mount. It SHALL select the added entity
after an Add.

<!-- antislop: allow synonym-rotation -->
<!-- The panel's Remove control drops one entity; the area nav's Discard control drops every unsaved change. -->
It SHALL select the neighbour after a Remove. Switching to another tab and back
SHALL keep the selection the first tab held.

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
icon's tooltip, and it SHALL stay part of the entry's accessible name.

The row SHALL NOT print the field's key. The key stays in the definition
half's "What this field asks" zone, once an author selects that field. The
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
  Canvas tab
- **THEN** the draft still carries that field, and the area nav still reports
  unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the author types an outcome name on the Contract tab, opens the
  Fields tab without adding it, then returns
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the author moves roving focus to a live cell on the Field matrix
  tab and activates it
- **AND** the author opens the Contract tab, then returns
- **THEN** the same cell still holds roving focus, and it is still activated

#### Scenario: The screen offers no Save of its own

- **WHEN** the author inspects an open tab
- **THEN** it has no Save control, and it states that it keeps every
  change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a contract
- **THEN** the Fields tab reads three, the Data sources tab reads two, and
  the Contract tab stands no entity rail

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a validation
  issue
- **THEN** the Fields tab reads three for its entity count and one for its
  issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the Data sources tab reads two and has no issue count

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
- **THEN** the Data sources tab renders that data source's editor, and it
  renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the author opens the Data sources tab on a draft that carries both
  fields and data sources
- **THEN** that tab's rail lists the data sources, and it lists no field

#### Scenario: A group child selects its group

- **WHEN** the author picks a group field's child in the rail
- **THEN** the tab renders the group's own recursive editor, and it scrolls
  the child into view inside that editor

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

#### Scenario: A rail entry names no group

- **WHEN** a draft carries a group field holding two fields
- **THEN** both child entries indent once under the group's entry
- **AND** neither child entry prints the group's name

#### Scenario: Removing a field selects its neighbour

- **WHEN** the author removes the selected field from a draft that carries
  three
- **THEN** the tab renders a neighbouring field, and it reports no empty
  selection

#### Scenario: A reload selects the first entity

- **WHEN** the author reloads the browser on the Fields tab
- **THEN** the tab renders the first field in the catalog

#### Scenario: The Data sources rail adds a data source

- **WHEN** the author picks the rail's Add entry on the Data sources tab
- **THEN** the draft carries one more data source, the rail lists it, and the
  tab renders that new data source

#### Scenario: Removing a data source selects its neighbour

- **WHEN** the author removes the selected data source from a draft that
  carries three
- **THEN** the tab renders a neighbouring data source, and it reports no
  empty selection

#### Scenario: A reload selects the first data source

- **WHEN** the author reloads the browser on the Data sources tab
- **THEN** the tab renders the first data source in the draft

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the author
  has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

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

### Requirement: The Fields view divides into a definition half and an effect half

<!-- antislop: allow synonym-rotation -->
<!-- "edit" names an author working one field; "change" names one write to the draft. -->
The Fields view SHALL edit one field through two halves under one
heading. The definition half comes first, the effect half second. The
view SHALL have no tab set.

The definition half says what the field is. It SHALL hold five zones. Their
order reads "What this field asks", "What kind of field", "Where values
come from", "Default value", "Validation". Each zone SHALL sit under its
own heading, with a rule between it and its neighbour.

"What this field asks" holds the label, the description, the key and the
move control, in that order. "What kind of field" holds the kind picker and
the Technical control. "Where values come from" holds the data source and
the options.

The effect half says where the field acts in the process. It SHALL hold
four zones, in this order: "Used in", "Only ask this when", "Ask for
this" and "Column mapping". The same heading and rule treatment holds.

"Used in" lists every step whose view references the field, with the
modes those references set. "Only ask this when" holds the condition.
"Ask for this" holds the requiredness.

Neither half SHALL sit behind a disclosure. Both SHALL show as the view
opens. A closed disclosure over the usage list is what this change
removes. Returning one would undo the change.

A change in the definition half SHALL tint the affected row in the
effect half. That tint SHALL be the only motion the two halves carry.

#### Scenario: The view draws two halves and no tab set

- **WHEN** the developer opens the Fields view on any field
- **THEN** the definition half and the effect half both show, side by
  side under one heading
- **AND** no tab set renders

#### Scenario: A definition change tints its effect row

- **WHEN** the developer changes the label of a field two step views
  reference
- **THEN** both rows for those steps tint in the effect half

#### Scenario: The move control stands under the key

- **WHEN** the developer opens the Fields view on any field
- **THEN** "What this field asks" holds the move control directly under the key
- **AND** the control names the group that holds the field, or the top level

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
editor. A group child's control stands in the child's own row, inside the
group's editor. The `spa-accessibility` capability names this route for a
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
that field's own two halves.

#### Scenario: A field moves into a group with a pointer

- **WHEN** the developer drags a top-level field's rail entry onto a
  group field's entry
- **THEN** the draft carries that field inside the group's `fields`
  array, and the group keeps its own `id` and `key`

#### Scenario: A field moves out of a group with the keyboard

- **WHEN** the developer focuses a group child's move control inside the
  group's editor, and picks the top level
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
- **THEN** the view still shows that field's definition half and its
  effect half
