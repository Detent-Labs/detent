## 0. Design direction

- [x] 0.1 Invoke `/frontend-design:frontend-design` for the tab set, the
      translation-status list, the preview pane and the used-in list, per
      the Conventions rule in `CLAUDE.md`; pull in `web-design-guidelines`
      and `vercel-composition-patterns` for the tab-panel composition

## 1. Pure logic and its tests

- [x] 1.1 Add `FIELD_TYPE_LABELS: Record<BaseFieldType, {name, note}>` in a
      new `draft/field-type-labels.ts`: one friendly name and note per
      `baseFieldType` value, no other entries, following the exhaustive-record
      pattern `JS_TYPE` (`src/schema/definition.ts`) already uses over the
      same enum
- [x] 1.2 Cover the mapping in a test: the ten values map exactly once,
      and the custom plugin envelope keeps its existing label path
- [x] 1.3 Add `fieldUsage(draft, fieldId)` in a new
      `draft/field-usage.ts`: walk the draft's steps and their views,
      matching each `viewField.ref`, and return the step, its resolved
      label and the modes the reference sets
- [x] 1.4 Cover `fieldUsage` in a test: two steps referencing one field
      with `required` and `readonly`, one step referencing none, and a
      group field's child referenced from a view
- [x] 1.5 Add `fieldVisibleOverrides(draft, fieldId)` beside it: classify
      each referencing step as expression, literal boolean, or absent
      (`ViewField.visible` is `boolean | Expression`); report `uniform`
      only when every referencing step carries the same expression
      source; report divergence when the sources differ AND when any
      step carries a literal, naming those steps; keep a
      no-referencing-view state distinct from both
- [x] 1.6 Cover the read-back in a test: uniform, divergent sources, a
      step carrying literal `visible: false` beside a step carrying an
      expression, a field no step references, and a field referenced by
      exactly one step
- [x] 1.7 Add `applyVisibleOverride(draft, fieldId, visible: DraftOf<Expression>
      | undefined)` as a pure mutating recipe of the shape `mutate`
      (`draft/store.tsx`) takes: it walks `draft.workflow.steps` in
      place and, for each view field referencing `fieldId`, adds the
      key to a view field lacking it, replaces an existing expression or
      literal, or drops the key when `undefined`. It returns nothing —
      `mutate`'s recipe contract is `(draft: Draft) => void`, and this
      is the recipe body, not a separate patch structure a second layer
      would have to apply
- [x] 1.8 Cover the write in a test: two referencing steps both change,
      a step carrying a literal is replaced, a non-referencing step stays
      untouched, and clearing removes the key rather than writing
      `undefined`
- [x] 1.9 Add `previewViewFields(field: DraftField, contentLocale: string,
      baseLocale: string)` in a new `draft/field-preview.ts`, returning
      `{ fields: ResolvedViewField[]; values: Record<string, unknown> }`
      for one field. A field carrying no `id` returns `undefined`
      instead — the panel shows its empty state, the same as an id-less
      field the rail already skips. `fields`: one entry for a leaf
      field; for a group field the group's own entry carrying no
      `group` key PLUS one entry per descendant AT EVERY DEPTH, each
      carrying its parent's synthesized key as `group` (`FieldForm`
      starts from `fields.filter((f) => !f.group)`, so child entries
      alone draw nothing, and a group holding a group needs the same
      rule applied recursively, not just one level down). Each
      synthesized `WireField.key` falls back to the field's own id
      where the draft's `key` is still empty — a freshly created group
      is seeded with an empty key, and `FieldForm` reads an empty
      `group` string as no parent at all, so without the fallback every
      child of an unnamed group draws twice. A missing `type` falls
      back to `string`, a missing `label` to an empty `LocalizedText`.
      Options resolve onto each entry's own `options` key, except a
      dataSource-backed field (`field.dataSource` set), which
      synthesizes an EMPTY `options` array — the draft carries no
      resolved rows, and no studio client call fetches a data list's
      values, only its columns (`GET /admin/data-lists`); the preview
      states that the field resolves at runtime instead of drawing an
      empty control unexplained. Every entry's `readonly` is forced
      `true`. `values`: one sample value per base type, keyed by field
      id, because `FieldForm` reads `values[def.id]` and never
      `ResolvedViewField.value`
- [x] 1.10 Cover the preview synthesis in a test: one field per base
      type, a choice with options, a dataSource-backed choice
      synthesizing empty options, a group field carrying two children
      returning three entries, a group holding a group holding a leaf
      returning four entries, a group whose `key` is still empty
      (asserting each child appears exactly once and only inside the
      group), a field carrying no key, no label and no explicit type, a
      field carrying no id (asserting `undefined`), and `values`
      carrying one entry per synthesized field id
- [x] 1.11 Extend the routing tests: the `edit` route carries the step
      target through `matchRoute` and `routePath` at its own
      `/edit/step/:stepId` segment, ranked after `formStepId` and
      `panel`; assert that `/processes/:id/edit/step` with no id and
      `/processes/:id/edit/step/a/b` both fall back to the plain `edit`
      route rather than half-matching, and that `/edit/form/:stepId`,
      `/edit/panels/:view` and `/edit/step/:stepId` each reach their
      own route without colliding, per
      `unified-shell`'s router-coverage requirement
