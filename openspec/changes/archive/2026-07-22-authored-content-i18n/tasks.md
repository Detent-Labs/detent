## 1. Contract: LocaleCode, LocalizedText, baseLocale

- [x] 1.1 Add `localeCode` (`z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)`)
      and `LocalizedText = Record<LocaleCode, string>` to
      `src/schema/definition.ts`.
- [x] 1.2 Add `ProcessBody.baseLocale: LocaleCode` (required).
- [x] 1.3 Change `ProcessBody.label`/`description`, `Step.label`/
      `description`, `FieldDef.label`/`description` (including the
      recursive `fieldDef` lazy schema, so nested `group` fields are
      covered), and `FieldOption.label` from `z.string()` to
      `localizedText`.
- [x] 1.4 Add the invariant to the **base `processBody` schema's own
      `superRefine`** (not only `authoredProcessBody`) — same placement as
      every other structural invariant (id uniqueness, path/view/action
      resolution), so both `authoredProcessBody` and `publishedProcessBody`
      inherit it automatically and the compile-injected cancel-sink label
      (task 2.1) is actually checked. Walk `ProcessBody` itself, every
      step, every field via `collectFieldsDeep` (covering nested group
      fields), and every field's `options`: each `LocalizedText` value
      found must contain a non-empty entry keyed by `baseLocale`.
- [x] 1.5 Add `resolveLocalizedText(value: LocalizedText, locale:
      LocaleCode, baseLocale: LocaleCode): string` (`value[locale] ??
      value[baseLocale]`) to `src/schema/definition.ts`, exported via the
      package's `./schema` entry (already in the workspace `exports` map —
      no map change needed).

## 2. Compile-time: cancel-sink label

- [x] 2.1 `src/schema/compile.ts`'s synthesized cancel-sink step's
      `label: "Cancelled"` becomes `label: { en: "Cancelled",
      [body.baseLocale]: "Cancelled" }`.

## 3. Migrate existing fixtures

- [x] 3.1 Convert every `label`/`description` literal in
      `examples/*.json` to `{ en: "..." }`, and add `baseLocale: "en"` to
      each example `ProcessBody`.
- [x] 3.2 Convert every affected `label`/`description` literal across
      `test/*.ts` fixtures (engine suite) to the new shape — 253
      occurrences across 16 files, no shared fixture/builder module exists
      to centralize this, so budget it as the bulk of the implementation
      effort, not a quick pass. Heaviest first: `subprocess.test.ts` (81),
      `migration.test.ts` (38), `validate.test.ts` (38), `outbox.test.ts`
      (14), `timer.test.ts` (13), `cel.test.ts` (12), `definitions.test.ts`
      (10), remaining files (`automatic`, `cancel.runtime`,
      `cross-process`, `duration`, `engine`, `events`, `registry-check`,
      `resolution`, `transition`) 1-8 each.
- [x] 3.3 Convert every affected literal in `packages/editor/test/*.ts`
      fixtures to the new shape.

## 4. Engine tests

- [x] 4.1 `test/validate.test.ts` (or a new `test/localized-text.test.ts`,
      matching the existing per-invariant suite convention): a
      `LocalizedText` missing the `baseLocale` entry is rejected, at the
      process level, the step level, the field level (including a nested
      group field), and a field option.
- [x] 4.2 A `LocalizedText` with only the base-locale entry parses; one
      with the base locale plus additional locales parses.
- [x] 4.3 `resolveLocalizedText`: requested-locale hit, and fallback to
      `baseLocale` when the requested locale has no entry.
- [x] 4.4 `compile.ts`'s cancel-sink label carries both `en` and the
      process's `baseLocale` entries (collapsed to one when `baseLocale`
      is `"en"`).

## 5. Editor: content-locale state

- [x] 5.1 Add `contentLocale`/`setContentLocale` and a derived list of
      locales already used anywhere in the current Draft to
      `DraftContextValue` (`packages/editor/src/draft/store.tsx`) —
      ephemeral editor state, not persisted with the Draft, independent of
      `useLocale()` (UI-chrome locale).
