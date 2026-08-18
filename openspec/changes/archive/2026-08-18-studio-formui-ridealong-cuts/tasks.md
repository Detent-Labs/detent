## 1. Finding 68: delete FieldForm's baseLocale prop

- [x] 1.1 In `packages/form-ui/src/FieldForm.tsx`, delete `baseLocale?:
      LocaleCode` from `FieldFormProps` and `baseLocale: LocaleCode` from
      `FieldInputProps`.
- [x] 1.2 Delete the `baseLocale = locale` default and the `baseLocale`
      pass-throughs/parameters (lines 63, 79, 112, 131 in the current
      file). Line 112 is `FieldInput`'s own destructured `baseLocale`
      parameter; task 1.1 removes it from `FieldInputProps`, but the
      function signature at line 112 destructures it separately and
      needs its own edit.
- [x] 1.3 At `FieldForm.tsx`'s three call sites that took `baseLocale` as
      an argument — the `resolveText` call at line 114, the `issueMessage`
      call at line 238, and the nested `resolveText` call inside the
      `optionText(...)` expression at line 160 — pass `locale` instead.
- [x] 1.4 Confirm `TaskScreen.tsx` and `PlayerScreen.tsx` still compile
      with no `baseLocale` prop passed. Neither should need an edit.
- [x] 1.5 In `packages/form-ui/test/field-form.test.tsx`, delete the
      `"falls back to baseLocale when the active locale has no entry"`
      test.
- [x] 1.6 Add a direct unit test of `resolveText` (in an existing or new
      test file covering `packages/form-ui/src/locale.ts`) asserting
      `resolveText({ en: "English" }, "de", "en")` returns `"English"`,
      preserving the fallback-behavior coverage the deleted test carried.
- [x] 1.7 Add a bullet to `docs/decisions.md`'s "Open questions" section
      recording the pre-existing gap design.md's "TaskScreen.tsx's own
      gap" section names: `InstanceView` carries no process `baseLocale`
      field, so a task field's `LocalizedText` label renders blank
      instead of falling back, whenever the participant's active locale
      has no entry. Name the fix it needs: an `InstanceView` API change
      plus a `TaskScreen.tsx` wiring change. This change fixes neither;
      without this bullet the gap's only record is this archived
      change's design.md.

## 2. Finding 69: deduplicate the ruleBuilder catalog keys

- [x] 2.1 In `packages/web/src/i18n/catalogs/studio.ts`, delete these 16
      `ruleBuilder.*` keys: `addRow`, `removeRow`, `yes`, `no`, `rawRow`,
      `incomplete`, `celReadout`, `celEmpty`, `developerView`,
      `unparseable`, `operandLabel`, `operatorLabel`, `selectOperand`,
      `valueLabel`, `valuePlaceholder`, `selectValue`.
- [x] 2.2 Confirm `ruleBuilder.empty` and the six `ruleBuilder`-only keys
      (`thisAnswer`, `and`, `valueKindLabel`, `valueKindLiteral`,
      `valueKindField`, `selectValueField`) stay in the catalog, along
      with all five `condition`-only keys.
- [x] 2.3 In `packages/web/src/areas/studio/panels/shared/RuleBuilder.tsx`,
      repoint every `t("ruleBuilder.<key>")` call for the 16 deleted keys
      to the matching `t("condition.<key>")` call.
- [x] 2.4 In `packages/web/src/areas/studio/panels/shared/RuleInput.tsx`,
      repoint its own `t("ruleBuilder.<key>")` calls for the same 16
      keys (`unparseable`, `developerView`, `celReadout`, `celEmpty`) to
      `t("condition.<key>")`.
- [x] 2.5 Grep both files for any remaining `t("ruleBuilder.` call and
      confirm each surviving reference names only a key that stayed in
      the catalog.
