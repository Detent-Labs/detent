## 1. Engine: `InstanceView` carries `baseLocale`

- [x] 1.1 Add `baseLocale: LocaleCode` to the `InstanceView` type in
      `src/runtime/api.ts`, alongside `kind`/`columns`, and verify
      `bun run typecheck` passes.
- [x] 1.2 Populate it in `getInstanceView` from `body.baseLocale` (the
      already-resolved `ProcessBody` `loadInstanceForActor` returns), and
      verify a new test in `test/runtime-api.test.ts` asserts
      `getInstanceView(...)` returns the process's `baseLocale`, including
      for a completed instance.

## 2. `form-ui`: shared locale-resolution helper

- [x] 2.1 Add `resolveFieldsLocale(fields, locale, baseLocale)` to
      `packages/form-ui/src/locale.ts`, resolving each field's `label` and
      each option's `label` to a single-entry `LocalizedText` keyed by
      `locale` via the existing `resolveText`, without mutating its input.
- [x] 2.2 Export it from `packages/form-ui/src/index.ts`.
- [x] 2.3 Add tests in `packages/form-ui/test/locale.test.ts` covering: a
      label falling back to `baseLocale`, an option label falling back the
      same way, a label already present in `locale` staying unchanged, and
      no mutation of the input array/objects. Verify `bun test` passes for
      this file.

## 3. Web: wire `baseLocale` through the Task screen

- [x] 3.1 Add `baseLocale: LocaleCode` to the `InstanceView` interface in
      `packages/web/src/areas/app/api/types.ts`.
- [x] 3.2 In `TaskScreen.tsx`, import `resolveFieldsLocale` from `form-ui`
      and pass `resolveFieldsLocale(view.fields, locale, view.baseLocale)`
      as `FieldForm`'s `fields` prop, in place of `view.fields`.
- [x] 3.3 Verify `bun run typecheck` and `bun run --filter './packages/web'
      build` both pass.

## 4. Web: wire `baseLocale` through the studio Player

- [x] 4.1 Add `baseLocale: LocaleCode` to the `InstanceView` interface in
      `packages/web/src/areas/studio/api/types.ts` (it already carries the
      comment "Mirrors src/runtime/api.ts::InstanceView").
- [x] 4.2 In `PlayerScreen.tsx`, import `resolveFieldsLocale` from `form-ui`
      and pass `resolveFieldsLocale(view.fields, "en", view.baseLocale)` as
      `FieldForm`'s `fields` prop, in place of `view.fields`.
- [x] 4.3 Verify `bun run typecheck` and the build both pass.

## 5. Documentation corrections

- [x] 5.1 Correct the comment in
      `packages/web/src/areas/studio/draft/field-preview.ts` (lines 6-14):
      it claims `FieldForm` "carries no separate base-locale concept",
      which no longer holds once `resolveFieldsLocale` exists. State that
      this preview path keeps baking its own fallback in this file instead
      of calling the new helper, since it has no `InstanceView` behind it.
- [x] 5.2 Remove `docs/decisions.md`'s "Open questions" second bullet (the
      one describing a task field label as "rendering blank"), since this
      change closes the gap it names. Run the antislop check on the touched
      section of the file and confirm no new finding.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`, and confirm both
      succeed with no errors.
- [x] 6.2 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun), and confirm every test passes with no silently
      skipped DB-backed suite.
- [x] 6.3 Run `sh scripts/gates/prose.sh` and `sh scripts/gates/whitespace.sh`
      over every Markdown file this change touched, and confirm both report
      clean.
- [x] 6.4 Browser check per `docs/browser-checks.md`: seed a process whose
      `baseLocale` is `de` and add a field label with no `fr` entry (or
      reuse an existing multi-locale example process). Open a task for it
      as a participant with the active locale set to a locale the label
      has no entry for. Confirm the field renders the process's `baseLocale`
      text, not the raw field key. Repeat in the studio Player for the same
      field, confirming it too falls back rather than rendering the raw key
      (the Player's own locale stays fixed at `en`).
