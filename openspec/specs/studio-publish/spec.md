# studio-publish Specification

## Purpose

Lets a Studio developer publish the draft they just saved without leaving
Studio or hand-crafting a `POST /processes` call — closing the gap where
`packages/editor`'s export path plus a manual publish request was the only
way to turn a Studio-authored draft into a running definition (see
`process-drafts`). `POST /drafts/:processId/publish` targets the *persisted*
draft server-side (never a client-supplied body) and reuses the existing
`publishBody` (see `definition-store`) unchanged, so publishing from Studio
is authorized identically to every other publish path: both
`system:developer` (every studio route) and `system:publish` (the reserved
role `authorization` already gates `POST /processes` with) are required. A
successful publish also stamps the draft's `base_version`, the column
`process-version-inspection`'s Versions screen reads to offer "diff draft
against base."

## Requirements

### Requirement: A saved draft is published through a dedicated route that targets the persisted draft, not the in-browser edit state

`POST /drafts/:processId/publish` SHALL require both `system:developer` and
`system:publish` — `process-drafts` already established that
`system:developer` implies nothing else, so publishing from Studio stays
gated exactly as publishing from anywhere else. The handler SHALL read the
persisted draft (`getDraft`), pass its `body` unchanged to the existing
`publishBody`, and return `{processId, version, definitionHash, status}`. It
SHALL NOT accept a body in the request — there is nothing for the caller to
supply beyond the process id, since the source of truth is the stored draft.

#### Scenario: Publishing uses the persisted draft's body

- **WHEN** `POST /drafts/:processId/publish` is called for a process with a
  saved draft
- **THEN** `publishBody` is called with that draft's stored `body`, and the
  response carries the resulting version and `definitionHash`

#### Scenario: A caller with only system:developer is rejected

- **WHEN** an actor holding `system:developer` but not `system:publish` calls
  the publish route
- **THEN** the request is rejected with the same authorization error `POST
  /processes` already returns for a caller lacking `system:publish`

#### Scenario: A caller with only system:publish is rejected

- **WHEN** an actor holding `system:publish` but not `system:developer` calls
  the publish route
- **THEN** the request is rejected, since every studio route requires
  `system:developer` regardless of any other role held

#### Scenario: Publishing a process with no draft is a 404

- **WHEN** `POST /drafts/:processId/publish` is called for a `processId` with
  no row in `drafts`
- **THEN** the response is 404, the same not-found shape
  `GET /drafts/:processId` already returns

### Requirement: A successful publish stamps the draft's base_version, without disturbing its optimistic-concurrency revision

On a successful publish, the draft's `base_version` column SHALL be set to
the newly published version through a plain update, not through
`saveDraft`'s revision-checked path — `body`, `layout`, and `revision` SHALL
be left untouched by this update, since `base_version` is not part of the
optimistic-concurrency contract those three fields carry.

#### Scenario: Publish stamps base_version without changing revision

- **WHEN** a draft at `revision = 3` is published successfully
- **THEN** the draft's `base_version` becomes the newly published version and
  `revision` remains `3`

#### Scenario: A second publish updates base_version to the latest

- **WHEN** a draft already carrying a `base_version` from a prior publish is
  edited, saved, and published again
- **THEN** `base_version` becomes the new publish's version, replacing the
  earlier one
