## Why

Every `{ type, config }` position in the studio area (actions, data sources,
assignment strategies, a custom field type) goes through
`panels/shared/PluginEnvelopeEditor.tsx` today. That editor is a free-text
`type` input beside a raw JSON textarea, for all four positions alike. An
author has to know the exact type string and the exact config shape by
heart. A typo in either surfaces only at publish, as a
`RegistryValidationError`, an `AssignmentRegistryValidationError`, or a
`DataSourceRegistryValidationError`.

Three of those four positions have a registry behind them: actions, data
sources, and assignment strategies. The fourth, a custom field type, has
none. The `studio-tools` spec already records why: field types are the
schema's fixed `BaseFieldType` union, not a registry lookup. No
`configSchema` exists anywhere for that fourth position. This change
covers the three registry-backed positions only.

The information needed to prevent that already exists at publish time. Each
registry entry declares a `configSchema`. That is the same Zod schema the
publish-time check parses `config` against. Nothing serves it to the browser
yet. This is the cheapest of the four gaps ROADMAP.md stage 27 names for
no-code and low-code process authoring. It is also the only one with no open
design question of its own.

## What Changes

- Widen `GET /registry` to return each registered type's `configSchema`
  beside its type name, as a browser-consumable description. This covers
  the action, data source and assignment-strategy registries alike. Today
  the route returns only three flat type-name arrays.
- Decide the one design question this unlocks everything else. How does a
  Zod `configSchema` reach the browser? One option is a server-side JSON
  Schema conversion of the Zod schema. The other is a hand-written
  descriptor shipped beside each registry entry.
- Replace `PluginEnvelopeEditor.tsx`'s free-text `type` input with a type
  picker populated from the widened `GET /registry` response. Generate a
  form from the selected type's schema description. Show per-field
  validation errors inline, before publish rather than after.
- Keep the raw JSON textarea reachable as a fallback. Some types accept any
  config and declare no `configSchema`. Stage 27 also requires low-code
  authoring to keep the JSON escape hatch reachable for every position.
- Change nothing in `src/schema/definition.ts`, `definitionHash`, or
  publish-time validation. The generated form produces the same
  `{ type, config }` shape a hand-authored body produces today.
  `checkActionRegistry`, `checkAssignmentRegistry` and
  `checkDataSourceRegistry` keep validating it exactly as before.

## Capabilities

### New Capabilities
- `studio-plugin-config-form`: the type picker, generated config form and
  inline per-field validation. It covers the three registry-backed
  `{ type, config }` positions: action, data source, assignment strategy.
  It replaces free-text type entry for those three.

### Modified Capabilities
- `studio-tools`: `GET /registry` gains each registered type's config-schema
  description and the assignment-strategy registry's type names. Its
  response shape changes, and so does the requirement that says it exposes
  no config detail.

## Impact

- `src/engine/config-descriptor.ts`: new. The converter from a `configSchema`
  to a browser-consumable descriptor.
- `src/http/studio-routes.ts`: the `GET /registry` handler and response
  shape.
- `src/engine/registry.ts` and `src/engine/host.ts`: export the three
  existing `configSchema` constants (`staticAssignmentConfigSchema`,
  `staticDataSourceConfigSchema`, `dbListDataSourceConfigSchema`) so a test
  can reach them by name. No change to registry resolution or publish-time
  validation itself.
- `src/log.ts`: adds a `debug` level to the existing structured logger, for
  the converter's conversion-failure log.
- `packages/web/src/areas/studio/panels/shared/PluginEnvelopeEditor.tsx`:
  the type picker, generated form, inline errors and JSON switch.
- `packages/web/src/areas/studio/panels/shared/useRegistry.ts`: new. A
  shared `GET /registry` fetch hook, so each panel below stops duplicating
  the same fetch-on-mount logic.
- `DataSourcesPanel.tsx` and `StepsPanel.tsx`, which embed
  `PluginEnvelopeEditor` directly for the data-source and
  assignment-strategy positions.
- `ActionListEditor.tsx`: the action position's own `ActionRow` had a
  separate, duplicate free-text-type-plus-JSON implementation, never built
  on `PluginEnvelopeEditor`. Refactored to reuse it instead. It also
  renders the `onPath` and `onFire.actions` positions. `PathsPanel.tsx` and
  `TimersPanel.tsx` thread the action registry's types and schemas through
  to it for those two.
- `screens/EditScreen.tsx`: passes `token` to `StepsPanel`, which now needs
  it to fetch the registry for the assignment-strategy and action
  positions it renders.
- `FieldCatalogPanel.tsx`'s custom-field-type use of `PluginEnvelopeEditor`
  stays on the free-text path, untouched, since no registry backs it. The
  JSON view stays untouched as the escape hatch.
- `packages/web/src/areas/studio/api/types.ts`: widens `RegistryInfo` and
  adds `ConfigFieldDescriptor`, for the new per-type schema description.
- `packages/web/src/areas/studio/api/client.ts`: fixes `getRegistry`'s
  doc comment, which named only two of the three registries.
- `packages/web/src/areas/studio/catalog.ts`: new UI strings for the
  picker, the generated form and the JSON switch.
- `test/http-studio.test.ts`: an existing exact-key-set test on the
  `GET /registry` response needs rewriting; it currently locks the response
  to today's three type-name arrays. A new test covers the added
  config-schema fields.
- `test/config-descriptor.test.ts`: new. Unit tests for the converter.
- `openspec/specs/studio-tools/spec.md`'s `## Purpose`: a direct rewrite
  (outside this change's delta spec) to say three plugin registries, not
  two.
- `docs/authoring-guide.md`: describes the new form-based authoring path
  beside the existing JSON path for these positions.
