## Context

`FieldDef.dataSource` (a `DataSourceId` pointing at a `{type, config}` plugin
envelope in `ProcessBody.dataSources`, mutually exclusive with static
`options`) has existed in the schema and the editor's authoring UI
(`DataSourcesPanel.tsx`) since the v1 contract, but nothing resolves it at
runtime. `CLAUDE.md`'s "Decided, not yet built" section calls this out
explicitly: "the `field.dataSource` options-binding declaration still
publishes but its runtime option resolution is likewise unbuilt (a visible
presentation gap, not a silent FSM park)." Concretely, today:

- `src/runtime/api.ts::optionValuesValid` only checks static `field.options` —
  a `dataSource`-bound field accepts *any* submitted value with zero
  server-side membership validation.
- `ResolvedViewField` never carries resolved options for a `dataSource`
  field, so `getInstanceView` has nothing to hand a UI.
- The editor Player's `FieldInput.tsx` falls back to a free-text input for
  any `dataSource`-bound field, with a literal "data source resolution not
  yet supported — enter a raw value" note.
- No publish-time check confirms a `field.dataSource` id actually resolves to
  an entry in `body.dataSources` — an authoring bug (typo'd id, deleted data
  source) is currently silently accepted.

This change builds runtime resolution of `field.dataSource` into an actual
`FieldOption[]` list, consumed by both view rendering and submission
validation, following the same registry + publish-time-validation pattern
already established for actions (`src/engine/registry.ts`,
`registry-check.ts`) and reduced-to-direct-check pattern for assignment
strategies.

## Goals / Non-Goals

**Goals:**
- Resolve `field.dataSource` into a real `FieldOption[]` list at runtime,
  consumed by both `getInstanceView` (display) and `submitAndTransition`/
  `createProcessInstance` (membership validation).
- Add a publish-time structural invariant that every `FieldDef.dataSource`
  resolves to a declared id, and a registry check that its `type`/`config`
  resolve against a `DataSourceRegistry` — closing both the silent-acceptance
  authoring gap and the silent-acceptance runtime gap.
- Ship a `DataSourceRegistry` mechanism built to hold multiple types, with
  one built-in `"static"` handler.

**Non-Goals:**
- **CEL-readable data-source results.** `src/cel/check.ts` deliberately
  registers a data source at no site (guards/output/transforms) — a CEL
  reference to one is a publish error today. That is a separate, more
  consequential decision (documented in `check.ts`: an unresolvable reference
  there could only park a wait-state forever or throw mid-delivery) and stays
  untouched by this change. This change is about resolving options for
  *display and validation*, not adding a new CEL namespace.
- **A second data-source type in v1.** The registry mechanism is built to
  hold multiple types (mirroring the action registry), but only `"static"`
  ships now. A live/dynamic type (e.g. an HTTP-backed data source) is
  deferred until a concrete need exists — its timeout/cache/error semantics
  are open questions not worth deciding speculatively (the same reasoning
  that kept the generic `http.request` *action* handler config-only with no
  dynamic instance data).
- **Per-request or cross-instance caching of resolved options.** Resolution
  is memoized only within a single `resolveFields` call (fields on the same
  step sharing a data source resolve it once). No caching across
  `getInstanceView` calls or across instances — irrelevant for a pure
  config-echo `"static"` handler; revisit only when a real I/O-backed type
  makes redundant resolution costly.
- **Dynamic context in the resolver (`instance`/`actor`).** The resolver
  context is `{ config }` only. Extending it later (e.g. so an HTTP-backed
  type could filter by current form data) is additive and non-breaking, so
  it isn't designed now.

## Decisions

### Registry shape

New sibling to the existing action `Registry` in `src/engine/registry.ts` —
deliberately a plain parallel structure, not a shared generic abstraction
(the action registry wasn't generic when it was the only one; forcing a
shared abstraction over two three-line `Map` wrappers buys nothing):

```ts
export interface DataSourceContext { config: Record<string, unknown> }
export interface DataSourceHandlerDef {
  resolve: (ctx: DataSourceContext) => Promise<FieldOption[]>;
  configSchema?: z.ZodTypeAny;
}
export type DataSourceRegistry = Map<string, DataSourceHandlerDef>;
export function createDataSourceRegistry(): DataSourceRegistry { return new Map(); }
export function registerDataSource(reg: DataSourceRegistry, type: string, def: DataSourceHandlerDef): void { reg.set(type, def); }
export function resolveDataSource(reg: DataSourceRegistry, type: string): DataSourceHandlerDef | undefined { return reg.get(type); }
```

Built-in `"static"` handler in `src/engine/host.ts::createDefaultDataSourceRegistry`
(mirroring `createDefaultRegistry`):

```ts
const staticDataSourceConfigSchema = z.object({ options: z.array(fieldOption) });
registerDataSource(reg, "static", {
  configSchema: staticDataSourceConfigSchema,
  resolve: async (ctx) => (ctx.config as { options: FieldOption[] }).options,
});
```

`resolve` is `async` even though `"static"` is pure config-echo — matches the
action handler contract so a future I/O-backed type is a drop-in, not an
interface change. The `"static"` type gives authors a *reusable, named*
option list shared across multiple fields (vs. re-authoring the same list on
every field via `FieldDef.options`), and is the extension point a future
dynamic type plugs into the same way `http.request` plugged into the action
registry.

### Publish-time validation

