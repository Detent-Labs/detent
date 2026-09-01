<!-- antislop: allow-file em-dash sentence-length passive-voice synonym-rotation -->
<!-- The MODIFIED block below carries live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: Groups nest their member fields; required and readonly are honored

A `group` field SHALL render as a container housing the fields that carry its
key in `ResolvedViewField.group`. Fields render in the order the resolved
view array carries them (declaration order) — neither `FieldDef` nor
`ResolvedViewField` carries an `order` property, so there is no per-field
sort key to render by; a step's authored field order is what determines
render order. A resolved view field with `required` set SHALL display a
visible required marker with no client-side submission enforcement
(requiredness is validated server-side). A resolved view field with
`readonly` set SHALL render its input in a disabled state.

The container houses view entries, not field entries alone. A note entry
naming the group's key renders inside it, on the same rule and at the same
position the array gives it. The two sentences about `required` and
`readonly` reach field entries alone, because a note declares neither.

#### Scenario: A group field nests its member fields

- **WHEN** a step view includes a `group` field and other fields whose
  `ResolvedViewField.group` names that group's key
- **THEN** the member fields render nested within the group's container, not
  flattened alongside it

#### Scenario: A required field displays a marker with no client-side gate

- **WHEN** a resolved view field has `required` set
- **THEN** a visible marker renders on that field, and submission is not
  blocked client-side on that field being empty

#### Scenario: A readonly field's input is disabled

- **WHEN** a resolved view field has `readonly` set
- **THEN** its input renders in a disabled state

#### Scenario: A note carrying the group's key nests beside the member fields

- **WHEN** a step view includes a `group` field, a field entry and a note
  entry, and both entries name that group's key
- **THEN** both render nested within the group's container, in the order the
  resolved view array carries them

## ADDED Requirements

### Requirement: A note renders as static text at its place in the view

`form-ui` SHALL render a resolved note entry as a paragraph of text, at the
position the resolved view array gives it. It SHALL resolve the note's text
through the same locale rule it applies to a field's label. The fallback is the
body's base locale.

A note SHALL render no form control, no label element and no required marker.
It is static text a participant reads, so it takes no tab stop of its own and
needs none.

A note SHALL honor `group` and `span` the way a field entry does. A note naming
a group's key renders inside that group's container. Its `span` sets how many
of the form's columns it occupies.

The grid rules a note's `span` obeys are the ones "Fields render across the
view's declared column count, honoring each field's span" already states. That
requirement's every clause reads over a view entry, a note included: the grid,
the `min(span, columns)` clamp, and a group's own full-width container. It
needs no change of its own, because a note's `span` behaves as a leaf field's
`span` behaves.

#### Scenario: A note renders between the fields around it

- **WHEN** the resolved view carries a field entry, a note, and a second field
  entry in that order
- **THEN** the rendered form shows the note's text between the two inputs

#### Scenario: A note inside a group renders in that group's container

- **WHEN** a resolved note entry's `group` names a group field's key
- **THEN** its text renders nested within that group's container, not beside it

#### Scenario: A note renders no control and takes no tab stop

- **WHEN** a resolved view carries a note
- **THEN** the rendered note carries no input, no label element and no
  required marker
- **AND** keyboard focus moves from the field before it to the field after it

### Requirement: A submission carries no note

The value map `form-ui` builds for a submission SHALL hold keys for editable
field entries alone. A note SHALL contribute no key, wherever it sits in the
view.

This closes the defect the note exists to remove. An author who fakes a note
with a read-only string field puts a key into `data` that never held a value.

#### Scenario: Submitting a form holding a note sends the field values alone

- **WHEN** a participant submits a path from a step whose view holds two
  editable field entries and one note
- **THEN** the request body carries exactly those two field keys
