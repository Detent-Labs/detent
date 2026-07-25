## ADDED Requirements

### Requirement: Enumerate published processes

The definition store SHALL expose a read listing every process that has at
least one published version. Each entry SHALL carry the `processId`, the
newest published `version`, that version's `definitionHash`, `status` and
`publishedAt`, and the process's display metadata (`key`, `label`,
`baseLocale`) read from the newest published body. It SHALL NOT return the
bodies themselves.

The read SHALL be ordered deterministically by `processId` so repeated calls
agree.

#### Scenario: Listing after two processes are published

- **WHEN** two processes have been published
- **THEN** both are listed with their newest version and its hash
- **AND** no entry carries a process body

#### Scenario: The newest version is reported

- **WHEN** a process is published, then published again with a changed body
- **THEN** its entry reports version 2 and version 2's hash

#### Scenario: An empty store lists nothing

- **WHEN** no process has been published
- **THEN** an empty list is returned and no error is raised

### Requirement: Enumerate the versions of one process

The definition store SHALL expose a read listing every published version of a
given `processId`, each carrying `version`, `definitionHash`, `status` and
`publishedAt`, ordered by `version`. It SHALL NOT return the bodies.

Requesting the versions of an unpublished process SHALL return an empty list
rather than an error, matching how resolving its latest version returns
undefined rather than throwing.

#### Scenario: Listing the versions of a twice-published process

- **WHEN** a process has been published twice
- **THEN** both versions are listed in version order with their hashes

#### Scenario: An identical re-publish adds no version

- **WHEN** a process is published and then re-published with an identical body
- **THEN** exactly one version is listed

#### Scenario: An unpublished process has no versions

- **WHEN** the read is called with a `processId` that was never published
- **THEN** an empty list is returned and no error is raised
