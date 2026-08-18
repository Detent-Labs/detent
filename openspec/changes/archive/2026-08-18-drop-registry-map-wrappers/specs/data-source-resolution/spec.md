## MODIFIED Requirements

### Requirement: A DataSourceRegistry resolves a data source's type to a handler

<!-- antislop: allow sentence-length -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
The engine SHALL provide a `DataSourceRegistry` (`src/engine/registry.ts`)
mirroring the existing action `Registry`: a `Map<string, DataSourceHandlerDef>`
keyed by `type`. `DataSourceHandlerDef` is `{ resolve: (ctx: DataSourceContext)
=> Promise<FieldOption[]>, configSchema?: z.ZodTypeAny }`. `DataSourceContext`
is `{ config: Record<string, unknown>, heldValues?: string[] }`. `heldValues`
carries the values the instance already holds for the field under resolution,
so a handler can return a value that is otherwise retired; a handler that has
no such notion ignores it.
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
