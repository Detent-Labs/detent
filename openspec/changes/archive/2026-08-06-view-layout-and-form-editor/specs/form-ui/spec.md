## ADDED Requirements

### Requirement: Fields render across the view's declared column count, honoring each field's span

`FieldForm` SHALL accept `columns` (`1 | 2`, default `1`) as a prop.
It lays out its root fields in a CSS grid of that width. Each root
field's `ResolvedViewField.span` (`1 | 2`, default `1`) SHALL set how
many of those columns that field occupies.

A field never exceeds its grid. `FieldForm` SHALL clamp an effective
span to `min(span, columns)`. A `span: 2` field on a one-column grid
still renders full width, rather than overflowing.

A group field's own member fields SHALL render in a grid of the same
width as the form's `columns`. A group inside a one-column form
therefore stacks its members, exactly as
`packages/form-ui/src/FieldForm.tsx` renders a group today. A group
inside a two-column form lays its members out in two columns.

A group SHALL NOT declare a column count of its own. Inheriting the
form's count keeps every already-published form rendering as it does
today. It also adds no second configurable column count.

A group's own container SHALL occupy the form's full `columns`. A
`span` declared on a group SHALL have no effect. A group is a
container, not a leaf. It holds a grid at the form's count, and two
tracks need the room two tracks take. A group at width `1` on a
two-column form would draw those two tracks inside half a track. No
requirement here asks for that.

This is the one place `span` does not read as `min(span, columns)`.
The alternative default is `1` for a group like any other field. That
would make the member-count rule above wrong, unless the author also
set `span: 2` on every group. A default that needs a second setting to
be correct is the wrong default.

On a one-column form the form's full width IS one column. A group
there renders exactly as it does today. The form editor SHALL NOT
offer a span control on a group's card: nothing reads the value.

`FieldForm`'s existing declaration-order rule stays the render order
within the grid. A field with no `span` and no group still renders
left to right, then wraps down. It renders exactly where the array
places it.

Below a width threshold the grid SHALL collapse to one column, whatever
`columns` declares. The threshold is the form's own comfortable measure,
not a device width. It SHALL therefore come from the grid's own
available width rather than the viewport's.

The threshold lives in `form-ui`'s own stylesheet. That is what makes it
one rule both consumers get at the same point. The `studio-player`
capability's reflow requirement rests on that shared point. A collapse
changes no field's stored `span`, and widening the container restores
the declared layout.

#### Scenario: A one-column grid is the default

- **WHEN** a consumer renders `FieldForm` with no `columns` prop
- **THEN** every root field renders in a single column, matching
  today's rendering exactly

#### Scenario: A two-column grid places fields left to right, then down

- **WHEN** a consumer renders `FieldForm` with `columns: 2` and four
  root fields, each with `span: 1`
- **THEN** the first two fields render side by side. The next two
  render side by side beneath them, in the view array's own order

#### Scenario: A spanning field takes the full grid width

- **WHEN** a root field's resolved `span` is `2` and `columns` is `2`
- **THEN** that field renders across both columns, and the field after
  it starts a new row

#### Scenario: An over-wide span clamps to the grid

- **WHEN** a root field's resolved `span` is `2` but `columns` is `1`
- **THEN** that field renders at width `1`, the same as any other
  field on that grid

#### Scenario: A group in a one-column form renders as it does today

- **WHEN** a group field renders inside a `columns: 1` grid
- **THEN** the group's own member fields stack in one column, matching
  the rendering before this change

#### Scenario: A group inherits a two-column form's width

- **WHEN** a group field renders inside a `columns: 2` grid
- **THEN** the group's own container spans both columns, and its member
  fields lay out in two columns inside it

#### Scenario: A span declared on a group is not read

- **WHEN** a group field carries `span: 1` and renders inside a
  `columns: 2` grid
- **THEN** its container still spans both columns, exactly as it does
  for a group carrying no `span` at all

#### Scenario: A narrow container collapses a two-column grid

- **WHEN** a `columns: 2` form renders in a container below the
  threshold
- **THEN** every root field renders in one column, and no field's
  stored `span` changes
