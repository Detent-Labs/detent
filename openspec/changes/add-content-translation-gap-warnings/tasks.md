## 1. Shared walk and pure functions

- [ ] 1.1 Extract `forEachLocalizedEntry(draft, visit)` in
      `packages/web/src/areas/studio/draft/localized-text.ts`, covering the
      same positions `collectUsedLocales` already walks.
- [ ] 1.2 Rewrite `collectUsedLocales` to call `forEachLocalizedEntry`
      instead of its own copy of the traversal.
- [ ] 1.3 Add `localeGapCount(draft, locale)`, counting entries with a
      `baseLocale` value but no value for `locale`.
- [ ] 1.4 Add `missingTranslationWarning(entry, locale, baseLocale)`,
      returning the warning string or `undefined`.
- [ ] 1.5 Unit tests for both new functions and the refactored
      `collectUsedLocales`, following `studio-assignmentWarningLogic.test.ts`'s
      shape.

## 2. Switcher badge

- [ ] 2.1 Add `draft` to `ContentLocaleSwitcher`'s `useDraft()` destructure.
- [ ] 2.2 Render each `<option>` with a `(N missing)` suffix from
      `localeGapCount`, omitted when the count is zero.

## 3. Inline warnings

- [ ] 3.1 Render `missingTranslationWarning(draft.label, contentLocale,
      draft.baseLocale)` under the process label input in
      `screens/EditScreen.tsx`.
- [ ] 3.2 Render the warning under `step.label` and `step.description` in
      `panels/StepsPanel.tsx`.
- [ ] 3.3 Render the warning under `field.label`, `field.description`, and
      `option.label` in `panels/FieldCatalogPanel.tsx`.

## 4. Verification

- [ ] 4.1 `bun run typecheck`.
- [ ] 4.2 Full `bun test` with `DATABASE_URL` set.
- [ ] 4.3 Manual check in a real browser: a draft with an untranslated `de`
      locale shows the switcher badge and the inline warnings; switching to
      `de` and filling in every gap clears both.
