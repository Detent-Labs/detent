## Why

A field's option list can come from a static array or from an operator-owned
data list. Neither answers the case an owner asked for on 2026-08-25. A
Laptop Inventory process holds one instance per device. The step that
instance stands on says where the device is. An onboarding step should offer
the devices whose own instance stands on the shelf step.

`docs/decisions.md` settled that design under "Aggregated data source: a
field's options read from other instances". The read half already shipped.
`queryInstances` landed 2026-08-27 as `instance-query-core` and filters
instances by process, step, status and field values. Nothing binds it to a
field, so an author still cannot reach it.

## What Changes

- A third data source type, `instance.query`, joins `static` and `db.list`
  in the `DataSourceRegistry`. It is a leaf handler. It reads, and it
  composes nothing.
- Its `resolve` substitutes the reading instance's own field values into the
  configured comparisons, then calls `queryInstances` for the rest. It issues
  no SQL of its own against `instances`.
- `DataSourceContext` gains the reading instance, `{ id, processId, data,
  baseLocale }`. The comparisons need `data` for their right side, and the
  self-exclusion rule needs `id` and `processId` too. The handler wraps a
  resolved label as a `LocalizedText`, using `baseLocale` as the key, since
  `FieldOption.label` needs that shape. Its own `instance.data` values stay
  plain `Literal`s, never localized text already. The `packages/form-ui`
  package stays untouched: its `FieldForm` deliberately takes no separate
  base-locale fallback, so the wrapping happens here.
- The instance data read gains an `instanceIds` filter. Re-resolving a
  reference an instance already holds needs it. The read offered no way to
  select an explicit set of ids.
- The publish entry point takes the acting actor as an optional argument, so
  the read-grant check below has one. It takes none today.
- A query whose target is the reading instance's own process excludes that
  instance, through the `excludeInstanceId` filter `queryInstances` already
  carries.
- An option's `value` is the source instance's id. Its `label` and its
  `attributes` are fields of that instance, which the shipped
  `FieldDef.columnMapping` path then writes into the reading instance's own
  catalog.
- Publish-time validation resolves every field and step reference. It resolves
  them against the union of the catalogs of the target process's versions
  holding live instances. It reports rather than rejects, and it names the
  versions carrying each reference.
- Publish-time validation checks that every compared field id holds a scalar
  in the target catalog. `instance-data-query`'s spec defers exactly this
  check to its consumer, and this change is that consumer.
- Publish-time validation checks that every `valueFromField` resolves to a
  scalar field of the reading process's own catalog. This is the same
  in-process shape `checkGroupReference`/`checkIdResolution` already check,
  for a different reference kind each.
- Publish-time validation checks the author's process-scoped `read` grant on
  the target process.
- The studio gains a hand-written config form for the new type. The generator
  in `config-descriptor.ts` covers a flat subset. A list of field comparisons
  nests one level deeper.

## Capabilities

### New Capabilities
- `instance-query-data-source`: the `instance.query` data source type. Its
  config shape and its resolution through `queryInstances`. Its handling of a
  held reference, and its bound on the returned option count. Its treatment
  of a redacted source instance.

### Modified Capabilities
- `data-source-resolution`: `DataSourceContext` gains the reading instance
  `{ id, processId, data, baseLocale }`. Today the context carries `config`,
  `heldValues` and the database handle alone. No handler can see whose form is
  resolving.
- `cross-process-validation`: publish gains a fourth cross-process check,
  covering an `instance.query` data source's process, step and field
  references. This check reports a finding where the existing three reject,
  because the instance population keeps moving after publish reads it.
- `studio-plugin-config-form`: the config form for a plugin whose schema
  nests an array of objects. Today such a property falls back to the raw JSON
  textarea. This capability already owns the data-source position's type
  picker and generated form, so the new type's form belongs here.
- `instance-data-query`: the read's `currentStepId` filter accepts a set of
  step ids, not one. The settled design names a set, and the filter carries a
  single id today. `status` beside it is already a list. The read also gains
  an `instanceIds` filter, which the held-reference path needs.
- `definition-store`: `publishBody` returns the published version together
  with a list of publish findings. It returns the version alone today, so a
  check that reports rather than rejects has nowhere to put its result.

## Impact

- `src/engine/registry.ts`: `DataSourceContext` gains a member.
- `src/engine/host.ts`: `createDefaultDataSourceRegistry` registers a third
  type. The file gains that type's config schema and its option bound beside
  the two it already holds.
- `DataSourceContext`, and every call site building one. `resolveFields`
  (`src/runtime/api.ts`) is the main one, reached from `getInstanceView`,
  `submitAndTransition` and `createProcessInstance`.
- A new handler module beside the existing data source handlers.
- `queryInstances` (`src/runtime/api.ts`) gains a caller. Its filter's
  `currentStepId` member widens to accept a set, and the filter gains an
  `instanceIds` member. The shared predicate builder `buildInstanceWhere`
  carries both, so `listInstances` inherits them.
  <!-- "parameter type" names buildInstanceWhere's own TS argument type, a different concept from a FieldOption; not a synonym for "option". -->
  <!-- antislop: allow synonym-rotation -->
  Its own parameter type, `InstanceWhereFilter`, widens independently of
  `InstanceListFilter` to carry them (see design.md).
- Publish validation (`src/validate.ts`, `src/engine/registry-check.ts`) and
  the definition store's `publishBody`. Its return type widens to carry
  findings, as an intersection, so no existing caller changes. It also gains a
  trailing optional actor argument, which is additive for the same reason.
- `src/http/routes.ts` and `src/http/studio-routes.ts`: each publish route
  passes the actor and carries `findings` in its response body. Neither
  response spreads the publish result today, so both pick the key explicitly.
- `src/auth/authorize.ts`'s `read` permission gains a publish-time caller.
- `packages/web/src/areas/studio/panels/DataSourcesPanel.tsx`, which already
  carves `db.list`'s own key out of the generated form for a dedicated
  control. The engine module `src/engine/config-descriptor.ts` stays
  unchanged, and the studio reads its output over `GET /registry`.
- `docs/authoring-guide.md`, `docs/current-state.md`, `docs/decisions.md`, and
  a sweep of `examples/`.
- The definition contract stays unchanged, confirmed during design. A data
  source is a `{ type, config }` envelope that the core does not interpret. A
  new type is therefore a registry entry with its own `configSchema`. Nor does
  `columnMapping` need anything: the contract binds it to any data source
  rather than to `db.list`. It already anticipates this case in prose, naming
  a mapping that copies "an attribute from another process's instance". This
  change writes no `definition-contract` delta.

## Out of scope

- **The transition action.** Nothing today moves the laptop's own instance
  off the shelf step when a participant picks it. Without one the option list
  never shrinks. `docs/decisions.md` leaves the packaging of that action
  undecided and its necessity settled. This change does not build it, and it
  stays the immediate follow-up.
- No raw SQL against `instances` from any authoring surface.
- No CEL over foreign instances. The standing decision keeping CEL
  data-source-blind is not reopened.
- No set subtraction, and no `exclude` mode. A second design pass on
  2026-08-25 replaced that shape deliberately.
- No change to `packages/form-ui`. Its `FieldForm`/`FieldInput` deliberately
  take `locale` alone with no separate base-locale fallback (`form-ui`'s own
  spec). The resolved label is a single-locale `LocalizedText` by
  construction instead; see design.md.
- No composite field value. `FieldOption.value` stays a scalar, and the
  pointer stays a separate field from its copies.
- No per-instance visibility. An actor granted read on the target process
  sees values from every instance of it through this data source.
- No per-field export lists, and no cross-process release lists.
