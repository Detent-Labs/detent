# data-source-registry-validation

## Purpose

Authoring-time validation that resolves every declared data source's `type`
against the `DataSourceRegistry` and checks its `config` against the
handler's declared `configSchema`, producing located issues analogous to
`CelIssue`. Invoked by `publishBody` (see `definition-store`) so an
unregistered data source type or a malformed plugin config is a publish
error, never a runtime one. Mirrors `action-registry-validation`'s shape,
but with one collection point (`body.dataSources`) instead of several action
positions.

## Requirements

### Requirement: Every data source's type resolves in the registry

Authoring-time validation SHALL resolve each entry in `body.dataSources`'
`type` against the injected `DataSourceRegistry`, via
`checkDataSourceRegistry(body, dataSourceRegistry)`
(`src/engine/registry-check.ts`). A `DataSourceDef` whose `type` is not
registered SHALL produce a located issue and SHALL NOT be checked further
(its `config` is not validated when its `type` is already unresolved).

Unlike `action-registry-validation`, this check has one collection point
(`body.dataSources`), not several action positions to visit.

#### Scenario: A data source with a registered type passes
- **WHEN** a compiled body's data source has a `type` present in the
  `DataSourceRegistry`
- **THEN** the type check for that data source produces no issue

#### Scenario: A data source with an unregistered type is rejected
- **WHEN** a compiled body's data source has a `type` absent from the
  `DataSourceRegistry`
- **THEN** validation produces a located issue naming the data source's
  location and its unregistered `type`, and does not also report a config
  issue for that same data source

### Requirement: A resolved data source's config is checked against its handler's schema

When a `DataSourceHandlerDef` declares a `configSchema`, authoring-time
validation SHALL parse the data source's `config` against it and SHALL
produce a located issue for each violation when the parse fails. A handler
with no declared `configSchema` SHALL accept any `config` — the schema is
opt-in per handler, not required, matching the action registry's own
behavior.

#### Scenario: A config matching its handler's schema passes
- **WHEN** a resolved data source's `config` satisfies its handler's
  declared `configSchema`
- **THEN** validation produces no issue for that data source's config

#### Scenario: A config violating its handler's schema is rejected
- **WHEN** a resolved data source's `config` fails its handler's declared
  `configSchema`
- **THEN** validation produces at least one located issue identifying the
  data source's location and the schema violation

#### Scenario: The static handler rejects a config missing options
- **WHEN** a data source declares `type: "static"` and a `config` with no
  `options` array
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A handler with no declared schema accepts any config
- **WHEN** a resolved data source's handler has no `configSchema`
- **THEN** validation produces no config issue for that data source,
  regardless of the `config`'s shape

### Requirement: An unresolved or schema-violating data source is a publish error, never a runtime one

`publishBody` SHALL invoke `checkDataSourceRegistry` in the same
in-process validation slot `checkActionRegistry`/`checkAssignmentRegistry`
already occupy — before CEL and cross-process validation, on the compiled
body, after the hash-hit no-op return. A body with any unresolved-type or
schema-violating data source SHALL throw `DataSourceRegistryValidationError`
carrying every located issue, and SHALL NOT be persisted as a new version.

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
  `checkDataSourceRegistry`, matching the existing hash-hit no-op behavior
  for CEL and other publish-time checks

### Requirement: Every located issue is reported, not only the first

Validation SHALL collect every issue across every data source in the body
before returning, mirroring the existing CEL and action-registry validation
contract of surfacing a whole publish's worth of fixes at once.

#### Scenario: Multiple invalid data sources each produce an issue
- **WHEN** a compiled body has two data sources that each fail validation
  (for any combination of an unregistered type or a schema-violating config)
- **THEN** the returned issues include one entry for each, not only the
  first encountered
