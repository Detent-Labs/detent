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
consumes it to list a process's published versions and render a JSON diff
between any two, or between the currently open draft and the published
version it was last published from (`base_version`, see `process-drafts`).

## Requirements

### Requirement: A published version's compiled body can be fetched by version number

`GET /processes/:processId/versions/:version` SHALL require
`system:developer` and SHALL return the compiled `ProcessBody` stored for
that `(processId, version)` pair — the same representation
`resolveBody` already resolves for engine use, unlike its sibling
`GET /processes/:processId/versions`, which returns metadata only and
requires no specific role. A `(processId, version)` pair with no published
row SHALL answer 404.

#### Scenario: Fetching a published version returns its compiled body

- **WHEN** `GET /processes/:processId/versions/:version` is called for a
  version that was published
- **THEN** the response body is the compiled `ProcessBody` for that version

#### Scenario: Fetching a non-existent version is a 404

- **WHEN** the route is called with a version number never published for that
  process
- **THEN** the response is 404

#### Scenario: An actor without system:developer is rejected despite the open sibling route

- **WHEN** an actor with no `system:developer` role, but otherwise
  authenticated, calls the version-body route
- **THEN** the request is rejected, even though the same actor can
  successfully call `GET /processes/:processId/versions` for metadata

### Requirement: The Studio Versions screen lists published versions and diffs two selected representations

The Studio Versions screen SHALL list a process's published versions (via the
existing `GET /processes/:processId/versions`) and SHALL let the developer
select any two — either two published versions, or a draft against the
published version recorded in its `base_version` — and render a JSON diff
between their bodies, fetching each body via the new version-body route.

#### Scenario: Two published versions are diffed

- **WHEN** a developer selects two published versions in the Versions screen
- **THEN** both bodies are fetched and a JSON diff between them is rendered

#### Scenario: A draft is diffed against its base version

- **WHEN** a developer selects "diff against base" for a draft whose
  `base_version` is set
- **THEN** the draft's body and the `base_version`'s published body are
  diffed and rendered

#### Scenario: A draft with no base version offers no base diff

- **WHEN** a developer opens the Versions screen for a draft that has never
  been published (`base_version` is `null`)
- **THEN** the "diff against base" option is unavailable, and diffing between
  published versions (if any exist) remains available

### Requirement: The diff agrees with the definition hash on what counts as the same body

The version diff SHALL compare values by canonical JSON, the rule
`definitionHash` defines a body's identity by. Two bodies that hash alike
SHALL diff as identical. Key order SHALL NOT read as a change at any depth,
including inside an array of objects. Array element order SHALL keep reading
as a change, since order carries meaning in a `ProcessBody`.

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
- **THEN** the diff reports no entry

#### Scenario: Array element order is still a change

- **WHEN** two bodies carry the same array elements in a different order
- **THEN** the diff reports that array as changed

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
