<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo (see
     admin-app/spec.md). This new file follows the same convention for
     consistency with every sibling spec, rather than reading differently
     from the rest of openspec/specs/. -->

# studio-tools Specification

## Purpose

A read-only Tools screen on the studio area of `packages/web`: a view of the running
server's three plugin registries (registered action-handler, data-source and
assignment-strategy type names) and a static CEL scratchpad that parses and
type-checks an ad-hoc expression against a chosen field catalog. Neither
writes anything. See `studio-app` for the shell navigation that reaches it,
and `authorization` for the `system:developer` role every route here
enforces.
## Requirements
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
