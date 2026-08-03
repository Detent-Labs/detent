## MODIFIED Requirements

### Requirement: A Tools screen lists the running server's registered plugin types

The studio area SHALL offer a `/studio/tools` screen, reachable from the shell
alongside the process list. It SHALL show three registered-type lists:
action-handler types (`Registry`), data-source types (`DataSourceRegistry`),
and assignment-strategy types (`AssignmentRegistry`). Each list holds plain
type-name strings only.

The screen itself SHALL expose nothing beyond these type names. It SHALL
show no `configSchema` internals and no config values. `GET /registry` now
also carries a config-schema description per type. That description serves
the `studio-plugin-config-form` capability, not this screen. Verifying a
`config`'s shape against its type's schema stays a publish-time server
error, unchanged by this capability.

There is no separate guard registry or field-type registry to show. Guards
are CEL expressions, not a registered plugin type. Field types are the
schema's fixed `BaseFieldType` union, not a registry lookup. The screen
SHALL NOT imply either exists.

#### Scenario: The Tools screen lists a registered action type

- **WHEN** a developer opens `/tools` against a running server that has
  registered `http.request` as an action-handler type
- **THEN** `http.request` appears in the action-types list

#### Scenario: The Tools screen lists a registered data-source type

- **WHEN** a developer opens `/tools` against a running server that has
  registered `static` as a data-source type
- **THEN** `static` appears in the data-source-types list

#### Scenario: The Tools screen lists a registered assignment-strategy type

- **WHEN** a developer opens `/tools` against a running server that has
  registered `static` as an assignment-strategy type
- **THEN** `static` appears in the assignment-strategy-types list

#### Scenario: The Tools screen shows no config detail

- **WHEN** a developer opens the registry view
- **THEN** it shows only type names. No `configSchema` and no config value
  appears, even though `GET /registry` carries a schema description for
  other consumers.

### Requirement: GET /registry serves the registered type names, developer-role-gated

The HTTP wrapper SHALL expose a route, `GET /registry`, unprefixed like
the studio area's other developer-only routes (`/drafts`,
`/migration-plans/...`). It SHALL need `DEVELOPER_ROLE` on the resolved
actor. It SHALL return `{ actionTypes: string[], dataSourceTypes: string[],
assignmentStrategyTypes: string[] }`, built from the server's live
`Registry`, `DataSourceRegistry` and `AssignmentRegistry`. These are the
same three maps `publishBody`'s registry-resolution checks already read.

The response SHALL also carry a browser-consumable description of each
registered type's `configSchema`, for every type whose registry entry
declares one. A type with no declared `configSchema` SHALL still appear in
its type-name array, with no schema description alongside it.

#### Scenario: A developer reads the registry

- **WHEN** a developer holding `system:developer` requests `GET /registry`
- **THEN** the server responds 200 with `actionTypes`, `dataSourceTypes`
  and `assignmentStrategyTypes` reflecting its live registries. It includes
  each entry's config-schema description when declared.

#### Scenario: The server denies a non-developer

- **WHEN** a credential that lacks `system:developer` requests
  `GET /registry`
- **THEN** the server responds 403 and returns no registry data

#### Scenario: A type with no declared schema has no schema description

- **WHEN** a registered type declares no `configSchema`
- **THEN** `GET /registry` lists its type name with no schema description
  for that type
