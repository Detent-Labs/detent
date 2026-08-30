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

<!-- antislop: allow sentence-length -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
The engine SHALL provide a `DataSourceRegistry` (`src/engine/registry.ts`)
mirroring the existing action `Registry`: a `Map<string, DataSourceHandlerDef>`
keyed by `type`. `DataSourceHandlerDef` is `{ resolve: (ctx: DataSourceContext)
=> Promise<FieldOption[]>, configSchema?: z.ZodTypeAny }`. `DataSourceContext`
is `{ config: Record<string, unknown>, heldValues?: string[], instance: { id:
InstanceId, processId: ProcessId, data: Record<string, Literal>, baseLocale:
LocaleCode } }`.
`heldValues` carries the values the instance already holds for the field under
resolution, so a handler can return a value that is otherwise retired; a
handler that has no such notion ignores it.
`instance` carries the reading instance, the one whose form or submission the
engine is resolving. A handler comparing against the reader's own values needs
`data`, a handler excluding the reader from its own result needs `id` and
`processId`, and a handler synthesizing a `LocalizedText` from a non-localized
value needs `baseLocale`. `"static"` and `"db.list"` ignore it.

Every `DataSourceContext` carries `instance`, never omitting it. A handler
needing the reader has no sane fallback without it, and every resolution runs
for exactly one instance.
`createDataSourceRegistry` SHALL construct a `DataSourceRegistry`, mirroring
the action registry's own factory. Registration and lookup use the
`DataSourceRegistry` `Map` directly. A caller registers a handler with
`reg.set(type, def)` and looks one up with `reg.get(type)`. `resolve` SHALL
be `async` regardless of whether a given handler's resolution is itself
synchronous, so a future I/O-backed handler type is a drop-in rather than an
interface change.

#### Scenario: A registered type resolves to its handler
- **WHEN** a caller calls `reg.get(type)` on a `DataSourceRegistry` after a
  prior `reg.set(type, def)` call
- **THEN** it returns that type's `DataSourceHandlerDef`

#### Scenario: An unregistered type resolves to nothing
- **WHEN** a caller calls `reg.get(type)` on a `DataSourceRegistry` for a
  type never set
- **THEN** it returns `undefined`

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: The context carries the reading instance
- **WHEN** a handler's `resolve` is called for a field of some instance
- **THEN** `ctx.instance` carries that instance's `id`, its `processId`, its
  `data`, and its process's `baseLocale`

### Requirement: A built-in "static" data source handler echoes a configured option list

The engine SHALL ship a built-in `"static"` data source handler, registered
by `createDefaultDataSourceRegistry` (`src/engine/host.ts`), whose
`configSchema` requires `{ options: FieldOption[] }` and whose `resolve`
returns exactly `ctx.config.options` unchanged. The handler SHALL ignore
`ctx.heldValues`: a static option list holds no notion of a retired value.
`"static"` is no longer the only data source type shipped; see the
`db-data-source-type` capability.

