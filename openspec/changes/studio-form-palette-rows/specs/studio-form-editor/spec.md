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

The palette SHALL also offer an "add a field to the process" section, by
type. Dragging one of those entries onto the canvas SHALL mint a new
catalog field of that type. It SHALL add that field to the view, at the
drop position, in the same move. A minted field is a top-level catalog
field, so it joins no group.

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

A place-an-existing-field row SHALL show that field's resolved label and
its kind icon. This is the same presentation the Fields tab's entity rail
already uses for the field (`studio-app`). It SHALL NOT show the field's
raw `key` or its raw `type` string as visible text. A field the catalog
nests inside a group SHALL indent under that group's own row. The indent
matches the same hierarchy the entity rail already draws.

This presentation rule reaches the
place-an-existing-field list alone. The "add a field to the process"
section names a field kind, not an existing catalog field, and stays
unchanged.

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
