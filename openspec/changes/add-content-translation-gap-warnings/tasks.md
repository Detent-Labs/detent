## 1. Shared walk and pure functions

- [x] 1.1 Extract `forEachLocalizedEntry(draft, visit)` in
      `packages/web/src/areas/studio/draft/localized-text.ts`, covering the
      same positions `collectUsedLocales` already walks.
- [x] 1.2 Rewrite `collectUsedLocales` to call `forEachLocalizedEntry`
      instead of its own copy of the traversal.
- [x] 1.3 Add `localeGapCount(draft, locale)`, counting entries with a
      `baseLocale` value but no value for `locale`.
- [x] 1.4 Add `missingTranslationWarning(entry, locale, baseLocale)`,
      returning the warning string or `undefined`. `baseLocale` takes
      `string | undefined` and falls back to `"en"` inside, since
      `draft.baseLocale` carries that type at every call site.
- [x] 1.5 Extend `packages/web/test/studio-localizedText.test.ts` with cases
      for both new functions and the refactored `collectUsedLocales`,
      following `studio-assignmentWarningLogic.test.ts`'s shape. Cover the
      rejected inputs: an entry with no base-locale value draws no warning
      and adds no count, and the base locale itself never counts against
      itself.

## 2. Switcher badge

- [x] 2.1 Add `draft` to `ContentLocaleSwitcher`'s `useDraft()` destructure.
- [x] 2.2 Render each `<option>` with a gap-count suffix from
      `localeGapCount`, omitted when the count is zero. The suffix stays a
      raw literal: `t(key)` interpolates nothing.

## 3. Inline warnings

Each warning renders after the input's closing `</label>`, never inside it.
A `<label>` takes phrasing content, so a `<p className="studio-warning">`
nested there is invalid markup.

- [x] 3.1 Render `missingTranslationWarning(draft.label, contentLocale,
      draft.baseLocale)` under the process label input in
      `screens/EditScreen.tsx`.
- [x] 3.2 Render the warning under `step.label` and `step.description` in
      `panels/StepsPanel.tsx`.
- [x] 3.3 Add `draft` to `FieldRow`'s `useDraft()` destructure, then render
      the warning under `field.label`, `field.description`, and
      `option.label` in `panels/FieldCatalogPanel.tsx`.

## 4. Documentation and ledgers

- [x] 4.1 Move `ROADMAP.md` stage 13 and 13a off NOT STARTED for the
      content-translation half, leaving the white-label half as it stands.
- [x] 4.2 Run `sh scripts/ponytail-ledgers.sh` where `PONYTAIL-DEBT.md`
      exists. The `ponytail:` marker in `localeGapCount` makes the ledger
      stale, and the `ponytail-ledger-fresh` push gate reads it.

## 5. Verification

- [x] 5.1 `bun run typecheck`.
- [ ] 5.2 Full `bun test` with `DATABASE_URL` set. Left to the serial run:
      every worktree shares one Postgres test database, and concurrent runs
      corrupt each other.
- [x] 5.3 The antislop linter on every Markdown file this change touches.
- [x] 5.4 `git diff --check`, then `git ls-files --eol` for a CR byte in the
      `w/` column.
- [ ] 5.5 Manual check in a real browser: a draft with an untranslated `de`
      locale shows the switcher badge and the inline warnings. Switching to
      `de` and filling in every gap clears both. Outstanding: no dev server
      port reaches this worktree.
