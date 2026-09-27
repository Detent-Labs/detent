## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: A published version's compiled body can be fetched by version number

`GET /processes/:processId/versions/:version` SHALL admit `system:developer`,
`system:author` or `system:templates`. It SHALL return the compiled
`ProcessBody` stored for
that `(processId, version)` pair. That is the same representation
`resolveBody` already resolves for engine use. Its sibling
`GET /processes/:processId/versions` returns metadata only and
does not need a specific role. A `(processId, version)` pair with no published
row SHALL answer 404.

A published version number is 1 or higher. A version below 1 names no
published row, so the route SHALL answer 404 for it. This holds for every
actor the route admits, whatever other role that actor holds. It also holds
where a draft snapshot stores a
body under that number. A draft snapshot SHALL NOT be readable through this
route.

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

#### Scenario: A curator cannot read a draft snapshot

- **WHEN** a Play has stored a draft snapshot for a process under version -1
- **AND** an actor holding only `system:templates` requests
  `GET /processes/:processId/versions/-1`
- **THEN** the response is 404
- **AND** the response does not contain any part of the draft body

#### Scenario: A developer outside the Developer list cannot read a draft snapshot

- **WHEN** a Play has stored a draft snapshot for a process under version -1
- **AND** an actor holding `system:developer` who is not on that process's
  Developer list requests `GET /processes/:processId/versions/-1`
- **THEN** the response is 404
