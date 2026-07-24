## Why

`FieldDef.dataSource` has existed in the schema and the editor's authoring UI
since the v1 contract, but nothing resolves it at runtime: a `dataSource`-bound
field accepts any submitted value with zero server-side membership
validation, `getInstanceView` never hands a UI a resolved option list, and
the editor Player falls back to a free-text input with a literal "not yet
supported" note. `CLAUDE.md`'s "Decided, not yet built" section calls this
out explicitly as the last check/eval scope gap. This change builds the
missing runtime resolution, following the registry + publish-time-validation
pattern already established for actions.

## What Changes

- Add a `DataSourceRegistry` (`src/engine/registry.ts`) mirroring the action
  `Registry`: `{resolve, configSchema?}` handler defs keyed by `type`. Ship
  one built-in `"static"` handler (`createDefaultDataSourceRegistry` in
  `src/engine/host.ts`) that echoes a configured `FieldOption[]` list.
- Add a structural invariant to `definition.ts`: every `FieldDef.dataSource`
  must resolve to an id present in `body.dataSources` (publish-time Zod
  refinement).
- Add `checkDataSourceRegistry(body, dataSourceRegistry)`
  (`src/engine/registry-check.ts`), resolving each data source's `type`
  against the registry and validating `config` against `configSchema` when
  declared — an unresolved type or schema violation is a publish error
  (`DataSourceRegistryValidationError`), never a runtime one. Wired into
  `publishBody` in the same slot `checkActionRegistry`/
  `checkAssignmentRegistry` already occupy.
- `resolveFields` (`src/runtime/api.ts`) becomes `async`, gains a
  `registry: DataSourceRegistry` parameter, and resolves each
  `dataSource`-bound view field's options (memoized per `DataSourceId` within
  one call). `ResolvedViewField` gains `options?: FieldOption[]`, populated
  from either static `field.options` or the resolved data source — the
  single place downstream code reads options from.
- `optionValuesValid` validates against the resolved `options` instead of
  reading `field.options` directly, so submission validation now enforces
  membership for `dataSource`-bound fields.
- `createProcessInstance`, `getInstanceView`, `submitAndTransition`
  (`src/runtime/api.ts`), `createServer`/`startHttpServer`
  (`src/http/server.ts`, `routes.ts`), and `publishBody`
  (`src/engine/definitions.ts`) each gain a new required
  `dataSourceRegistry`/`registry` parameter, threaded down to `resolveFields`.
- Editor Player (`packages/editor/src/player/`): `ResolvedViewField` type
  gains `options?: FieldOption[]`; `FieldInput.tsx` drops the forced
  free-text fallback and "not yet supported" note, rendering `select`/
  `multiselect` from `field.options` unconditionally.

**BREAKING**: `publishBody`, `createProcessInstance`, `getInstanceView`,
`submitAndTransition`, `createServer`, and `startHttpServer` all gain a new
required parameter — every call site (host wiring, HTTP server bootstrap,
every test touching these functions) must be updated.

Out of scope (see design.md): CEL-readable data-source results, a second
(dynamic/I/O-backed) data-source type, cross-call caching, and dynamic
resolver context (`instance`/`actor`).

## Capabilities

### New Capabilities
- `data-source-resolution`: the `DataSourceRegistry`, the built-in `"static"`
  handler, and runtime option resolution wired into view rendering and
  submission validation.
- `data-source-registry-validation`: publish-time validation that every
  `FieldDef.dataSource` resolves to a declared data source and that its
  `type`/`config` resolve against the `DataSourceRegistry`.

### Modified Capabilities
- `definition-contract`: adds the structural invariant that every
  `FieldDef.dataSource` id must resolve within `body.dataSources`.
- `runtime-api`: `resolveFields`/`ResolvedViewField`/`optionValuesValid` and
  the three Runtime API Layer functions gain data-source-aware option
  resolution and a new required `registry` parameter.
- `http-wrapper`: `createServer`/`startHttpServer` thread a new required
  `dataSourceRegistry` parameter into the Runtime API calls.
- `editor-player`: `FieldInput.tsx` renders resolved options for
  `dataSource`-bound fields instead of falling back to free text.

## Impact

- `src/schema/definition.ts` (new structural invariant), `src/engine/registry.ts`,
  `src/engine/registry-check.ts`, `src/engine/host.ts`, `src/engine/definitions.ts`
  (new `publishBody` parameter), `src/runtime/api.ts` (async `resolveFields`,
  `ResolvedViewField`, `optionValuesValid`, three public functions),
  `src/http/server.ts`, `src/http/routes.ts`,
  `packages/editor/src/player/types.ts`, `packages/editor/src/player/FieldInput.tsx`.
- Every test exercising `publishBody`, the three Runtime API Layer functions,
  or the HTTP server bootstrap needs a `registry`/`dataSourceRegistry` argument.
- No stored-data or wire-shape migration: additive schema change, no field
  shape changes, no data migration.
