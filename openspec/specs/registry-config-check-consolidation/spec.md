# registry-config-check-consolidation

## Purpose

A structural (mechanism-level) constraint on the publish-time
registry-validation layer: the resolve → not-registered →
`configSchema`-safeParse-and-map loop used by `checkActionRegistry` and
`checkDataSourceRegistry` shares one implementation, instead of
independently-maintained, structurally identical copies. External behavior
(emitted `RegistryIssue` messages and shapes, both functions' exported
signatures) is unaffected — this capability exists purely to keep the
"don't re-duplicate this" constraint from silently regressing as more
registry-validation checks are added. The mechanism-level counterpart to
`registry-error-consolidation` and `field-expression-map-consolidation`.

## Requirements

### Requirement: Resolve-and-validate-config loop shares one implementation

`checkActionRegistry` and `checkDataSourceRegistry` SHALL compute their
resolve → not-registered → `configSchema`-safeParse-and-map loop through
one shared function, `checkTypedConfig` (`src/engine/registry-check.ts`),
not independently-maintained, structurally identical loop bodies. Each
function SHALL keep its own public signature (`checkActionRegistry(body,
registry)`, `checkDataSourceRegistry(body, dataSourceRegistry)`), mapping
its own collected sites to a normalized `TypedSite[]` and passing its own
resolve function and entity label to the shared helper. The emitted
`RegistryIssue[]` contents SHALL be unchanged from pre-consolidation
behavior for both functions.

#### Scenario: An action of an unregistered type is rejected through the shared helper

- **WHEN** `checkActionRegistry` encounters an action whose `type` does not
  resolve against the injected `Registry`
- **THEN** `checkTypedConfig` emits a `RegistryIssue` whose message is
  `"action type '<type>' is not registered"`, identical to
  pre-consolidation behavior

#### Scenario: A data source of an unregistered type is rejected through the shared helper

- **WHEN** `checkDataSourceRegistry` encounters a data source whose `type`
  does not resolve against the injected `DataSourceRegistry`
- **THEN** `checkTypedConfig` emits a `RegistryIssue` whose message is
  `"data source type '<type>' is not registered"`, identical to
  pre-consolidation behavior

#### Scenario: A config-schema violation is mapped through the shared helper

- **WHEN** `checkActionRegistry` or `checkDataSourceRegistry` encounters a
  site whose `config` fails its resolved definition's `configSchema`
- **THEN** `checkTypedConfig` maps the Zod failure to `RegistryIssue[]` via
  the existing `mapConfigIssues`, with the same `path`/`message` shape as
  pre-consolidation behavior

#### Scenario: A site with no declared config schema is accepted

- **WHEN** `checkActionRegistry` or `checkDataSourceRegistry` resolves a
  site's `type` to a definition with no `configSchema`
- **THEN** `checkTypedConfig` emits no issue for that site's `config`,
  regardless of its shape, identical to pre-consolidation behavior
