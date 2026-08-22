<!-- antislop: allow-file passive-voice -->
<!-- This file's four "is rejected"/"is mapped"/"is accepted" scenario titles below
     reproduce openspec/specs/registry-config-check-consolidation/spec.md's own
     scenario titles verbatim. openspec validate --strict requires a MODIFIED
     requirement to carry every scenario the base spec's same-named requirement
     carries, title included, or archive refuses to drop them. The wording is not
     an authored voice choice here; it is the base spec's frozen title text. -->

## Purpose

A structural (mechanism-level) constraint on the publish-time
registry-validation layer: the resolve → not-registered →
`configSchema`-safeParse-and-map loop used by `checkActionRegistry`,
`checkAssignmentRegistry` and `checkDataSourceRegistry` shares one
implementation, instead of independently-maintained, structurally identical
copies. External behavior (emitted `RegistryIssue` messages and shapes, all
three functions' exported signatures) is unaffected — this capability exists
purely to keep the "don't re-duplicate this" constraint from silently
regressing as more registry-validation checks are added. The mechanism-level
counterpart to `registry-error-consolidation` and
`field-expression-map-consolidation`.

## MODIFIED Requirements

### Requirement: Resolve-and-validate-config loop shares one implementation

`checkActionRegistry`, `checkAssignmentRegistry` and `checkDataSourceRegistry`
SHALL compute their resolve → not-registered → `configSchema`-safeParse-and-map
loop through one shared function. That function is `checkTypedConfig`
(`src/engine/registry-check.ts`), not three independently-maintained,
structurally identical loop bodies.

Each function SHALL keep its own public signature:
`checkActionRegistry(body, registry)`,
`checkAssignmentRegistry(body, assignmentRegistry)`,
`checkDataSourceRegistry(body, dataSourceRegistry)`. Each maps its own
collected sites to a normalized `TypedSite[]`. Each passes its own resolve
function and entity label to the shared helper. The emitted
`RegistryIssue[]` contents keep pre-consolidation behavior for all three.

`checkTypedConfig` SHALL itself compute its loop's two halves through two
further shared functions, both in `src/engine/registry-check.ts`:
`resolveType` for the "not registered" half, and `checkConfigOnly` for the
`configSchema`-safeParse-and-map half. `resolveType` SHALL read a
serializable list of registered type names, not a resolve function bound to
a live registry. `checkConfigOnly` SHALL read a resolve function bound to a
live registry, and SHALL emit no issue for a site whose type does not
resolve — `resolveType` already reports that site.

Every dimension's own standalone type-resolution half SHALL call that same
`resolveType`. That half is the one a caller runs against a
`RegistryDescription`, with no live registry available. The not-registered
check therefore has exactly one implementation, whether a caller holds a
live registry or only its wire-side description.

A caller holding a live registry but no compiled body's worth of
`checkTypedConfig` context — `validateReferences` (`src/validate.ts`) is
this capability's one such caller — SHALL call `checkConfigOnly` directly,
per dimension, to populate that dimension's config-issue array. It SHALL
NOT call `checkTypedConfig` for this purpose: `checkTypedConfig` also runs
`resolveType`, which would duplicate the not-registered issues that
caller's own type-resolution call already produced. The config-validation
check therefore also has exactly one implementation, whether reached through
`checkTypedConfig`'s own composition or called directly.

<!-- antislop: allow passive-voice -->
<!-- The quoted strings below are the literal runtime messages checkTypedConfig/resolveType emit, e.g. "action type '<type>' is not registered". That "is not registered" is message text, not an authored voice choice, and changing it would misstate the actual string the code produces. -->

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
- **THEN** `checkTypedConfig` maps the Zod parse's issues to
  `RegistryIssue[]` via the existing `mapConfigIssues`
- **AND** the `path`/`message` shape stays the same as pre-consolidation
  behavior

#### Scenario: A site with no declared config schema is accepted

- **WHEN** `checkActionRegistry` or `checkDataSourceRegistry` resolves a
  site's `type` to a definition with no `configSchema`
- **THEN** `checkTypedConfig` emits no issue for that site's `config`,
  regardless of its shape, identical to pre-consolidation behavior

#### Scenario: A wire-side caller's type-resolution half reuses resolveType

- **WHEN** a caller holding only a serializable `RegistryDescription`, not a
  live `Registry`, runs a dimension's standalone type-resolution half
- **AND** the body names a type that description does not list
- **THEN** `resolveType` emits the same `"<entity label> type '<type>' is
  not registered"` message
- **AND** that matches what `checkTypedConfig` emits for the same condition
  when a live registry is present

#### Scenario: A live-registry caller's config-validation half reuses checkConfigOnly directly

- **WHEN** a caller holding a live registry, but no `checkTypedConfig` call
  of its own, runs a dimension's standalone config-validation half
- **AND** a site's `type` resolves against that registry to a definition
  whose `configSchema` the site's `config` fails
- **THEN** `checkConfigOnly` maps the Zod parse's issues to `RegistryIssue[]`
  via the same `mapConfigIssues` `checkTypedConfig` uses
- **AND** that caller's config-issue array carries no duplicate
  not-registered issue for a site its own type-resolution call already
  reported
