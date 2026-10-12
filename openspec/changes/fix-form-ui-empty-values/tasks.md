# Tasks

## 1. Engine: a null clears, a blank is missing

- [x] 1.1 Add `applyDataPatch` to `src/engine/transition.ts`. A `null` patch value deletes its key. Use it in `commitManualTransition`.
- [x] 1.2 Give `validateSubmissionData` the option `allowClear`. A `null` key skips value checks and leaves the merged data. Only `submitAndTransition` sets it.
- [x] 1.3 Count `undefined`, `null` and `""` as missing in the required check.
- [x] 1.4 Cover each `runtime-api` delta scenario in `test/runtime-api.test.ts`. The tests fail on the old code.

## 2. form-ui: null, read-only switch, datetime and announcement

- [ ] 2.1 Map a cleared number, text, date, email, multiline or single select to `null` in `FieldForm`. Unit tests cover the mapping.
- [ ] 2.2 Add the `readonly` prop to `FieldForm` and export `formIsReadonly` from `submit.ts`. A static render test and a helper test cover both.
- [ ] 2.3 Convert a zoned `datetime` value to the local input format. Tests cover `Z`, an offset, a zoneless value and a bad value.
- [ ] 2.4 Fill both placeholders of `tabSwitchAnnouncement` in one pass with a replacer. Tests cover `Kosten $&` and a label of `{count}`.
- [ ] 2.5 Test in `packages/form-ui/test/submit.test.ts` that `filterToEditable` keeps a `null` value.

## 3. React peer range

- [x] 3.1 Set the `react` and `react-dom` peers of `packages/form-ui` to `^19`. Run `bun install` in the container and keep the new `bun.lock`.
- [x] 3.2 Check that the form-ui tests resolve React 19 and the built bundle carries one React. The form-ui suite passes.
- [x] 3.3 Regenerate `THIRDPARTY.md` if the lock changed, and check the script reports no drift.

## 4. Task screen and Player

- [ ] 4.1 Move the draft seed from `TaskScreen.applyView` into a pure function. It tests `id in draft.data`. A test covers a `null` draft value.
- [ ] 4.2 Pass `formIsReadonly(view)` to `FieldForm` in `TaskScreen.tsx`, and hide Save when it answers true. A pure helper picks the note key, and a test covers it.
- [ ] 4.3 Add the two `task.readonly*` keys to the English and German app catalogs. The catalog parity test passes.
- [ ] 4.4 Pass `formIsReadonly(view)` to `FieldForm` in `PlayerScreen.tsx`. The browser check in 6.3 covers a finished test instance.
- [ ] 4.5 Run `bun install`, the web typecheck and the web build in the container. Each prints no error.

## 5. Docs and index

- [ ] 5.1 In `docs/openapi.yaml`, say that a `null` value in the submit body clears a field. Say that a blank value fails a required field.
- [ ] 5.2 Strike the `fix-form-ui-empty-values` entry in the audit index of `docs/decisions.md`.
- [ ] 5.3 Add a read-only check and a cleared-field check to `docs/browser-checks.md`, beside the task screen draft check.
- [ ] 5.4 Correct the FIELDS-19 entry in `docs/decisions.md`. Say the `packages/form-ui` site now passes a replacer.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set. Record each result.
- [ ] 6.2 Run the antislop prose gate and the whitespace gate over the pushed range. Record each result.
- [ ] 6.3 Check the task screen in a browser on the production build. Cover a cleared number, a cleared date, a completed case and a restored draft.
- [ ] 6.4 Run `/impeccable critique` and `/impeccable audit` on the task route. Record the result.
