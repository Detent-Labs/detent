<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo (see
     admin-app/spec.md). This new file follows the same convention for
     consistency with every sibling spec, rather than reading differently
     from the rest of openspec/specs/. -->

# studio-tools Specification

## Purpose

A read-only Tools screen on the studio area of `packages/web`: a view of the running
server's two plugin registries (registered action-handler and data-source
type names, nothing else) and a static CEL scratchpad that parses and
type-checks an ad-hoc expression against a chosen field catalog. Neither
writes anything. See `studio-app` for the shell navigation that reaches it,
and `authorization` for the `system:developer` role every route here
enforces.
## Requirements
### Requirement: A Tools screen lists the running server's registered plugin types

The studio area SHALL offer a `/studio/tools` screen, reachable from the shell
alongside the process list, showing the running server's registered
action-handler types (`Registry`) and data-source types (`DataSourceRegistry`)
as two plain lists of type-name strings. It SHALL expose nothing beyond the
registered type names — no `configSchema` internals, no config values — since
verifying a `config`'s shape against its type's schema stays a publish-time
server error, unchanged by this capability.

There is no separate guard registry or field-type registry to show: guards
are CEL expressions, not a registered plugin type, and field types are the
schema's fixed `BaseFieldType` union, not a registry lookup. The screen SHALL
NOT imply either exists.

#### Scenario: The registered action types are listed

- **WHEN** a developer opens `/tools` against a running server that has
  registered `http.request` as an action-handler type
- **THEN** `http.request` appears in the action-types list

#### Scenario: The registered data-source types are listed

- **WHEN** a developer opens `/tools` against a running server that has
  registered `static` as a data-source type
- **THEN** `static` appears in the data-source-types list

#### Scenario: No config detail is exposed

- **WHEN** the registry view renders
- **THEN** it shows only type names, with no rendering of any type's
  `configSchema` or of any config value

### Requirement: GET /registry serves the registered type names, developer-role-gated

The HTTP wrapper SHALL expose a new route, `GET /registry`, unprefixed like
the studio area's other developer-only routes (`/drafts`,
`/migration-plans/...`). It SHALL require `DEVELOPER_ROLE` on the resolved
actor and SHALL return `{ actionTypes: string[], dataSourceTypes: string[] }`
built from the server's live `Registry` and `DataSourceRegistry` — the same
two maps `publishBody`'s registry-resolution check already receives — with no
new engine module.

#### Scenario: A developer reads the registry

- **WHEN** `GET /registry` is requested with a resolvable credential holding
  `system:developer`
- **THEN** the response is 200 with `actionTypes` and `dataSourceTypes`
  arrays reflecting the server's live registries

#### Scenario: A non-developer is refused

- **WHEN** `GET /registry` is requested with a resolvable credential that
  does not hold `system:developer`
- **THEN** the response is 403 and no registry data is returned

### Requirement: A CEL scratchpad parses and type-checks an expression against a chosen field catalog, never against live data

The Tools screen SHALL offer a CEL scratchpad: a text input for an
expression plus a choice of field catalog (a published version, fetched via
the existing `GET /processes/:processId/versions/:version` route, or the
currently open draft's own catalog) against which the expression is parsed
and type-checked, entirely client-side through `workflow-engine/cel/check`
— the same entry point live draft validation already uses. No new HTTP
endpoint backs this.

The scratchpad SHALL NOT evaluate the expression against any instance's live
`data`, matching the static-only scope already chosen for orphan-key
inspection: it answers "does this expression parse and type-check against
this catalog", never "what does this expression currently evaluate to".

#### Scenario: A valid expression against a published version's catalog

- **WHEN** a developer selects a published version and enters an expression
  that parses and type-checks against that version's field catalog
- **THEN** the scratchpad reports no issue

#### Scenario: An expression referencing an undeclared field is rejected

- **WHEN** a developer enters an expression referencing a `data.<key>` not
  present in the selected catalog
- **THEN** the scratchpad reports a type-check issue naming the unresolved
  reference, and no network request is made beyond the one that already
  fetched the catalog

#### Scenario: No live-data evaluation is offered

- **WHEN** the scratchpad is inspected for an action that runs an expression
  against a running instance's current `data`
- **THEN** no such action exists; the scratchpad only parses and type-checks

