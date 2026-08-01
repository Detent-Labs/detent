<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation long-words -->
<!-- The requirement bodies below are carried over verbatim from the main
     spec, with only the moved paths and package names edited. Rewording
     the surrounding prose would change requirement text for a stylistic
     reason unrelated to this change. -->

## MODIFIED Requirements

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

