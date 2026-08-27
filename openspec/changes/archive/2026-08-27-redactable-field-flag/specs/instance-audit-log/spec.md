## MODIFIED Requirements

<!-- antislop: allow-file passive-voice -->
<!-- The SHALL/WHEN/THEN Gherkin grammar this repo's specs use is structurally passive; see data-retention/spec.md for the same directive and reason. -->

### Requirement: Redaction clears values across a field's whole history

Redacting an instance SHALL append one `redact` entry for a field only
when two conditions both hold. First, the instance's audit log holds an
entry for that field. Second, the instance's currently pinned version
marks the field `redactable` in its field catalog (`definition-contract`).
Consider a field the audit log holds an entry for, whose currently pinned
version does not mark it `redactable`. That field SHALL keep its existing
entries untouched, including one whose id is absent from the catalog
entirely.

Each `redact` entry SHALL name the actor, the time and the field. It
SHALL also name the reason its caller supplied, when one was given. A
`redact` entry SHALL carry no value and no salt. Its fingerprint SHALL be
the fixed empty one, which verification skips because the entry carries
no salt. Redaction SHALL then clear the value and the salt of every
earlier entry for those fields on that instance.

Redaction SHALL cover a redactable field's whole history, never one
step's value alone. It SHALL use only the currently pinned version's
`redactable` flag for that field id. It SHALL never use a flag an earlier
or later version declared for the same id. An instance holds exactly one
pinned version at redaction time. This reads as one flag per field, not a
version-by-version merge.

Every entry's hash SHALL still verify afterwards, for both a cleared
field and an untouched one. The hash covers the fingerprint rather than
the value.

A cleared entry's fingerprint SHALL NOT be checkable against its value,
which no longer exists. The chain SHALL still show that the entry was
neither inserted, reordered nor rewritten.

#### Scenario: Redacting a field clears its earlier values

- **WHEN** a field marked `redactable: true` in the instance's currently
  pinned version, carrying three successive values on one instance, is
  redacted
- **THEN** all three entries hold no value and no salt. One `redact`
  entry for that field names the actor and the time

#### Scenario: A non-redactable field keeps its history

- **WHEN** an instance is redacted, and one of its fields is not marked
  `redactable` in the instance's currently pinned version
- **THEN** that field's entries keep their values and salts unchanged,
  and no `redact` entry is appended for it

#### Scenario: A field removed from the catalog keeps its history

- **WHEN** an instance's audit log holds entries for a field id
  the currently pinned version's catalog no longer declares
- **THEN** redaction leaves that field's entries unchanged, whether or
  not an earlier version marked the field `redactable`

#### Scenario: The currently pinned version's flag governs, not an earlier one

- **WHEN** an instance migrates from a version marking a field
  `redactable: true` to one marking it `redactable: false`
- **THEN** redaction leaves that field's entries unchanged, including
  values written before the migration

#### Scenario: The currently pinned version's flag governs, not a later one

- **WHEN** an instance migrates from a version leaving a field's
  `redactable` unset to one marking it `redactable: true`
- **THEN** redaction clears that field's entries, including values
  written before the migration

#### Scenario: A redacted instance still verifies

- **WHEN** verification runs against an instance whose redactable fields
  were redacted
- **THEN** it reports the chain as holding

#### Scenario: Another instance's entries keep their values

- **WHEN** one instance is redacted
- **THEN** a second instance's entries still carry their values in clear
  text