- [x] 1.12 Add `fieldLocaleGaps(field, locale, baseLocale)` to
      `draft/localized-text.ts`: count the entries among the field's
      OWN `label`, its `description` and each `options[].label` that
      carry `baseLocale` but not `locale`. It does NOT recurse into
      `field.fields`: a group's children carry their own rail entry and
      their own translation-status list, and recursing here would count
      a child's gap twice. `localeGapCount` walks the whole draft, so
      it answers with one number for every field. Apply
      `localeGapCount`'s own two rules: an entry with no base-locale
      value does not count, and the base locale returns 0
- [x] 1.13 Cover `fieldLocaleGaps` in a test: a field with a translated
      label and an untranslated option label, a fully translated field,
      an entry carrying no base-locale value, the base locale itself,
      and a group field whose own gap count excludes its children's

## 2. The tabs

- [x] 2.1 Split `FieldCatalogPanel`'s `FieldRow`: a tabbed outer editor
      for the SELECTED TOP-LEVEL field, with three sections, Field /
      Values / Rules, behind tab state held in that editor's own
      component state; and a flat `SubFieldRow`, unchanged from today's
      `FieldRow`, for a group's children, carrying no tab set of its
      own. `FieldRow` is recursive today, so restructuring it wholesale
      would nest a tablist inside every group child's own tablist; the
      split keeps one `tablist` per open editor. Keep all three tab
      panels mounted and mark the two inactive ones `hidden`, since
      `PluginEnvelopeEditor`'s `configText` and the two builders'
      incomplete rows live in component state, not the draft
- [x] 2.2 Render `IssueList` once, above the tab set, not inside any
      tab, so a field's issue stays visible whatever tab is open
- [x] 2.3 Build the tab list with `role="tablist"` and each tab as a
      `role="tab"` button (see the accessibility group for the pattern)
- [x] 2.4 Keep the group children section recursive inside the Field
      tab, rendering each child through `SubFieldRow` (2.1), with the
      existing `field-row-<id>` anchors intact; a child of a child stays
      a flat row nested one level deeper, never a tab set of its own
- [x] 2.5 Reset to the Field tab when the selected TOP-LEVEL field
      changes; keep the tab across a view switch, since the panel stays
      mounted

## 3. The Field tab

- [x] 3.1 Keep the key, the label, description and their
      missing-translation warnings as they are
- [x] 3.2 Replace the raw type select with the friendly picker from
      1.1, writing the raw `baseFieldType` value; keep the custom plugin
      envelope entry
- [x] 3.3 Add the per-field translation status list: used locales from
      `collectUsedLocales` in order, the base locale marked, each other
      locale with its missing count from `fieldLocaleGaps` (1.12)
- [x] 3.4 Keep the group children section under "Fields inside this
      group"
- [x] 3.5 Keep the developer view (`PluginEnvelopeEditor`) where it is
- [x] 3.6 Add the "How it will look" preview, passing
      `previewViewFields`' `fields` AND its `values` to form-ui's
      `FieldForm`, with a no-op `onChange`; pass `useDraft()`'s
      `contentLocale` as `FieldForm`'s `locale` (and `draft.baseLocale`
      as its base), not a hardcoded `"en"` — the field catalog has a
      content-locale concept the Player's own `FieldForm` call does not,
      and the preview should read a multi-language draft in the locale
      the author is looking at; the preview container carries the
      `inert` attribute, and every synthesized entry's `readonly` is
      forced `true`, so the sample inputs take no keyboard or pointer
      interaction
- [x] 3.7 Add the "Used in" list from `fieldUsage`, one row per step
      with the modes, and a "Show on the canvas" control per row
- [x] 3.8 Keep the "Remove field" control at the tab's end

## 4. The Values tab

- [x] 4.1 Move the options / dataSource / column mapping section into
      the Values tab, unchanged
- [x] 4.2 Keep the "Shown to people / Stored value" split the option
      rows already draw

## 5. The Rules tab

- [x] 5.1 Add the "Only ask this when" condition row from
      `fieldVisibleOverrides` and `applyVisibleOverride`. Mount
      `ConditionInput` with NO `stepId`, so the operand picker withholds
      `child.*`: `src/cel/check.ts:224` admits `child` in a `visible`
      override only on a subprocess step, and this row writes across
      steps of mixed type. Keep `toggleVariant: "link"`, the
      presentation every view-override site takes. Draw the uniform
      value as one row, and the divergence state on its own line above
      the builder rows, naming the differing steps. Draw a disabled row
      with an explanatory note when no step view references the field
- [x] 5.2 Name the write before it happens: "This replaces the
      condition on N steps", with the count from the read-back; name any
      step whose literal `visible` the write replaces. Clearing the
      condition takes the same path: name the scope before it happens,
      on the same terms, then drop the `visible` key from every
      referencing view