Two additions, both in the same "in-process, before CEL" slot
`checkActionRegistry`/`checkAssignmentRegistry` already occupy in
`definitions.ts::publishBody`:

1. **Structural invariant in `definition.ts`**: every `FieldDef.dataSource`
   must resolve to an id present in `body.dataSources` — added to the same
   `superRefine` block that already checks "duplicate data source ids/keys".
   This closes a real gap that exists independent of this feature.
2. **`checkDataSourceRegistry(body, dataSourceRegistry)`** in
   `registry-check.ts` — simpler than `checkActionRegistry` since there is
   one collection point (`body.dataSources`), not five action positions:
   resolves each data source's `type` against the registry, and when
   resolved, validates `config` against `configSchema`. An unresolved type or
   a schema-violating config is a publish error
   (`DataSourceRegistryValidationError`, same "every located issue" shape as
   `RegistryValidationError`), never a runtime one.

`publishBody` gains a new required `dataSourceRegistry: DataSourceRegistry`
parameter (alongside the existing `registry: Registry` for actions) — touches
every `publishBody` call site (`host.ts`, `definitions.test.ts`, and any
other publisher).

Editor-side live validation cannot run `checkDataSourceRegistry` (no real
registry instance available client-side) — same "not checked" carve-out the
action registry check and cross-process validation already have there. No
new editor-side behavior to design.

### Runtime resolution & consumer wiring

**`src/runtime/api.ts`:**

- `resolveFields` becomes `async` and gains a `registry: DataSourceRegistry`
  parameter. For each view field carrying a `dataSource`, it resolves the
  `DataSourceDef` from `body.dataSources`, looks up the handler, calls
  `resolve({ config: def.config })`, and attaches the result. Resolution is
  memoized by `DataSourceId` within one call.
- `ResolvedViewField` gains `options?: FieldOption[]` — populated from either
  `field.options` (static, unchanged) or the resolved data-source result.
  This becomes the single place downstream code reads options from, instead
  of reading `field.options` directly.
- `optionValuesValid` takes the resolved `options` instead of reading
  `field.options` directly, so submission validation now actually enforces
  membership for `dataSource`-bound fields (closing the silent-acceptance gap
  described in "Context").
- `createProcessInstance`, `getInstanceView`, and `submitAndTransition` each
  gain a new required `registry: DataSourceRegistry` parameter, threaded down
  into `resolveFields`/`validateSubmissionData`.
- If a resolver lookup fails at runtime despite passing publish-time
  validation (a registry mismatch between the publishing caller and the
  runtime caller) — a plain `throw new Error(...)`, matching the project's
  existing "should never happen" canary style (e.g. the `definitionHash` pin
  mismatch), not a typed `SubmissionValidationError`.

**HTTP layer (`src/http/server.ts`, `routes.ts`):** `createServer` and
`startHttpServer` gain a `dataSourceRegistry` parameter, threaded into the
five `handleX` functions, which pass it into the Runtime API calls.

**Editor Player (`packages/editor/src/player/`):**

- `types.ts::ResolvedViewField` gains `options?: FieldOption[]` (mirrors the
  wire shape; `InstanceView` is JSON-serialized as-is, so no HTTP-layer
  mapping change is needed beyond the type).
- `FieldInput.tsx`: drop the `usesDataSource` forced free-text fallback and
  the "data source resolution not yet supported" note. `select`/`multiselect`
  render from `field.options` (now populated for both static and
  data-source-backed fields) unconditionally.

## Risks / Trade-offs

- **[Trade-off] Signature churn.** `publishBody`, `createProcessInstance`,
  `getInstanceView`, `submitAndTransition`, `createServer`, and
  `startHttpServer` all gain a new required parameter. Every call site (host
  wiring, HTTP server bootstrap, and every test touching these functions)
  needs updating. Accepted as the explicit, discoverable alternative to an
  implicit/global registry — matches how the action `Registry` is already
  threaded into `publishBody`/`startEngine`.
- **[Trade-off] No cross-call caching.** Resolution happens fresh on every
  `getInstanceView`/`submitAndTransition` call (memoized only within that one
  call). Fine for `"static"`; would need revisiting if a real I/O-backed type
  is added and redundant resolution becomes a measurable cost.
- **[Trade-off] `"static"` is presentationally identical to `FieldDef.options`.**
  The only functional difference in v1 is reuse (one data source, many
  fields) and being the seam a future dynamic type plugs into. If that reuse
  case never materializes in practice, `"static"` data sources add a level of
  indirection over just using `field.options` directly — acceptable since the
  registry/validation machinery is the actual deliverable, not the `"static"`
  handler itself.

## Migration Plan

Additive at the schema level (one new structural invariant only — no field
shape changes). The functional change is threading a new required
`DataSourceRegistry` parameter through `publishBody`, the three Runtime API
Layer functions, and the HTTP server entry points, plus updating
`optionValuesValid`'s signature and `FieldInput.tsx`'s rendering branch.
Rollback is reverting the touched files; no data migration, no stored-state
shape change (an existing published body with a `dataSource` field is valid
today and stays valid — the new structural invariant only rejects an
*unresolvable* `dataSource` id, which no currently-published body should
have unless it was already broken).

## Open Questions

None outstanding — scope (options-resolution only, no CEL surface), the
v1 type set (`"static"` only, registry ready for more), and the registry
threading approach (explicit required parameters) all converged during
design review.
