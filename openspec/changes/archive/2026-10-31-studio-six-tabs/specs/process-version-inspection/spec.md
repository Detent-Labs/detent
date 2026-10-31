# Spec Delta

## MODIFIED Requirements

### Requirement: The Studio Versions screen lists published versions and diffs two selected representations

The Studio Versions screen SHALL list a process's published versions, read from
`GET /processes/:processId/versions`. It SHALL let the developer compare two
bodies: two published versions, or a draft against the published version its
`base_version` records. It fetches each published body through the
version-body route.

The screen SHALL show the comparison as the change list the `studio-app`
capability states. It carries the same groups, rows, stamps, folding,
property values and Developer view. An open row SHALL offer no command
opening a tab. The screen compares versions a draft may no longer hold. The
screen has no content locale, so a localized text SHALL read in the base locale.

Where a base version exists, the screen SHALL compare the saved draft against
it as soon as the screen opens. The change list then stands under the
version table with no further press. A later comparison of two versions
replaces it, and the draft-against-base control brings it back.

The screen SHALL show one line while it fetches the bodies it compares. That
line stands where the change list will appear. A failed read SHALL replace the
line with the failure, in the same place.

Two published versions SHALL read side A as before and side B as after. The
migration-plan control beside the comparison reads the same selection as A to
B, so both controls tell one story. A draft against its base SHALL read the
base as before and the draft as after.

Two published versions SHALL each lose the compile pass's injected content
before they compare. The screen removes it through the same inverse the draft
seeding uses.

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow passive-voice -->
#### Scenario: Two published versions are diffed

- **WHEN** a developer selects version 1 as side A and version 2 as side B,
  and compares them
- **THEN** the screen fetches both bodies, and the change list shows what
  version 2 changes against version 1

#### Scenario: Swapping the sides inverts the reading

- **WHEN** version 2 added a field that version 1 lacks
- **AND** the developer selects version 2 as side A and version 1 as side B
- **THEN** that field's row reads removed

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A draft is diffed against its base version

<!-- antislop: allow passive-voice -->
<!-- Why: copied from the live spec; the scenario text stays as the live spec words it. -->
- **WHEN** a developer selects "diff against base" for a draft whose
  `base_version` is set
- **THEN** the change list reads the base version's body as before and the
  draft's body as after

#### Scenario: The screen opens on the draft's changes

- **WHEN** a developer opens the Versions screen for a draft that carries a
  `base_version`
- **THEN** the change list stands with no further press
- **AND** it reads the base version's body as before and the saved draft's
  body as after

#### Scenario: A draft with no base version offers no base diff

- **WHEN** a developer opens the Versions screen for a draft with no base
  version (`base_version` is `null`)
- **THEN** the "diff against base" option is unavailable, and diffing between
  published versions (if any exist) remains available

#### Scenario: The screen says it is reading the bodies

- **WHEN** a developer compares two versions, and neither body has arrived yet
- **THEN** one line stands where the change list will appear, saying the screen
  is reading both versions

#### Scenario: A failed read replaces the waiting line

- **WHEN** a developer compares two versions, and one body read fails
- **THEN** the waiting line goes
- **AND** the screen reports the failure where the change list would appear

#### Scenario: Two published versions show no compiled content

- **WHEN** a developer compares a published version with no contract against a
  published version of the same process with one
- **THEN** no row names the cancel-sink step or the reserved cancel outcome

#### Scenario: A row on the Versions screen opens no tab

- **WHEN** a developer opens a row in the Versions screen's change list
- **THEN** the row shows its property values and its Developer view
- **AND** it offers no command opening a tab