- [x] 5.2 Add a content-locale switcher component (distinct from
      `i18n/LocaleSwitcher.tsx`) offering every locale already used in the
      Draft plus a free-form "add a locale" action validated against the
      `LocaleCode` format; mount it near the panels that edit localized
      content.
- [x] 5.3 Add a `LocalizedTextInput` component: takes a `LocalizedText`
      value, the current content locale, and an `onChange`; renders the
      current locale's entry, writes typed text back into
      `value[contentLocale]` via `mutate`.
- [x] 5.4 Add a Draft-side lenient wrapper (e.g.
      `resolveDraftLocalizedText(value: DraftOf<LocalizedText> | undefined,
      locale, baseLocale): string | undefined`) instead of calling the
      engine's `resolveLocalizedText` directly against Draft data: a Draft
      entity's `label` is deeply partial (`DraftOf<T>` in
      `draft/types.ts` makes every property optional) and can legitimately
      have neither the requested locale nor `baseLocale` filled in yet
      while an author is mid-edit, unlike a schema-valid `ProcessBody`
      where the invariant guarantees `baseLocale` is always present.

## 6. Editor: panel wiring

- [x] 6.1 `App.tsx` — process `label`/`description` use
      `LocalizedTextInput`.
- [x] 6.2 `panels/StepsPanel.tsx` — step `label`/`description` use
      `LocalizedTextInput`.
- [x] 6.3 `panels/FieldCatalogPanel.tsx` — field `label`/`description`
      (including nested group-field entries) and each `FieldOption.label`
      use `LocalizedTextInput`.
- [x] 6.4 Update the three new-entity seed sites that currently write a
      bare `label: ""`, to seed `{}` (or `{ [contentLocale]: "" }`)
      instead: `StepsPanel.tsx` (new step, `d.workflow.steps.push({ id,
      key: "", label: "", type: "task" })`), `FieldCatalogPanel.tsx` (new
      sub-field, two call sites) and `FieldCatalogPanel.tsx` (new option,
      `{ value: "", label: "" }`).
- [x] 6.5 `graph/mapping.ts::draftToGraph` — **not** `GraphView.tsx`: this
      pure function (no React context) currently derives `GraphNode.label`
      via `s.key || s.label || "(unnamed step)"`. Change its signature to
      accept `contentLocale`/`baseLocale` and resolve through the task 5.4
      wrapper, keeping the `"(unnamed step)"` fallback for a fully-empty
      result. `GraphView.tsx` only needs to pass the two new arguments
      through from Draft/content-locale context.

## 7. Editor: live validation

- [x] 7.1 Normalize the new base-locale-missing invariant into
      `EditorIssue` in the Draft validation pipeline
      (`packages/editor/src/draft/validation.ts` or equivalent), mapped
      onto the owning step/field/option entity, same as every other
      structural issue.

## 8. Editor tests

- [x] 8.1 `LocalizedTextInput` render test (via `react-dom/server`'s
      `renderToStaticMarkup`, matching the existing i18n-rendering test
      convention): displays the current content locale's entry, and
      writes only the current locale's key on change (leaving other
      locale entries untouched).
- [x] 8.2 Content-locale switcher render test: lists exactly the locales
      used in a given Draft, adds a new one on request, rejects a
      malformed locale code.
- [x] 8.3 A base-locale-missing violation surfaces as an `EditorIssue` on
      the right entity (step, field, field option).
- [x] 8.4 Update `graph-mapping.test.ts`'s existing plain-string-label
      assertions for `draftToGraph`'s new signature, and add a case
      covering fallback-to-base-locale for a node's label.

## 9. Verification

- [x] 9.1 `bun test` at the repo root (engine suite) passes.
- [x] 9.2 `bun run typecheck` (root + `packages/editor`) passes.
- [x] 9.3 `bun test` in `packages/editor` passes.
- [x] 9.4 Manual check in the running editor (`vite dev`): add a second
      content locale, edit a step's label in both locales, confirm the
      graph view label follows the content-locale switcher, and confirm a
      label with only the base locale still validates and displays via
      fallback.
