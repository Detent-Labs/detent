## ADDED Requirements

### Requirement: Resolve the newest published version for a process

`createDefinitionStore`'s returned object SHALL provide
`resolveLatest(processId): Promise<{ version: number; body: ProcessBody } | undefined>`,
returning the newest published `version` for `processId` together with its
`ProcessBody`, or `undefined` when `processId` has no published version. The
returned body MUST hash to that version's persisted `definitionHash`, so an
instance created against it pins and rehydrates correctly, exactly as
`resolveBody` guarantees for an explicit version.

#### Scenario: Resolving the latest version of a published process
- **WHEN** `resolveLatest(processId)` is called for a process with one or more
  published versions
- **THEN** it returns the highest `version` number published for that
  `processId` together with its `ProcessBody`

#### Scenario: Resolving the latest version after a new publish
- **WHEN** a process already has a published version and a new, differing
  body is published for it, and `resolveLatest` is then called
- **THEN** it returns the newly published (higher) version, not the prior one

#### Scenario: Resolving the latest version of an unpublished process
- **WHEN** `resolveLatest` is called for a `processId` with no published
  version
- **THEN** it returns `undefined` and does not throw
