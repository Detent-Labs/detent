# process-version-inspection Specification

## Purpose

Lets a Studio developer inspect a published process definition's actual
compiled body and diff two representations against each other — closing the
gap where `GET /processes/:processId/versions` (see `http-wrapper`) returns
only metadata (version, hash, status, publishedAt), never a body. The new
`GET /processes/:processId/versions/:version` route resolves the same
compiled `ProcessBody` the engine executes (via `resolveBody`, see
`definition-store`), gated `system:developer` unlike its metadata-only
sibling. The Studio Versions screen (the studio area of `packages/web`, see `studio-app`)
consumes it to list a process's published versions and draw the change list
between any two, or between the currently open draft and the published
version it was last published from (`base_version`, see `process-drafts`).

## Requirements

<!-- antislop: allow passive-voice -->
### Requirement: A published version's compiled body can be fetched by version number

`GET /processes/:processId/versions/:version` SHALL admit `system:developer`,
`system:author` or `system:templates`. It SHALL return the compiled
`ProcessBody` stored for
that `(processId, version)` pair. That is the same representation
`resolveBody` already resolves for engine use. Its sibling
`GET /processes/:processId/versions` returns metadata only and
requires no specific role. A `(processId, version)` pair with no published
row SHALL answer 404.

#### Scenario: Fetching a published version returns its compiled body

- **WHEN** a caller requests `GET /processes/:processId/versions/:version` for
  a version the engine published
- **THEN** the response body is the compiled `ProcessBody` for that version

#### Scenario: An author fetches a published version's body

- **WHEN** an actor holding only `system:author` calls the version-body route
  for a published version
- **THEN** the response body is the compiled `ProcessBody` for that version

#### Scenario: Fetching a non-existent version is a 404

- **WHEN** a caller names a version number the engine never published for that
  process
- **THEN** the response is 404

#### Scenario: The engine rejects an actor holding no studio role, despite the open sibling route

- **WHEN** an authenticated actor holding none of `system:developer`,
  `system:author` and `system:templates` calls the version-body route
- **THEN** the engine rejects the request
- **AND** that same actor still reads
  `GET /processes/:processId/versions` for metadata

### Requirement: The Studio Versions screen lists published versions and diffs two selected representations

The Studio Versions screen SHALL list a process's published versions, read from
`GET /processes/:processId/versions`. It SHALL let the developer compare two
bodies: two published versions, or a draft against the published version its
`base_version` records. It fetches each published body through the
version-body route.

The screen SHALL show the comparison as the change list the `studio-app`
capability's Changes tab shows. It carries the same groups, rows, stamps,
folding, property values and Developer view. An open row SHALL offer no command
opening a tab. The screen compares versions a draft may no longer hold. The
screen has no content locale, so a localized text SHALL read in the base locale.

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

- **WHEN** a developer selects "diff against base" for a draft whose
  `base_version` is set
- **THEN** the change list reads the base version's body as before and the
  draft's body as after

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

### Requirement: The diff agrees with the definition hash on what counts as the same body

The version diff SHALL compare values by canonical JSON, the rule
`definitionHash` defines a body's identity by. Two bodies that hash alike SHALL
diff as identical. Key order SHALL NOT read as a change at any depth, including
inside an array of objects.

A list's member order SHALL keep reading as a change, since order carries
meaning in a `ProcessBody`. A list whose members differ only in position SHALL
read as one order property on the row owning it. That property SHALL name the
list. No moved member SHALL read as a row of its own.

The studio and the engine SHALL share one canonicalizer. A second
implementation would drift from the one the hash uses, and the two would then
disagree about identity.

This matters wherever the two sides come from different sources. A draft read
back from a `jsonb` column arrives in the store's normalized key order. A
published body arrives in the read schema's order. Before this rule the
comparison reported every array of objects as changed.

#### Scenario: Key order alone is not a change

- **WHEN** two bodies differ only in the key order of an object inside an
  array
- **THEN** the diff reports no row

#### Scenario: Array element order is still a change

- **WHEN** two bodies carry the same steps in a different order
- **THEN** the diff reports one Step order property on the Process row
- **AND** it reports no row for any moved step

### Requirement: A draft is diffed against the authored shape of its base version

The draft-against-base diff SHALL remove the compile pass's injected content
from the published body before it compares. A draft holds the authored shape
and a published body the compiled one. Comparing them raw reports the
cancel-sink step and the reserved cancel outcome as changes. The author made
neither and can act on neither. The next publish injects both again.

Removal SHALL use the same inverse the draft seeding uses. One function then
carries the rule, and one test keeps it in step with the compile pass.

#### Scenario: An unmodified seeded draft diffs clean

- **WHEN** a draft seeded from a published version is diffed against its base
  without a change
- **THEN** the diff reports no differences, which agrees with publishing that
  draft returning the version it came from

#### Scenario: A changed draft reports only the author's change

- **WHEN** a seeded draft with one changed step label is diffed against its
  base
- **THEN** the diff reports that change and reports no cancel-sink step and
  no reserved outcome
