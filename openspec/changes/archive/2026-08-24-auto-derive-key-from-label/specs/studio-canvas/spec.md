## ADDED Requirements

### Requirement: The header bar's process key auto-derives from the process label

The header bar's `⋮` menu holds a "Process, saved with the draft" group.
That group's key field SHALL auto-fill from the process label as the
developer types. This holds while the draft's key is empty. It also holds
while the key still matches what derivation would produce from the label's
prior value.

Derivation SHALL read only the process label's base-locale entry. An edit
to any other locale's translation SHALL NOT trigger key derivation.
Derivation SHALL lower-case the label. It SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The first edit the developer types directly into the key field SHALL
disable this auto-fill. That holds for the rest of the draft's lifetime in
the browser. No later label edit SHALL overwrite a key the developer has
hand-set. The key field SHALL remain an ordinary editable text input
throughout. Nothing about it SHALL become read-only or disabled otherwise.

#### Scenario: A new process's key follows its label as the developer types

- **WHEN** the developer types "Expense Approval" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `expense_approval`

#### Scenario: A hand-edited process key no longer follows the label

- **WHEN** the developer changes the auto-derived process key to `expenses`
  and then edits the process label further
- **THEN** the process key stays `expenses`

#### Scenario: Editing a non-base-locale translation leaves an already-derived process key untouched

- **WHEN** the developer types a base-locale process label, deriving a
  key, then switches the studio's content locale
- **AND** the developer types a translation into the process label's
  non-base-locale entry
- **THEN** the process key stays unchanged

### Requirement: The identity zone's step key auto-derives from the step label

The identity zone's key field SHALL auto-fill from the selected step's
label as the developer types. This holds for a step whose key is empty. It
also holds for a step whose key still matches what derivation would
produce from the label's prior value. Derivation SHALL follow the same
rule the header bar's process key uses.

This auto-fill and lock behavior SHALL apply through both label-editing
routes. Those routes are the identity zone's own label input, and the
canvas node's inline rename. The two routes are one label-editing surface
for this purpose. A rename through either route SHALL keep the step's key
in agreement with the other. A key locked by a hand-edit made through
either route SHALL stay locked through the other.

The identity zone SHALL append `_2` when the derived key collides with
another step's key in the draft's workflow. If that also collides, the
identity zone SHALL append `_3`. It SHALL keep incrementing the suffix
until the candidate is unique among the draft's steps.

The first edit typed directly into the identity zone's key field SHALL
disable this auto-fill for that step. That holds for the rest of the
draft's lifetime in the browser.

#### Scenario: A new step's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the draft's
  base locale, creates a step from the palette
- **AND** the developer types "Manager review" into its label, having
  never touched its key field
- **THEN** the step's key reads `manager_review`

#### Scenario: A new step's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away
  from the draft's base locale
- **AND** the developer creates a step from the palette and types a label
  into it
- **AND** the developer never touches its key field
- **THEN** the step's key stays empty. A newly created step's label seeds
  under the current content locale. Derivation reads only the base-locale
  entry

#### Scenario: A colliding derived step key gets a numeric suffix

- **WHEN** the developer creates a second step and types the same label an
  existing step already carries
- **THEN** the new step's key reads the existing step's derived key with a
  `_2` suffix

#### Scenario: A hand-edited step key no longer follows its label

- **WHEN** the developer changes a step's auto-derived key and then edits
  that step's label further
- **THEN** that step's key stays what the developer typed

#### Scenario: A step renamed via the canvas node's inline rename derives its key the same way

- **WHEN** the developer double-clicks a new step's canvas node
- **AND** the developer types "Manager review" via the inline rename,
  having never touched its key field
- **THEN** the step's key reads `manager_review`. Typing the same label
  into the identity zone would produce the same result

#### Scenario: Editing a non-base-locale translation leaves an already-derived step key untouched

- **WHEN** the developer types a base-locale step label, deriving a key,
  then switches the studio's content locale
- **AND** the developer types a translation into the step label's
  non-base-locale entry
- **AND** the developer does this via either the identity zone or the
  canvas node's inline rename
- **THEN** the step's key stays unchanged
