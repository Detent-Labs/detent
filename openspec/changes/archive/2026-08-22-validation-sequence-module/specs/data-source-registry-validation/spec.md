<!-- antislop: allow-file passive-voice sentence-length em-dash synonym-rotation -->
<!-- Passive voice and the "error class" vs. "issue" distinction match every
     sibling spec in this directory (see openspec/specs/data-source-registry-validation/spec.md's
     own Gherkin "WHEN publishBody is called" idiom, unchanged here); "error
     class" names a TypeScript class (DataSourceRegistryValidationError),
     never a synonym for the located RegistryIssue records. Sentence length
     and the em-dash follow the base spec's own requirement prose style. -->

## Purpose

A wording correction to the "publish error, never a runtime one"
requirement. `publishBody` no longer calls `checkDataSourceRegistry` by
name. It reaches the same resolve-then-parse verdict through
`validateReferences`'s data-source-type dimension, which composes the same
`resolveType`/`checkConfigOnly` pair `checkDataSourceRegistry` itself
composes internally. See `validation-sequence-module`'s design.md, "The
type-resolution half shares one implementation across all three registry
checks." Placement, precedence and the thrown error class stay exactly as
they are.

## MODIFIED Requirements

### Requirement: An unresolved or schema-violating data source is a publish error, never a runtime one

`publishBody` SHALL reach the data-source resolve-then-parse verdict in the
same in-process validation slot the action-type and assignment-type
dimensions occupy — before CEL and cross-process validation, on the compiled
body, after the hash-hit no-op return — by calling `validateReferences`
(`src/validate.ts`), not by calling `checkDataSourceRegistry` directly.
`validateReferences`'s data-source-type dimension SHALL call `resolveType`
against a `RegistryDescription` built from the injected `DataSourceRegistry`,
then SHALL call `checkConfigOnly` against that same live registry. Those two
functions are the same resolve-then-parse primitives `checkDataSourceRegistry`
itself composes internally. The split moved the call path, not the check. A
body with any unresolved-type or schema-violating data source SHALL throw
`DataSourceRegistryValidationError` carrying every located issue, and SHALL
NOT be persisted as a new version.

`checkDataSourceRegistry` SHALL keep existing as a combined entry point,
composing the same `resolveType`/`checkConfigOnly` pair for a caller that
wants a single call over both halves at once. It is no longer `publishBody`'s
own call path.

#### Scenario: Publishing a body with an unregistered data source type throws
- **WHEN** `publishBody` is called with a compiled body containing a data
  source whose `type` is absent from the injected `DataSourceRegistry`
- **THEN** it throws `DataSourceRegistryValidationError` and no new version
  is persisted

#### Scenario: Publishing a body with a schema-violating data source config throws
- **WHEN** `publishBody` is called with a compiled body containing a data
  source whose `config` fails its handler's `configSchema`
- **THEN** it throws `DataSourceRegistryValidationError` and no new version
  is persisted

#### Scenario: An identical re-publish of an already-valid body stays a no-op
- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version
- **THEN** it returns the existing version without re-running
  `validateReferences`'s data-source-type resolution or config-validation
  halves, matching the existing hash-hit no-op behavior for CEL and other
  publish-time checks
