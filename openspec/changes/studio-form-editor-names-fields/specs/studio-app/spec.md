## MODIFIED Requirements

### Requirement: The field catalog's field key auto-derives from the field label

The field catalog's key field SHALL auto-fill from the field's label as the
developer types it. It SHALL do so while the key is empty. It SHALL also do
so while the key still equals what derivation produces from the label's prior
value. The lock below overrides both cases. In any other case, a write to the
label SHALL leave the key as it stands. This applies to a top-level catalog field
and to a field nested inside a `group` field alike.

Derivation SHALL read only the base-locale entry of the field's label. A write
to any other locale's translation SHALL NOT trigger key derivation.
Derivation SHALL lower-case the label. It SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The result then takes the shape the definition contract's identifier grammar
already requires of a published `FieldDef.key`: `/^[a-z_][a-z0-9_]*$/`.

A derived key can collide with a key that another field already carries.
That other field can sit at the top level or inside any `group`. The field
catalog SHALL then append `_2`. A second collision SHALL swap `_2` for `_3`.
The catalog SHALL keep raising the number until no other field carries the
candidate.

A lock stops this auto-fill for a field that is not a `group` and carries a
non-empty key. The lock holds in two cases. In the first, a CEL expression
anywhere in the draft reads `data.<key>`. In the second, the draft's base
version holds a field with the same `id`. A write to the label of a locked
field SHALL leave the key as it stands. This holds even while the key equals
the prior derivation.

Until the studio has read the base version, every such field SHALL count as
locked. The lock ends when no expression reads the key and the base version
lacks the field.

A `group` field is outside the lock. It has no entry in the flat `data`
namespace. A change to its key rewrites the view entries that name it.

A key SHALL still count as derived while it reads the prior derivation plus
a `_<n>` suffix. The collision rule writes that shape. A deduped key thus
keeps following its label after a sibling's rename. A hand-typed key of
exactly that shape counts as derived too.

The form editor keys a field it mints at once, from its kind's name
(`studio-form-editor`). A field the Fields tab adds starts with an empty key.

The developer's first direct write to a field's key field SHALL stop this
auto-fill for that one field. The stop SHALL hold for the rest of the draft's
lifetime in the browser. The key field SHALL remain an ordinary, writable text
input throughout.

#### Scenario: A new top-level field's key follows its label as the developer types

- **WHEN** the studio's content locale is the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types "Requested amount" into its label, never
  touching its key field
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale
- **AND** the developer drops a new field onto the canvas
- **AND** the developer types a label into it, never touching its key field
- **THEN** the field's key does not follow that label. A new field's label
  seeds under the current content locale. Derivation reads the base-locale
  entry alone

#### Scenario: A new nested field's key follows its label as the developer types

- **WHEN** the developer adds a field inside a `group` field
- **AND** the developer types a label into it, never touching its key field
- **THEN** the nested field's key derives from its own label the same way a
  top-level field's does

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** the developer types a label that derives to a key another field
  in the catalog already carries
- **AND** that other field sits at the top level or inside a group
- **THEN** the new field's key reads the colliding key with a `_2` suffix

#### Scenario: A second collision takes the next number

- **WHEN** the developer types a label that derives to `amount`
- **AND** other fields already carry `amount` and `amount_2`
- **THEN** the new field's key reads `amount_3`

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the developer types over a field's auto-derived key
- **AND** the developer then types more into that field's label
- **THEN** that field's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the developer types a base-locale field label, which derives a key
- **AND** the developer switches the studio's content locale
- **AND** the developer types a translation into the label's entry for that
  locale
- **THEN** the field's key keeps the value it derived

#### Scenario: A key that a guard reads stays when the label changes

- **WHEN** a new, unpublished field "Amount" carries the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the developer changes the field's label to "Total amount"
- **THEN** the field's key still reads `amount`

#### Scenario: A published field's key stays when the label changes

- **WHEN** the draft's base version holds the field "Amount" with the
  key `amount`
- **AND** no CEL expression reads `data.amount`
- **AND** the developer changes the field's label to "Total amount"
- **THEN** the field's key still reads `amount`

#### Scenario: A key that nothing reads follows the label in a draft with no base version

- **WHEN** the draft has no base version
- **AND** no CEL expression reads `data.amount`
- **AND** the developer changes the label of the field with the key `amount`
  to "Total amount"
- **THEN** the field's key reads `total_amount`

#### Scenario: The lock holds until the base version has loaded

- **WHEN** the draft has a base version that the studio has not read yet
- **AND** the developer changes the label of a field whose key still equals
  its prior derivation
- **THEN** the field's key keeps its value

#### Scenario: A group field's key follows its label under the lock's conditions

- **WHEN** the draft's base version holds a group field "Request" with
  the key `request`
- **AND** the developer changes the group's label to "Order request"
- **THEN** the group's key reads `order_request`
- **AND** the view entries that named `request` name `order_request`

#### Scenario: A deduped key keeps following its label

- **WHEN** a field labelled "Date" carries the key `date_2`, because another
  field held `date`
- **AND** the other field's key has since changed
- **AND** the developer changes the first field's label to "Due date"
- **THEN** the field's key reads `due_date`

### Requirement: The effect half states its own empty state

The effect half SHALL show an empty state for as long as no step view
references the selected field. It SHALL say that no step asks for the
field yet.

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
- **THEN** the effect half says that no step asks for the field yet
- **AND** it offers the route to a step view, in the empty tone

#### Scenario: The empty state clears when a step references the field

- **WHEN** a step view gains a reference to the selected field
- **THEN** the effect half lists that step, and the empty state goes

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
- **THEN** the effect half offers no "Put this field on a step" control

## REMOVED Requirements

### Requirement: The Form section's configured-field count reads field entries alone

**Reason**: The Form section states its form's size as a sentence now. The
rule moved to `studio-step-page`, "The Form section states the form's size in
words", with both scenarios.

**Migration**: None.
