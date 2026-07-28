# process-version-inspection Specification

## Purpose

Lets a Studio developer inspect a published process definition's actual
compiled body and diff two representations against each other — closing the
gap where `GET /processes/:processId/versions` (see `http-wrapper`) returns
only metadata (version, hash, status, publishedAt), never a body. The new
`GET /processes/:processId/versions/:version` route resolves the same
compiled `ProcessBody` the engine executes (via `resolveBody`, see
`definition-store`), gated `system:developer` unlike its metadata-only
sibling. The Studio Versions screen (`packages/studio`, see `studio-app`)
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