- [x] 5.3 Keep `FieldValidationEditor`'s validation-rule section in the
      Rules tab

## 6. Route and canvas navigation

- [x] 6.0 Add a replace mode to the shell's navigation
      (`shell/routing.ts`): `useLocation`'s `go` and `useAreaRoute`'s
      `navigate` both take an optional `{ replace?: boolean }`, calling
      `history.replaceState` instead of `history.pushState` when set.
      `history.pushState` is today's only path — no `replaceState` call
      exists anywhere in `packages/web` — and 6.2 needs it: pushing the
      step-target route would leave a live history entry that
      re-triggers the canvas-selection effect on every Back, so Back
      could never return to the panels screen
- [x] 6.1 Extend the `edit` route in `routing.ts` with an optional
      `stepId` at its own `/processes/:id/edit/step/:stepId` segment,
      matched after the `formStepId` and `panel` patterns in
      `matchRoute`, and rendered by `routePath`
- [x] 6.2 Consume the step target in `EditorArea` with a `useEffect`
      keyed on `stepId`: select that step on the canvas on every
      change, not only on mount, then call
      `navigate({ name: "edit", processId }, { replace: true })` (6.0)
      to replace the current history entry with the plain `edit` route,
      so a later manual selection does not re-trigger it and Back still
      returns to the panels screen; an unknown id selects nothing
- [x] 6.3 Wire a used-in row's navigation to
      `{ name: "edit", processId, stepId }`

## 7. The rail rows

- [x] 7.1 Draw a Fields rail row's primary text as the resolved label
      in the content locale, the key on a secondary mono line, the
      friendly type beside the issue mark
- [x] 7.2 Keep the unnamed-field fallback and the per-row issue mark;
      switch the fallback's trigger from an empty `key` to an empty
      resolved LABEL, since the label is now the row's primary text

## 8. Strings and documentation

- [x] 8.1 Catalogue the new strings under `fieldCatalog.*` and
      `panelsScreen.*` in `catalogs/studio.ts`: tab names, friendly
      type names and notes, the translation status list, the preview
      (including the dataSource-backed "resolves at runtime" note), the
      used-in rows, and the condition row and its write and clear
      notices
- [x] 8.2 Keep raw contract vocabulary (`key`, `label`, `type`,
      `description`) literal per the stage-42 note in
      `docs/roadmap-history.md`
- [x] 8.3 Add the "Long text" deferral to `docs/decisions.md` with its
      trigger: a real need for a multiline type distinct from `string`
- [x] 8.4 Add a `docs/decisions.md` entry recording that
      `FieldDef.default` parses and type-checks but no runtime code
      applies it — no `ResolvedViewField` carries it and `resolveFields`
      never reads it — so this change ships no default-value editor,
      with the trigger for revisiting it: a `runtime-api` change that
      makes an instance's initial `data` read the field catalog's
      defaults
- [x] 8.5 Add the new tab set to `.claude/rules/ui-glossary.md`, the
      way `studio-editor-dock` registered "dock" there. Give it a name
      that stands apart from "register tab", "dock tab" and "surface
      toggle". Register both readings of "inert" while there: the field
      matrix's view-less column, and the preview container's HTML
      attribute
- [x] 8.6 At archive, confirm `openspec/specs/studio-condition-builder/spec.md`'s
      `## Purpose` section carries the three-site wording this change's
      delta adds ("path guard, a view override, or a field's cross-step
      `visible` condition"), not the base spec's "two condition sites".
      Edit the archived spec by hand if the sync did not carry the
      Purpose section over

## 9. The CSS

- [x] 9.1 Add the tab, preview and rail-row rules to `app.css` under
      the design language: no corner radius, hairlines, mono for the
      key and the friendly type where the engine matches it

## 10. Accessibility

- [x] 10.1 Implement the tabs pattern from the new
      `spa-accessibility` requirement, matching the canvas's
      Structure/JSON toggle: `tablist` of `role="tab"`
      buttons, `aria-selected` on the active tab, each tab its own
      tab stop, Enter or Space to activate
- [x] 10.2 Give the preview container the `inert` attribute so a screen
      reader and the keyboard both skip its sample controls entirely,
      rather than inventing a non-interactive landmark pattern

## 11. Verification

- [x] 11.1 Run `bun run typecheck`, then `bun run build`
- [x] 11.2 Run the full `bun test` with `DATABASE_URL` set; report the
      pass and skip counts, not just the green
- [x] 11.3 Run the antislop linter over every Markdown file this change
      touched
- [x] 11.4 Run `git diff --check` and `git ls-files --eol`
- [x] 11.5 Check in a real browser: the three tabs and their keyboard
      activation, the checks staying visible across a tab switch, a
      half-typed developer-view config surviving a switch to Rules and
      back, the condition write and clear notices and the divergence
      state, the preview drawing sample values (and a
      dataSource-backed field's resolves-at-runtime note, with no
      empty control left unexplained), the used-in navigation to the
      canvas, and Back from the canvas returning to the panels screen
      after a "Show on the canvas" navigation (6.0's replace mode)
