## 1. Visual direction

- [ ] 1.1 Run the `frontend-design` skill for the mapping form's visual
      direction, and read `web-design-guidelines`,
      `vercel-react-best-practices` and `vercel-composition-patterns`
      before writing the component.

## 2. Logic in migrationPlanLogic.ts

- [ ] 2.1 Add `readCatalogs(body)`: pull `{ id, key, label, celType }` per
      field and `{ id, key, label }` per step out of an opaque version
      body, without trusting its shape. The field walk mirrors
      `fieldTypeById` (`src/engine/migration.ts:51`): recurse into a
      `group` field's `fields`, and never register the group itself.
      `packages/web/src/areas/studio/draft/fields.ts::flattenDraftFields`
      already walks a draft the same way.
- [ ] 2.2 Resolve each label against the body's own `baseLocale`, through
      `resolveDraftLocalizedText` (`draft/localized-text.ts`), falling back
      to `key`.
- [ ] 2.3 Add the plan-to-rows conversion for `stepMap`, `fieldMap` and
      `transforms`, each row carrying a render-only `rowId`. A transform
      row holds `src` alone, stripped from its `{ lang: "cel", src }`
      wrapper.
- [ ] 2.4 Add the rows-to-plan conversion. Omit an empty map. Write a
      transform back as `{ lang: "cel", src }`. Carry `unmappableStep`
      with `onUnmappable: "route-to-step"` and neither otherwise.
- [ ] 2.5 Add `checkPlan(plan, catalogs)`: the injectivity check, the
      `fieldMap` type-agreement check, and the cancel-sink check, each
      keyed to the row it applies to. Type agreement compares the CEL type
      from `celType`, imported from `workflow-engine/cel/check` — the same
      function `validatePlan` compares, and the same module
      `ToolsScreen.tsx` already value-imports.
- [ ] 2.6 Mark a row whose id is absent from its catalog as unresolved,
      keeping the id.

## 3. The form component

- [ ] 3.1 Add `panels/MigrationSpecEditor.tsx`: the step-map, field-map,
      transforms and unmappable-policy sections, with add and remove per
      row. Choosing `route-to-step` selects the first eligible target step
      at once, so the schema's iff never breaks.
- [ ] 3.2 Render each picker from the matching catalog, labelled by `key`
      and `label`. Every picker filters out `CANCEL_SINK_STEP_ID`. A
      filtered id still resolves for a stored row and still shows its
      name.
- [ ] 3.3 Render an inline error per row from `checkPlan`, and the
      unresolved marker from task 2.6.
- [ ] 3.4 Add every new UI string to `catalog.ts` and the row styles to
      `app.css`. Prefix each new class with `studio-`;
      `packages/web/test/boundaries.test.ts` rejects a class name two
      areas define.

## 4. The screen

- [ ] 4.1 Load both version bodies beside the plan in the existing effect,
      through `Promise.allSettled`.
- [ ] 4.2 Hold the plan as one state. Add the Form/JSON switch, the form
      as the default side.
- [ ] 4.3 Keep the author on the JSON side when the text does not parse,
      showing the existing parse-error message.
- [ ] 4.4 Force the JSON side when either body request fails, and name the
      reason on screen.
- [ ] 4.5 Leave the orphan-key dry run and the frozen-plan warning as they
      are, below the switch.

## 5. Tests

- [ ] 5.1 `packages/web/test/studio-migrationPlanLogic.test.ts`: the
      conversion in both directions produces a valid `MigrationSpec`,
      checked with `migrationSpec.parse`. A transform carries its
      `{ lang: "cel", src }` wrapper.
- [ ] 5.2 A stored plan round-trips through rows and back, unchanged.
- [ ] 5.3 An unresolved id survives the round trip.
- [ ] 5.4 Each of the three `checkPlan` rules reports at the right row,
      and a valid plan reports nothing. A `date` source onto a `string`
      target reports nothing, since both share one CEL type.
- [ ] 5.5 `readCatalogs` returns empty catalogs for a body that is not an
      object, rather than throwing.
- [ ] 5.6 `readCatalogs` returns a `group` field's leaves and not the
      group.
- [ ] 5.7 An empty row set with no policy converts to `{}`.
- [ ] 5.8 The `onUnmappable` pairing survives both conversions, for both
      enum values.

## 6. Verification

- [ ] 6.1 `bun run typecheck` inside the devcontainer.
- [ ] 6.2 The full `bun test` with `DATABASE_URL` set. Record the pass
      count and the skip count.
- [ ] 6.3 The antislop linter on every Markdown file this change touched.
- [ ] 6.4 `git diff --check`, plus `grep -lI $'\r'` for CRLF.
- [ ] 6.5 Drive the screen in a real browser through `playwright-cli`:
      build a mapping, read an inline error, switch to JSON and back, and
      run the orphan-key dry run.

## 7. Documentation

- [ ] 7.1 Rewrite the migration-plan paragraph in `docs/current-state.md`.
- [ ] 7.2 Move ROADMAP stage 27c to DONE, naming the change and the spec.
