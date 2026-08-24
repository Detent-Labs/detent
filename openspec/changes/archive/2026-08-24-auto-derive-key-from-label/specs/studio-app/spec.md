## ADDED Requirements

### Requirement: The field catalog's field key auto-derives from the field label

The field catalog's key field SHALL auto-fill from the edited field's
label as the developer types. This holds for a field whose key is
empty. It also holds for a field whose key still equals what
derivation would produce from the label's prior value. This applies
to a top-level catalog field and to a field nested inside a `group`
field's own child editor alike.

Derivation SHALL read only the field label's base-locale entry. A
change to any other locale's translation SHALL NOT trigger key
derivation. Derivation SHALL lower-case the label. It SHALL collapse
every run of characters outside `[a-z0-9]` to a single `_`.

It SHALL trim a leading or trailing `_`. A result starting with a
digit SHALL gain a leading `_`. That is the same shape the definition
contract's identifier grammar (`/^[a-z_][a-z0-9_]*$/`) already
requires of a published `FieldDef.key`.

The field catalog SHALL append `_2` when the derived key collides
with another key already in the process's field catalog. That other
key can belong to a top-level field, or to a
field nested inside any `group`. If that also collides, the field
catalog SHALL append `_3`.
It SHALL keep incrementing the suffix until the candidate is unique
across the whole catalog.

The first change the developer types directly into a field's key
field SHALL disable this auto-fill for that one field. That holds for
the rest of the draft's lifetime in the browser. The key field SHALL
remain an ordinary editable text input throughout.

#### Scenario: A new top-level field's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the
  draft's base locale, drops a new field onto the canvas
- **AND** the developer types "Requested amount" into its label,
  having never touched its key field
- **THEN** the field's key reads `requested_amount`

#### Scenario: A new field's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale
  away from the draft's base locale
- **AND** the developer drops a new field onto the canvas and types a
  label into it
- **AND** the developer never touches its key field
- **THEN** the field's key stays empty. A newly created field's label
  seeds under the current content locale. Derivation reads only the
  base-locale entry

#### Scenario: A new nested field's key follows its label as the developer types

- **WHEN** the developer adds a field inside a `group` field and
  types a label into it
- **AND** the developer never touches that nested field's key field
- **THEN** the nested field's key derives from its own label the same
  way a top-level field's does

#### Scenario: A colliding derived field key gets a numeric suffix

- **WHEN** the developer types a label that derives to a key another
  field in the catalog already carries
- **AND** that other field is top-level or nested inside a group
- **THEN** the new field's key reads the colliding key with a `_2`
  suffix

#### Scenario: A hand-edited field key stops following its label

- **WHEN** the developer changes a field's auto-derived key and then
  changes that field's label further
- **THEN** that field's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived field key untouched

- **WHEN** the developer types a base-locale field label, deriving a
  key, then switches the studio's content locale
- **AND** the developer types a translation into the field label's
  non-base-locale entry
- **THEN** the field's key stays unchanged
