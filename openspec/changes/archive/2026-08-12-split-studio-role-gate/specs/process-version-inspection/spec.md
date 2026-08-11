## MODIFIED Requirements

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
