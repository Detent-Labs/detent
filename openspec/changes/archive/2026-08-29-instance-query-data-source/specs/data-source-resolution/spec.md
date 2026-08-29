## MODIFIED Requirements

### Requirement: A DataSourceRegistry resolves a data source's type to a handler

<!-- antislop: allow sentence-length -->
<!-- Carried from the main spec; the linter merges a sentence opening with a code span into the one before it, doubling the count. -->
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

<!-- antislop: allow sentence-length -->
<!-- Carried from the main spec; same code-span merge as the block above. -->
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

<!-- Requirement header carried verbatim from the main spec; the archive step matches it by exact text. -->
<!-- antislop: allow passive-voice -->
### Requirement: A data-source-bound view field's options are resolved at runtime

<!-- antislop: allow sentence-length passive-voice -->
<!-- Paragraph carried from the main spec, including the dedup note in parentheses. -->
`resolveFields` (`src/runtime/api.ts`) SHALL accept a `registry:
DataSourceRegistry` parameter and, for each view field whose `FieldDef`
declares `dataSource`, resolve the referenced `DataSourceDef` from
`body.dataSources`, look up its handler in `registry` by `type`, call
`resolve({ config: def.config, heldValues, instance })`, and attach the
result. `heldValues` SHALL carry the values the instance holds for that field:
none when the field is unset, one for a `select`, and the whole array for a
`multiselect`. `instance` SHALL carry the instance whose view or submission is
resolving, with its `id`, its `processId`, its current `data`, and its
process's `baseLocale`. Each view
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

<!-- antislop: allow sentence-length -->
<!-- Paragraph carried from the main spec. -->
`ResolvedViewField` SHALL gain an `options?: FieldOption[]` property,
populated from `field.options` when the field declares static options
unchanged, or from the resolved data-source result when the field declares
`dataSource`. This is the single field downstream code (view rendering,
submission validation) SHALL read options from, rather than reading
`FieldDef.options` directly.

<!-- Scenario header carried verbatim from the main spec; the archive step matches it by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A static-options field's resolved options are unchanged
- **WHEN** a view field's `FieldDef` declares `options` (not `dataSource`)
- **THEN** the resolved field's `options` equals that static `options` array

#### Scenario: A dataSource-bound field's resolved options come from its handler
- **WHEN** a view field's `FieldDef` declares `dataSource` referencing a
  `"static"` data source with configured options
- **THEN** the resolved field's `options` equals the result of that data
  source's `resolve` call

<!-- Scenario carried verbatim from the main spec; its bullets match by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: Two fields sharing one data source each resolve it independently
- **WHEN** two view fields on the same step both declare the same
  `dataSource`, whether or not they hold the same values
- **THEN** the handler's `resolve` is invoked once per field, and each
  field's resolved `options` reflects its own call's result

#### Scenario: A field with neither options nor dataSource has no resolved options
- **WHEN** a view field's `FieldDef` declares neither `options` nor
  `dataSource`
- **THEN** the resolved field's `options` is `undefined`

<!-- Scenario carried verbatim from the main spec; its bullets match by exact text. -->
<!-- antislop: allow sentence-length -->
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
