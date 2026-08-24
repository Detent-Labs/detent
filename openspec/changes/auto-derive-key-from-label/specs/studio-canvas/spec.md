## ADDED Requirements

### Requirement: The header bar's process key auto-derives from the process label

The header bar's `⋮` menu's "Process, saved with the draft" group SHALL
auto-fill the process key from the process label as the developer types it,
for a draft whose key is empty or still equal to what derivation would
produce from the label's prior value. Derivation SHALL read only the
process label's base-locale entry: an edit to any other locale's
translation SHALL NOT trigger key derivation. Derivation SHALL lower-case
the label, collapse every run of characters outside `[a-z0-9]` to a single
`_`, and trim a leading or trailing `_`; a result starting with a digit
SHALL gain a leading `_`.

The first edit the developer types directly into the key field SHALL stop
this auto-fill for the remainder of the draft's lifetime in the browser: no
later label edit SHALL overwrite a key the developer has hand-set. The key
field SHALL remain an ordinary editable text input throughout — nothing
about it SHALL become read-only or disabled.

#### Scenario: A new process's key follows its label as the developer types

- **WHEN** the developer types "Expense Approval" into a new draft's
  process label, having never touched the key field — a new draft's content
  locale always starts equal to its base locale, so this holds regardless
  of prior locale switching
- **THEN** the process key reads `expense_approval`

#### Scenario: A hand-edited process key stops following the label

- **WHEN** the developer changes the auto-derived process key to `expenses`
  and then edits the process label further
- **THEN** the process key stays `expenses`

#### Scenario: Editing a non-base-locale translation leaves an already-derived process key untouched

- **WHEN** the developer types a base-locale process label (deriving a
  key), switches the studio's content locale, and types a translation into
  the process label's non-base-locale entry
- **THEN** the process key is unchanged

### Requirement: The identity zone's step key auto-derives from the step label

The identity zone's key field SHALL auto-fill from the selected step's
label as the developer types it, for a step whose key is empty or still
equal to what derivation would produce from the label's prior value, using
the same derivation rule as the header bar's process key. This auto-fill
and lock behavior SHALL apply identically whether the step's label is
edited via the identity zone's own label input or via the canvas node's
inline rename — the two are one label-editing surface for this purpose, so
a rename through either one keeps the step's key in agreement with the
other, and a key locked by a hand-edit made through either route SHALL stay
locked through the other.

When the derived key would collide with another step's key already in the
draft's workflow, the identity zone SHALL append `_2`, and, if that also
collides, `_3`, and so on, until the candidate is unique among the draft's
steps.

The first edit the developer types directly into the identity zone's key
field SHALL stop this auto-fill for that one step for the remainder of the
draft's lifetime in the browser.

#### Scenario: A new step's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the draft's
  base locale, creates a step from the palette and types "Manager review"
  into its label, having never touched its key field
- **THEN** the step's key reads `manager_review`

#### Scenario: A new step's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale, creates a step from the palette, and types a
  label into it, having never touched its key field
- **THEN** the step's key stays empty, since a newly created step's label
  seeds under the current content locale and derivation reads only the
  base-locale entry

#### Scenario: A colliding derived step key gets a numeric suffix

- **WHEN** the developer creates a second step and types the same label an
  existing step already carries
- **THEN** the new step's key reads the existing step's derived key with a
  `_2` suffix

#### Scenario: A hand-edited step key stops following its label

- **WHEN** the developer changes a step's auto-derived key and then edits
  that step's label further
- **THEN** that step's key stays what the developer typed

#### Scenario: A step renamed via the canvas node's inline rename derives its key the same way

- **WHEN** the developer double-clicks a new step's canvas node and types
  "Manager review" via the inline rename, having never touched its key
  field
- **THEN** the step's key reads `manager_review`, the same result typing
  the same label into the identity zone would produce

#### Scenario: Editing a non-base-locale translation leaves an already-derived step key untouched

- **WHEN** the developer types a base-locale step label (deriving a key),
  switches the studio's content locale, and types a translation into the
  step label's non-base-locale entry, via either the identity zone or the
  canvas node's inline rename
- **THEN** the step's key is unchanged
