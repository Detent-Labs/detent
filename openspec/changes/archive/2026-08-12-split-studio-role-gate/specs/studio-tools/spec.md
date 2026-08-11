## MODIFIED Requirements

### Requirement: GET /registry serves the registered type names, developer-role-gated

The HTTP wrapper SHALL expose a route, `GET /registry`, unprefixed like
the studio area's other role-gated routes (`/drafts`,
`/migration-plans/...`). It SHALL admit `DEVELOPER_ROLE` or `AUTHOR_ROLE` on
the resolved actor. It SHALL return `{ actionTypes: string[],
dataSourceTypes: string[],
assignmentStrategyTypes: string[] }`, built from the server's live
`Registry`, `DataSourceRegistry` and `AssignmentRegistry`. These are the
same three maps `publishBody`'s registry-resolution checks already read.

The route admits two roles while the Tools screen keeps one. The route serves
the Tools screen and the studio inspector's plugin-config form alike. That form
turns a registered type's config schema into a form an author fills in. An
author refused the route falls back to raw JSON for every action config.

The response SHALL also carry a browser-consumable description of each
registered type's `configSchema`, for every type whose registry entry
declares one. A type with no declared `configSchema` SHALL still appear in
its type-name array, with no schema description alongside it.

#### Scenario: A developer reads the registry

- **WHEN** a developer holding `system:developer` requests `GET /registry`
- **THEN** the server responds 200 with `actionTypes`, `dataSourceTypes`
  and `assignmentStrategyTypes` reflecting its live registries. It includes
  each entry's config-schema description when declared.

#### Scenario: An author reads the registry

- **WHEN** an actor holding only `system:author` requests `GET /registry`
- **THEN** the server responds 200 with the same payload a developer receives

#### Scenario: The server denies an actor holding neither authoring role

- **WHEN** a credential that lacks both `system:developer` and `system:author`
  requests `GET /registry`
- **THEN** the server responds 403 and returns no registry data

#### Scenario: A type with no declared schema has no schema description

- **WHEN** a registered type declares no `configSchema`
- **THEN** `GET /registry` lists its type name with no schema description
  for that type

## ADDED Requirements

### Requirement: The Tools screen stays behind the developer role

The studio area's Tools screen SHALL need `system:developer`. An actor holding
only `system:author` SHALL see the explanatory state there rather than the
screen. The area navigation SHALL omit the Tools button for that actor.

The screen and the route it calls carry different gates on purpose. The screen
shows the running server's registry and a CEL scratchpad, which serve a
developer inspecting a deployment. The plugin-config form reads the same route
inside the editor, which serves an author. Gating the screen does not gate the
form.

#### Scenario: An author does not reach the Tools screen

- **WHEN** an actor holding only `system:author` navigates directly to the
  Tools screen
- **THEN** the shell shows an explanatory state naming the missing role

#### Scenario: An author still configures an action by form

- **WHEN** that same actor opens a step's action list in the editor
- **THEN** the plugin-config form renders from the config-schema descriptions
  `GET /registry` returned