#### Scenario: The static handler echoes its configured options
- **WHEN** the `"static"` handler's `resolve` is called with `{ config: {
  options: [...] } }`
- **THEN** it returns exactly that `options` array

#### Scenario: The static handler ignores heldValues
- **WHEN** the `"static"` handler resolves with `heldValues` present
- **THEN** it returns exactly its configured `options`

### Requirement: A data-source-bound view field's options are resolved at runtime

<!-- antislop: allow sentence-length passive-voice -->
<!-- Paragraph carried from the main spec, including the dedup note in parentheses. -->
`resolveFields` (`src/runtime/api.ts`) SHALL accept a `registry:
DataSourceRegistry` parameter and, for each view field whose `FieldDef`
declares `dataSource`, resolve the referenced `DataSourceDef` from
`body.dataSources`, look up its handler in `registry` by `type`, call
`resolve({ config: def.config, heldValues, instance })`, and attach the
result. `heldValues` SHALL carry the values the instance holds for that field:
none when the field is unset, one for a `string` field, and the whole array
for a `list` field. `instance` SHALL carry the instance whose view or
submission is resolving, with its `id`, its `processId`, its current `data`,
and its process's `baseLocale`. Each view
field resolves through its own `resolve` call. Two
fields on the same step bound to the same data source and holding the same
values each trigger their own call; neither call's result is shared with the
other (`dedup-runtime-pagination-webhook-sink`: the per-call memoization this
requirement once described added 18 lines to dedupe a case `resolveFields`
does not hit in a hot loop, and was removed).

`instance.data` SHALL be the instance's committed data. A submission SHALL
resolve against the same data the view read resolved against. It SHALL NOT
resolve against the submitted payload merged over that data.

The renderer draws its option list before the participant submits anything, so
it resolves against committed data. Membership validation must check the list
the participant chose from. Resolving a submission against a merged payload
would check a different list.

A handler comparing against a reading-instance field therefore reads the value
that field held at step entry.

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

#### Scenario: Two fields sharing one data source each resolve it independently
- **WHEN** two view fields on the same step both declare the same
  `dataSource`, whether or not they hold the same values
- **THEN** the handler's `resolve` is invoked once per field, and each
  field's resolved `options` reflects its own call's result

#### Scenario: A field with neither options nor dataSource has no resolved options
- **WHEN** a view field's `FieldDef` declares neither `options` nor
  `dataSource`
- **THEN** the resolved field's `options` is `undefined`

#### Scenario: A retired value the instance holds stays submittable
- **WHEN** an instance holds a value that its data source no longer offers,
  and the participant submits the step without changing that field
- **THEN** the resolved options carry that value, and submission validation
  accepts it

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A submission resolves against the committed data
- **WHEN** a participant submits a step filling field G, and a data source
  compares against G
- **THEN** the resolution reads the value G held when the step was entered,
  not the submitted value

<!-- Scenario bullets stay verbatim: shortening the WHEN would drop its second precondition. -->
<!-- antislop: allow sentence-length -->
#### Scenario: The rendered list and the validated list agree
- **WHEN** a participant submits a value picked from the list the step's view
  read offered, and no other instance changed in between
- **THEN** submission validation resolves the same list, and accepts that
  value

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

### Requirement: A data source that reads the database takes it from the context

A data source needing its own database access SHALL take that handle from the
resolution context. It SHALL NOT take one bound at registry construction.

Every context SHALL carry the handle. It is not optional, unlike the frozen
actor ids beside it. An absent handle has no sane fallback once one process
serves many tenants. It would quietly read whichever database built the
registry.

`db.list` reads the `data_lists` tables. Bound at construction it would offer
one tenant's option values to every tenant. That is the cross-tenant read this
model exists to prevent.

`instance.query` reads another process's instances. The same rule binds it,
for the same reason. It reaches those instances through the Runtime API
Layer's instance data read, and passes that read the context's own handle.

The `static` type reads no database and SHALL ignore the handle.

#### Scenario: A list resolves in the instance's own tenant

- **WHEN** a field in tenant `acme` resolves a `db.list` source
- **THEN** the options come from `acme`'s `data_lists` tables

#### Scenario: One registry serves two tenants

- **WHEN** one registry resolves the same list key for two tenants
- **THEN** each answer carries that tenant's own values

#### Scenario: The static type keeps its behaviour

- **WHEN** a field resolves a `static` source
- **THEN** it answers its configured options, as it does today

#### Scenario: An instance query resolves in the instance's own tenant

- **WHEN** a field in tenant `acme` resolves an `instance.query` source
- **THEN** the options come from `acme`'s own instances

### Requirement: A resolved option carries its attributes to the view

`ResolvedViewField.options` SHALL carry each option's `attributes` unchanged
from the handler that produced them. The resolution layer SHALL neither add an
entry nor drop one.

`InstanceView` SHALL therefore expose them, so a renderer shows what a row
carries without a second request.

Attributes SHALL take no part in option membership validation. A submission is
valid when its value names an offered option, whatever the attributes hold.

Attributes SHALL reach no CEL context. A data source stays invisible to CEL,
and `docs/decisions.md` keeps that deferral. An attribute becomes readable only
after the write-back lands it in an ordinary field. CEL then reads it as
`data.<key>`, like any other value.

#### Scenario: The view carries an option's attributes
- **WHEN** an actor reads the view of a step whose field binds a
  column-declaring list
- **THEN** each option of that field carries its attributes

#### Scenario: An attribute does not widen membership
- **WHEN** an actor submits a value that names no offered option
- **THEN** the submission fails with `invalid-option`, whatever any attribute
  holds

#### Scenario: A guard cannot read a data source
- **WHEN** an author writes a guard naming a data source
- **THEN** the publish fails, exactly as it does today
