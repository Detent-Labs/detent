## MODIFIED Requirements

### Requirement: The panels screen keeps every change and states so

<!-- antislop: allow synonym-rotation -->
<!-- Why: the toolbar's Discard control drops every unsaved change. The
     panel's Remove control drops one entity. Two separate controls,
     each keeping its own name. -->
The panels screen SHALL carry no Save control. Every change an author
makes on it SHALL write straight into the in-browser draft. That is how
the panels write today. The screen's own Save, Discard and Publish
toolbar SHALL remain the only thing that persists.

Leaving the screen SHALL discard nothing. The screen SHALL state that
plainly, so leaving never reads as a cancel.

A panel's own unsubmitted input SHALL survive a switch between views.
The contract panel holds a half-typed outcome name in component state.
The data sources panel fetches its list keys on mount. The field matrix
holds its selected cell in component state. All four views SHALL
therefore stay mounted for as long as the panels screen is open.
Switching a view SHALL reveal and hide them, rather than mount them.

An index rail SHALL list the four views. Each entry SHALL carry two
numbers, and they SHALL read as different things. The entity count says
how many fields, data sources, outcomes or live cells the view holds.
The issue count says how many of them are wrong. Only the issue count
takes the refusal tone. An entry SHALL carry no issue count when the
view holds no issue.

For the Fields view and for the Data sources view the rail SHALL also
list that view's own entities and an Add entry. Choosing an entity SHALL
select it. The view SHALL render that one entity's editor. The Add entry
SHALL add an entity, through the call the panel's own add control makes.
A group field's children indent one level under it.

Contract holds a single editor, so its rail entry SHALL carry no
sub-list. The field matrix draws a grid, so its entry SHALL carry none
either.

The rail SHALL render a sub-list only under the open view. Two
sub-lists at once fill the column.

A group field SHALL keep one recursive editor. Choosing a child in the
rail SHALL select the parent group and scroll the child into view inside
that editor.

A selection SHALL live in component state and SHALL take no address of
its own. The screen SHALL select the first entity on mount. It SHALL
select the added entity after an Add.
<!-- antislop: allow synonym-rotation -->
<!-- Why: the panel's Remove control drops one entity. The toolbar's
     Discard control drops every unsaved change. The two are separate
     controls, so neither word may stand in for the other. -->
It SHALL select the neighbour after a Remove. Switching to another view
and back SHALL keep the selection the first view held.

Each entity entry SHALL carry its own issue mark, separate from the
view entry's issue count. One entity at a time otherwise hides a broken
entity behind whichever entry an author has open.

The rail SHALL mark the open view with `aria-current`. A rail entry
switches a view rather than disclosing adjacent content, so it SHALL
NOT carry `aria-expanded`.

The rail SHALL cap indentation at two levels. A group field's children
indent once. A field nested deeper SHALL take its own top-level rail
entry rather than a deeper indent. This is a rail-rendering rule only:
the draft's own field tree SHALL keep whatever depth it declares.

#### Scenario: Leaving the screen keeps every change

- **WHEN** the developer adds a field on the screen and then returns to
  the canvas
- **THEN** the draft still carries that field, and the screen's toolbar
  still reports unsaved changes

#### Scenario: Switching views keeps a half-typed outcome name

- **WHEN** the developer types an outcome name in the Contract view,
  switches to Fields without adding it, then switches back
- **THEN** the typed text is still in the input

#### Scenario: Switching views keeps the field matrix's selected cell

- **WHEN** the developer selects a live cell in the Field matrix view,
  switches to Contract, then switches back
- **THEN** the same cell is still selected, and its editor still shows

#### Scenario: The screen offers no Save of its own

- **WHEN** the developer inspects the open screen
- **THEN** it carries no Save control, and it states that it keeps
  every change

#### Scenario: The rail lists each view with its entity count

- **WHEN** a draft carries three fields, two data sources, and a
  contract
- **THEN** the rail's Fields entry reads three, its Data sources entry
  reads two, and its Contract entry carries no sub-list

#### Scenario: The rail's issue count is separate from its entity count

- **WHEN** a draft carries three fields and one of them holds a
  validation issue
- **THEN** the rail's Fields entry reads three for its entity count and
  one for its issue count. Only the issue count takes the refusal tone

#### Scenario: A view with no issue shows no issue count

- **WHEN** a draft's two data sources both validate
- **THEN** the rail's Data sources entry reads two and shows no issue
  count

#### Scenario: A twice-nested group field takes its own rail entry

- **WHEN** a group field holds a group field holding a leaf field
- **THEN** the leaf field takes a top-level rail entry, not a third
  indent level. The draft keeps its own nesting

#### Scenario: The Fields view renders the selected field alone

- **WHEN** a draft carries three fields and the developer chooses the
  second in the rail
- **THEN** the Fields view renders that field's editor, and it renders
  neither of the other two

#### Scenario: The Data sources view renders the selected data source alone

- **WHEN** a draft carries two data sources and the developer chooses
  the second in the rail
- **THEN** the Data sources view renders that data source's editor, and
  it renders no other

#### Scenario: The rail sub-list follows the open view

- **WHEN** the developer opens the Data sources view on a draft that
  carries both fields and data sources
- **THEN** the rail lists the data sources under that entry, and it
  lists no field under the Fields entry

#### Scenario: A group child selects its group

- **WHEN** the developer chooses a group field's child in the rail
- **THEN** the view renders the group's own recursive editor, and it
  scrolls the child into view inside that editor

#### Scenario: The Fields rail adds a field

- **WHEN** the developer chooses the rail's Add entry under Fields
- **THEN** the draft carries one more field, the rail lists it, and the
  view renders that new field

#### Scenario: Removing a field selects its neighbour

- **WHEN** the developer removes the selected field from a draft that
  carries three
- **THEN** the view renders a neighbouring field, and it reports no
  empty selection

#### Scenario: A reload selects the first entity

- **WHEN** the developer reloads the browser on the Fields view
- **THEN** the view renders the first field in the catalog

#### Scenario: Each entity entry marks its own issue

- **WHEN** a draft's second field holds a validation issue, and the
  developer has the first field selected
- **THEN** the second field's own rail entry carries an issue mark

#### Scenario: The screen keeps every missing-translation warning

- **WHEN** the studio's `contentLocale` is `de`, and a draft's field has
  a `label` carrying the base-locale value but no `de` value
- **THEN** the screen's Fields view shows the missing-translation
  warning next to that field's label input

## ADDED Requirements

### Requirement: The Fields and Data sources views take the area's field rule

Both views SHALL render their editors under the design language's field
rule. The rule `.steps-panel label` states it in the area today. A
label SHALL sit above its control. A `key` and a `type` SHALL print in
mono, because the engine matches both exactly. A hairline SHALL divide
rail rows, and a rule SHALL sit under a view's heading. No corner SHALL
take a radius.

#### Scenario: A field editor states its labels above its controls

- **WHEN** the developer opens the Fields view on any field
- **THEN** each label sits above its own control, and no label sits
  beside one

#### Scenario: A key prints in mono

- **WHEN** the developer opens the Fields view on any field
- **THEN** the field's key and its type print in the mono face
