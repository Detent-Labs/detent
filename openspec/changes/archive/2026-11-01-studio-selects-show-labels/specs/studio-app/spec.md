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

Derivation SHALL lower-case the label. It SHALL transliterate it by the
rule the header bar's process key states (`studio-canvas`). "Prüfung" then
reads "pruefung". It SHALL collapse every run of characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
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

#### Scenario: A field label with an umlaut derives a readable key

- **WHEN** the developer types "Größe" into a new field's label, never
  touching its key field
- **THEN** the field's key reads `groesse`