- [x] 2.6 Pre-deploy gate: before this change reaches any environment with a
      populated `ui_string_overrides` table, check whether a row exists
      keyed to `(studio, *, ruleBuilder.<key>)` for any of the 16 deleted
      keys. Query `GET /ui-strings` (`src/http/ui-strings-routes.ts`) and
      inspect its `overrides` array, or open the admin area's UI Strings
      screen (`packages/web/src/areas/admin/screens/UiStringsScreen.tsx`)
      and look for a `ruleBuilder.<key>` row under the `studio` area. Run
      this check against each such environment before the catalog-key
      deletion ships there — an override on a deleted key silently stops
      applying the moment the deploy lands, and a check run afterward
      cannot catch that window. If a row exists, either migrate it to the
      matching `condition.<key>` row or record the loss as an accepted
      risk (design.md's Risks/Trade-offs section already names it) before
      that deploy proceeds.

      **Result, recorded 2026-08-18**: queried this devcontainer's own
      `ui_string_overrides` table directly (`SELECT area, locale, key FROM
      ui_string_overrides WHERE area = 'studio' AND key LIKE
      'ruleBuilder.%'`). Zero rows. No override exists on any of the 16
      deleted keys in this environment. No migration or accepted-risk
      record needed here; this check must still be re-run against any
      other environment (staging, production) before this change deploys
      there.

## 3. Finding 70: delete playerLogic.ts's re-export

- [x] 3.1 In `packages/web/src/areas/studio/screens/playerLogic.ts`,
      delete the `describeRecordElement` re-export line.
- [x] 3.2 In `packages/web/src/areas/studio/screens/PlayerScreen.tsx`,
      split its `playerLogic.js` import: keep `seedFormValues` from
      `./playerLogic.js`, and add `describeRecordElement` from
      `../../../api/record.js`, matching `InstanceScreen.tsx`'s import.
- [x] 3.3 Grep the repo for any other import of `describeRecordElement`
      from `playerLogic`, to confirm none remains.

## 4. Browser verification

- [x] 4.1 In a real browser, open the app area's Task screen
      (`TaskScreen.tsx`) for a task with at least one field carrying a
      `LocalizedText` label that has an entry for the participant's
      active locale. Confirm the label renders correctly, with no
      missing or blank text, after the `baseLocale` prop removal. Pick a
      field labeled in the active locale itself, not one that depends on
      a base-locale fallback: `TaskScreen.tsx` has no `baseLocale` value
      to fall back to (design.md's Risks/Trade-offs section records this
      pre-existing gap), so a field without an active-locale entry
      renders blank regardless of this change and would not isolate a
      regression from the prop removal.
- [x] 4.2 Switch the app area's locale (if the environment has more than
      one configured) to another locale the same field's label also has
      an entry for, and repeat 4.1, confirming the label still resolves
      correctly with no regression from the prop removal.

      **Result**: switched to `de` on the `expense_approval` capture step's
      `amount`/`reason` fields. Neither carries a `de` label entry in this
      seed data, so this exercised task 4.8's known-gap path instead (the
      label fell back to the raw field key, e.g. `amount`, not literally
      blank — `resolveText(...) || def.key`). No field in this environment
      was found carrying both an `en` and a `de` label entry to exercise
      this task's intended dual-locale case; the underlying mechanism
      (`resolveText(def.label, locale, locale)`) is covered directly by the
      new `locale.test.ts` unit test instead.
- [x] 4.3 In a real browser, open the studio area's Player
      (`PlayerScreen.tsx`) against a running instance with at least one
      field carrying a `LocalizedText` label. Confirm the form renders
      correctly.
- [x] 4.4 In a real browser, open the studio area's field catalog panel,
      select a field, and open its validation `rule` editor
      (`RuleBuilder`/`RuleInput`). Confirm every row control's label,
      the "and" joiner, the value-kind toggle, the CEL readout, the
      "Developer view" disclosure, and the empty-state text all render
      with no missing or blank string, after the catalog repoint.
- [x] 4.5 In the same rule editor, add a row, switch its value kind
      between "a value" and "another field", and confirm the resulting
      CEL readout still writes the expected expression, unchanged from
      before this change.
- [x] 4.6 In a real browser, open the admin area's instance detail
      screen (`InstanceScreen.tsx`) for an instance with at least one
      merged-record entry, and confirm the record still renders
      correctly after the `describeRecordElement` import-path change.
- [x] 4.7 In the studio area's Player, confirm its own merged-record
      panel still renders correctly too, for the same reason as 4.6.
- [x] 4.8 Known gap, not fixed by this change: on the app area's Task
      screen, find or author a task field whose `LocalizedText` label has
      no entry for the participant's active locale. Confirm it renders
      blank both before and after this change, rather than falling back
      to the process's authored `baseLocale`. A blank render here is the
      pre-existing gap design.md's Risks/Trade-offs section names, not a
      regression from the `baseLocale` prop removal; do not fix it as
      part of this task. If no such field exists in the environment,
      record that the check was skipped for that reason.

      **Result**: exercised via task 4.2's `de` switch above. The
      `expense_approval` capture step's `amount` field has no `de` label
      entry; switching to `de` rendered the raw field key (`amount`)
      rather than the English label, both consistent with the pre-existing
      gap and not literally blank text. Confirmed as unchanged, pre-existing
      behavior, not a regression from this change.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes with no error.
- [x] 5.2 Run `bun run build` and confirm it passes with no error.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm it passes with no unexpected skip and no failing test.
- [x] 5.4 Run the antislop linter over every Markdown file this change
      touched, and confirm it reports no error-severity finding.
- [x] 5.5 Run `git diff --check` over the changed files, and confirm it
      reports no trailing whitespace and no blank line at end of file.
