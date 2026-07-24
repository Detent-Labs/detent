# data-source-resolution

## Purpose

Runtime resolution of `FieldDef.dataSource` into an actual `FieldOption[]`
list, consumed by both view rendering (`getInstanceView`) and submission
validation (`submitAndTransition`/`createProcessInstance`). Before this
capability, a `dataSource`-bound field accepted any submitted value with no
server-side membership validation and `getInstanceView` had no resolved
options to hand a UI. A `DataSourceRegistry` (`src/engine/registry.ts`)
mirrors the action `Registry`, with one built-in `"static"` handler shipped
in v1. Publish-time validation of the registry itself (type/config
resolution) is the `data-source-registry-validation` capability's concern,
not this one's. CEL-readable data-source results are explicitly out of
scope — a CEL reference to a data source remains a publish error.

## Requirements

### Requirement: A DataSourceRegistry resolves a data source's type to a handler

The engine SHALL provide a `DataSourceRegistry` (`src/engine/registry.ts`)
mirroring the existing action `Registry`: a `Map<string, DataSourceHandlerDef>`
keyed by `type`, where `DataSourceHandlerDef` is `{ resolve: (ctx:
DataSourceContext) => Promise<FieldOption[]>, configSchema?: z.ZodTypeAny }`
and `DataSourceContext` is `{ config: Record<string, unknown> }`.
`createDataSourceRegistry`, `registerDataSource`, and `resolveDataSource`
SHALL provide construction, registration, and lookup, mirroring the action
registry's own three functions. `resolve` SHALL be `async` regardless of
whether a given handler's resolution is itself synchronous, so a future
I/O-backed handler type is a drop-in rather than an interface change.

#### Scenario: A registered type resolves to its handler
- **WHEN** `resolveDataSource` is called with a type previously registered
  via `registerDataSource`
- **THEN** it returns that type's `DataSourceHandlerDef`

#### Scenario: An unregistered type resolves to nothing
- **WHEN** `resolveDataSource` is called with a type never registered
- **THEN** it returns `undefined`

### Requirement: A built-in "static" data source handler echoes a configured option list

The engine SHALL ship a built-in `"static"` data source handler, registered
by `createDefaultDataSourceRegistry` (`src/engine/host.ts`), whose
`configSchema` requires `{ options: FieldOption[] }` and whose `resolve`
returns exactly `ctx.config.options` unchanged. This is the only data source
type shipped in v1; the registry mechanism accepts more without requiring a
built-in for each.

#### Scenario: The static handler echoes its configured options
- **WHEN** the `"static"` handler's `resolve` is called with `{ config: {
  options: [...] } }`
- **THEN** it returns exactly that `options` array

### Requirement: A data-source-bound view field's options are resolved at runtime

`resolveFields` (`src/runtime/api.ts`) SHALL accept a `registry:
DataSourceRegistry` parameter and, for each view field whose `FieldDef`
declares `dataSource`, resolve the referenced `DataSourceDef` from
`body.dataSources`, look up its handler in `registry` by `type`, call
`resolve({ config: def.config })`, and attach the result. Resolution SHALL be
memoized by `DataSourceId` within one `resolveFields` call, so multiple
fields on the same step bound to the same data source resolve it once.

`ResolvedViewField` SHALL gain an `options?: FieldOption[]` property,
populated from `field.options` when the field declares static options
unchanged, or from the resolved data-source result when the field declares
`dataSource`. This is the single field downstream code (view rendering,
submission validation) SHALL read options from, rather than reading
`FieldDef.options` directly.

#### Scenario: A static-options field's resolved options are unchanged
- **WHEN** a view field's `FieldDef` declares `options` (not `dataSource`)
- **THEN** the resolved field's `options` equals that static `options` array

#### Scenario: A dataSource-bound field's resolved options come from its handler
- **WHEN** a view field's `FieldDef` declares `dataSource` referencing a
  `"static"` data source with configured options
- **THEN** the resolved field's `options` equals the result of that data
  source's `resolve` call

#### Scenario: Two fields sharing one data source resolve it once
- **WHEN** two view fields on the same step both declare the same
  `dataSource`
- **THEN** the handler's `resolve` is invoked exactly once for that
  `resolveFields` call, and both fields' resolved `options` reflect its
  result

#### Scenario: A field with neither options nor dataSource has no resolved options
- **WHEN** a view field's `FieldDef` declares neither `options` nor
  `dataSource`
- **THEN** the resolved field's `options` is `undefined`

### Requirement: Submission validation enforces membership against resolved options, including data-source-bound fields

`optionValuesValid` SHALL validate a submitted value against the field's
resolved `options` (as populated by `resolveFields`, covering both static and
data-source-bound fields) rather than reading `FieldDef.options` directly, so
a `dataSource`-bound field's submission is now checked for membership instead
of accepting any value.

#### Scenario: A value within a data-source-resolved option list passes
- **WHEN** a submitted value for a `dataSource`-bound field equals one of its
  resolved options' `value`
- **THEN** the submission passes option-membership validation for that field

#### Scenario: A value outside a data-source-resolved option list is rejected
- **WHEN** a submitted value for a `dataSource`-bound field does not equal
  any of its resolved options' `value`
- **THEN** the result carries an `invalid-option` issue for that field,
  matching the existing behavior for a static-`options` field

### Requirement: A runtime registry-lookup failure after passing publish-time validation is a canary error

If `resolveFields` looks up a data source's `type` in the injected `registry`
and finds no handler, despite the body having passed publish-time
`data-source-registry-validation`, the engine SHALL throw a plain `Error`
identifying the unresolved type — matching the project's existing
"should-never-happen" canary style (e.g. a `definitionHash` pin mismatch),
not a typed `SubmissionValidationError`. This can only occur when the
registry instance passed to a runtime caller differs from the one the body
was published against.

#### Scenario: A registry mismatch at runtime throws a canary error
- **WHEN** `resolveFields` is called with a `registry` that has no handler
  registered for a data source `type` the body's publish-time validation
  previously confirmed was registered
- **THEN** it throws a plain `Error` naming the unresolved type, not
  `SubmissionValidationError`
