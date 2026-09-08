## MODIFIED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->

<!-- antislop: allow synonym-rotation -->
### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- The area nav's Discard control drops every unsaved change; a panel's Remove control drops one entity. -->
No tab SHALL carry a Save control. Every change an author makes on a tab SHALL
write straight into the in-browser draft. That is how the panels write today. The
area nav's Save and Publish controls SHALL remain the only ones that persist.

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
the refusal tone. A tab SHALL carry no issue count while its subject holds no
issue.

The Fields tab and the Data sources tab SHALL each stand an entity rail beside
the open editor. The rail SHALL list that tab's own entities, and an Add entry
too. Choosing an entity SHALL select it. The tab SHALL open that one entity's
editor.

The Add entry SHALL add an entity, through the call the panel's own add control
makes. A group field's children indent one level under it.

A field entry SHALL carry a control that moves the field into a group and out of
it. The move requirement below states the gesture, its keyboard equivalent and
what the move writes. A data source entry SHALL carry no such control, since a
data source nests under nothing.

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
wrap onto a second line. The field's kind name and the issue mark SHALL sit
beside it, on that same line; a kind name too long for its own share of the
line SHALL truncate the same way. The row SHALL NOT print the field's key. The
key stays in the definition half's "What this field asks" zone, once an author
selects that field. The engine's own exact-match value already lives there.
The Data sources rail entry names its data source through the same rail-row
name element; an over-long data source key SHALL truncate on its one line the
identical way.

The kind name SHALL come from the same table the kind picker reads. A row naming
the base type while the picker beside it names the kind would give one field two
vocabularies. The row therefore reads "Date" where the picker reads "Date".

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
- **THEN** it carries no Save control, and it states that it keeps every
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
- **THEN** the Data sources tab reads two and carries no issue count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third indent
  level. The draft keeps its own nesting

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

#### Scenario: A field entry offers the move control

- **WHEN** the author opens the Fields tab on a draft carrying a group field
  and a top-level field
- **THEN** each field entry carries a move control, and no data source entry
  carries one

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
- **THEN** every rail row carries the resolved label, the kind name and any
  issue mark
- **AND** no row prints a `key`

#### Scenario: The rail row and the picker name one kind

- **WHEN** the author selects a `{type: "string", format: "date"}` field
- **THEN** the rail row and the kind picker both name that field's kind, with
  the same word

#### Scenario: A long field name truncates instead of wrapping

- **WHEN** a field's resolved label is longer than the rail entry's own
  width, especially once a group child's indent narrows it further
- **THEN** the rail entry shows the label truncated on its one line, and
  prints no character of it on a line of its own

#### Scenario: A long kind name truncates instead of wrapping

- **WHEN** a field's kind name is longer than its own share of the rail
  entry's line
- **THEN** the rail entry truncates the kind name on that same line, and
  prints no character of it on a line of its own

#### Scenario: A long data source key truncates instead of wrapping

- **WHEN** a data source's `key` is longer than the Data sources rail
  entry's own width
- **THEN** the rail entry shows the key truncated on its one line, and
  prints no character of it on a line of its own
