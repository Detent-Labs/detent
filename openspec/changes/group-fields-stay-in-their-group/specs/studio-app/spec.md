## MODIFIED Requirements

### Requirement: A field moves into a group and out of it from the catalog rail

The catalog rail SHALL move a field into a group field and out of it,
in place. The move SHALL neither remove the group nor rebuild it. It
SHALL neither remove the moved field nor rebuild it.

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

The rewrite SHALL reach every step in the draft. It SHALL land in the same
draft change as the field-array write. A reader between the two writes
would see a catalog and a set of views that disagree.

A note entry SHALL stay untouched. A note names no catalog field, so no
move can carry it.

A pointer SHALL move the field by dragging its rail entry. The keyboard
SHALL move the same field from the same entry, per
`spa-accessibility`'s in-list reordering requirement. Both gestures
SHALL reach one write.

The two gestures SHALL reach the same set of destinations. A drop names
its target by the row it lands on, so it reaches every group. The
keyboard's control SHALL therefore name every group too, and the top
level beside them. A control offering one direction fails this rule. It
reaches the nearest group alone. Every other group then needs a pointer.

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

- **WHEN** the developer focuses a group child's rail entry and presses
  the documented move keystroke
- **THEN** the draft carries that field at the top level, and the
  group's remaining children keep their order

#### Scenario: The keyboard reaches every group the pointer reaches

- **WHEN** the developer moves a top-level field with the keyboard, on a
  draft carrying two group fields
- **THEN** the move control names both groups and the top level
- **AND** the field reaches whichever group the developer picks

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

## ADDED Requirements

### Requirement: Renaming a group field's key rewrites the view entries naming it

A `view.fields[].group` holds a group field's `key` rather than its `id`.
Editing that key in the field catalog SHALL rewrite every view entry naming
the old one. The rewrite SHALL reach every step in the draft, and both
halves SHALL land in one draft change.

This reaches a field entry and a note entry alike. Neither one has another
route back to its container. Leaving either behind hides it from the form
and refuses the publish.

The rule reaches the key control wherever the catalog offers it. A top-level
group and a group nested inside another group SHALL behave the same way.

The definition contract already refuses a body whose entry names a group key
no field declares. Before this requirement, renaming a group produced exactly
that body. The author then met the error at publish, with nothing naming the
rename.

#### Scenario: A rename follows through to every step

- **WHEN** the developer changes a group field's key from `request` to
  `order_request`
- **AND** three step views carry entries naming `request`
- **THEN** all three entries name `order_request`

#### Scenario: A rename carries a note along

- **WHEN** the developer renames a group whose view holds a note naming its
  old key
- **THEN** the note names the new key

#### Scenario: A nested group renames the same way

- **WHEN** the developer renames a group field that sits inside another group
- **THEN** every view entry naming its old key names the new one

#### Scenario: A rename leaves another group's entries alone

- **WHEN** the developer renames one of a draft's two group fields
- **THEN** the entries naming the other group keep their old key
