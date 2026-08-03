## 1. Config-schema converter

- [x] 1.1 Add `src/engine/config-descriptor.ts` (a leaf module beside
      `registry.ts`, importing only `zod` types, so `studio-routes.ts` can
      import it without a cycle). It walks a `ZodObject`'s shape and emits
      one descriptor per property for `ZodString` (plus `.email()`),
      `ZodNumber`, `ZodBoolean`, `ZodEnum`, and `ZodArray` of one of those,
      each optionally wrapped in `ZodOptional` or `ZodDefault`. Each
      descriptor also carries the node's own length and format checks when
      present: `minLength`/`maxLength` (string), `min`/`max` (number),
      `minItems`/`maxItems` (array), `format: "email"` (string).
- [x] 1.2 Return no descriptor for anything outside that list: a
      `.refine()`/`.superRefine()`-wrapped object, a nested `ZodObject`
      property, `z.unknown()`, or any other unsupported construct.
- [x] 1.3 Add a debug-level log naming the type and the unsupported
      construct when conversion returns no descriptor.
- [x] 1.4 Unit test the converter against all five current `configSchema`
      values. `staticAssignmentConfigSchema`, `dbListDataSourceConfigSchema`
      and `notificationEmailConfigSchema` each produce a descriptor;
      `staticDataSourceConfigSchema` and `httpConfigSchema` produce none.
      Assert the length/format fields land correctly:
      `dbListDataSourceConfigSchema.listKey`'s `.min(1).max(...)` becomes
      `minLength`/`maxLength`, and `notificationEmailConfigSchema.to`'s
      array `.min(1)` and per-element `.email()` become `minItems` and
      `format: "email"`.

## 2. GET /registry

- [x] 2.1 Widen the `GET /registry` handler (`src/http/studio-routes.ts`)
      to include a config-schema description, from the converter, for
      every type in `Registry`, `DataSourceRegistry` and
      `AssignmentRegistry` that has one. Update the handler's docstring
      (currently: "no `HandlerDef`/`DataSourceHandlerDef` detail beyond the
      map keys crosses the HTTP boundary") to match.
- [x] 2.2 Keep `actionTypes`, `dataSourceTypes` and
      `assignmentStrategyTypes` unchanged in shape; add the schema
      descriptions as new, additional response fields.
- [x] 2.3 Test the widened response: a schema-backed type carries a
      description, a schema-less type does not, and the existing
      `system:developer` role gate still applies to the whole response.
- [x] 2.4 Rewrite `test/http-studio.test.ts`'s existing test "GET /registry
      exposes only type names, no configSchema or config detail" (an
      exact-key-set assertion on `Object.keys(body)`, which the widened
      response now fails by design). Assert instead that `actionTypes`,
      `dataSourceTypes` and `assignmentStrategyTypes` stay exactly those
      three arrays, while a schema-description field is additionally
      present for schema-backed types.
- [x] 2.5 Widen `RegistryInfo` in
      `packages/web/src/areas/studio/api/types.ts` (or add a companion
      `ConfigFieldDescriptor` type) for the new per-type schema
      description. Fix its doc comment, which currently reads "the running
      server's registered plugin type names, nothing more (studio-tools
      spec)".

## 3. Studio authoring UI

- [x] 3.1 Add a type picker sourced from `GET /registry`'s live type-name
      arrays, for the action, data-source and assignment-strategy
      positions.
- [x] 3.2 Wire the picker into `PluginEnvelopeEditor`'s usage in
      `StepsPanel.tsx` (assignment strategy) and `DataSourcesPanel.tsx`
      (data source), replacing the free-text `type` input there. For
      actions, refactor `ActionListEditor.tsx`'s `ActionRow` (a separate,
      duplicate free-text-plus-JSON implementation) onto
      `PluginEnvelopeEditor` too, and thread the action registry's types
      and schemas through `PathsPanel.tsx` and `TimersPanel.tsx`, which
      also render `ActionListEditor` for `onPath` and `onFire.actions`.
      Leave `FieldCatalogPanel.tsx`'s custom-field-type usage unchanged; no
      registry backs that position.
- [x] 3.3 Build a generated-form component that renders one input per
      descriptor property (string, number, boolean, enum, string-array)
      and commits the same `{ type, config }` shape the raw JSON path
      produces today.
- [x] 3.4 Add descriptor-driven inline validation: required, kind, enum
      membership, and the length/format checks from task 1.1
      (`minLength`/`maxLength`, `min`/`max`, `minItems`/`maxItems`,
      `format: "email"`). Cover `dbListDataSourceConfigSchema`'s
      `listKey` bound and `notificationEmailConfigSchema`'s non-empty,
      valid-email `to` list, so both show an error inline before publish.
- [x] 3.5 Add a "switch to JSON" affordance on a schema-backed type's
      generated form, pre-filled with the form's current value.
- [x] 3.6 Confirm the raw JSON textarea still renders unchanged for a type
      with no schema description.

## 4. Documentation

- [x] 4.1 Change `docs/authoring-guide.md` to describe the new form-based
      authoring path for action, data-source and assignment-strategy
      config, alongside the existing JSON path.
- [x] 4.2 Change `openspec/specs/studio-tools/spec.md`'s `## Purpose`
      directly (a delta file cannot touch Purpose). It currently says "two
      plugin registries... nothing else"; make it three, matching the
      assignment-strategy list `ToolsScreen.tsx` already renders and the
      config-schema description `GET /registry` now also carries.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Check the
      skip count as well as the pass count; a single-file rerun is not the
      signal.
- [x] 5.3 Run the antislop linter on every Markdown file this change
      touched.
- [x] 5.4 Run `git diff --check` for trailing whitespace and blank-at-eof.
- [x] 5.5 In a real browser, pick an action type in the Steps panel, fill
      the generated form, trigger an inline validation error, switch to
      JSON, and confirm a schema-less type (`http.request`) still shows
      the raw JSON textarea.
