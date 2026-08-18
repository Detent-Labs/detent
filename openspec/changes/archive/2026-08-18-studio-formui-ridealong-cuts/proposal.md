## Why

A ponytail (over-engineering) audit flagged three small defects: findings 68,
69, and 70. They span `packages/form-ui` and the studio area of
`packages/web`. Each is too small to justify its own change.

No other in-flight change touches their files this planning pass. This
change bundles all three as one ride-along cleanup. A dead prop sits on the
shared step-form renderer. An i18n catalog carries a duplicated namespace. A
pass-through re-export has gone dead.

## What Changes

- Delete `FieldForm`/`FieldInput`'s `baseLocale` prop, in
  `packages/form-ui/src/FieldForm.tsx`. Neither production caller passes a
  value different from `locale`. `TaskScreen.tsx` (app area) and
  `PlayerScreen.tsx` (studio area's Player) both omit the prop. The prop's
  only non-default use sat in `field-form.test.tsx`. Three call sites take
  `locale` in place of the removed `baseLocale` argument: `resolveText`,
  `issueMessage`, `optionText`.
- Move the fallback-resolution behavior the removed test exercised to a
  direct unit test of `resolveText`. That function lives in
  `packages/form-ui/src/locale.ts` and is the true owner of that logic.
  The behavior stays. Only the now-dead prop plumbing goes.
- Delete 16 `ruleBuilder.*` catalog keys in
  `packages/web/src/i18n/catalogs/studio.ts`. Each is byte-for-byte
  identical, key suffix and text alike, to an existing `condition.*` key.
  Eight of the 16: `addRow`, `removeRow`, `yes`, `no`, `rawRow`,
  `incomplete`, `celReadout`, `celEmpty`. The other eight: `developerView`,
  `unparseable`, `operandLabel`, `operatorLabel`, `selectOperand`,
  `valueLabel`, `valuePlaceholder`, `selectValue`.
  Two files read all 16 today, `RuleBuilder.tsx` and `RuleInput.tsx`.
  Both switch to the matching `condition.*` key.
- `ruleBuilder.empty` keeps its own text.
  <!-- antislop: allow passive-voice em-dash -->
  <!-- The em dashes below are quoted catalog text, not prose punctuation. -->
  It reads "No rule — nothing is checked." `condition.empty` reads "No
  condition — this always matches." The two say different things, so they
  stay separate keys.
- Six more `ruleBuilder.*` keys have no `condition.*` counterpart at all,
  so they stay untouched: `thisAnswer`, `and`, `valueKindLabel`,
  `valueKindLiteral`, `valueKindField`, `selectValueField`.
- This is a catalog-key dedup only. It does not merge the `RuleBuilder`/
  `RuleInput` components with `ConditionBuilder`/`ConditionInput`. A prior
  audit finding already examined and declined that merge; design.md covers
  why.
- Delete `playerLogic.ts`'s pass-through re-export of
  `describeRecordElement`. It sits at that file's line 1.
  `PlayerScreen.tsx` imports it directly from `api/record.js` instead. That
  is the path `InstanceScreen.tsx` already uses. `seedFormValues`, the one
  function `playerLogic.ts` defines, keeps its current shape.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `form-ui`. Its locale requirement gains a clarification.
  `FieldForm`/`FieldInput` resolve every `LocalizedText` value through the
  single `locale` prop. No separate base-locale fallback prop exists.
  The requirement now states the fact this change makes true for every
  caller: one `locale` prop, no separate fallback prop.

  The studio area's Player already passes one fixed locale value for
  both purposes, by choice. The app area's `TaskScreen.tsx` passes only
  `locale` too, but for a different reason. Its `InstanceView` type
  carries no process-`baseLocale` value for it to pass. That gap is
  pre-existing, not introduced here, and stays open. Design.md's
  Risks/Trade-offs section records it.

`studio-field-validation-form` (finding 69) and `studio-player` (finding 70)
carry no delta. Neither spec's requirement text names a catalog key or an
internal import path. Neither finding changes a rendered string or a saved
value, and neither changes any other behavior a user can observe. Design.md
records the check.

## Impact

- `packages/form-ui/src/FieldForm.tsx`: prop removal, three call-site
  argument changes.
- `packages/form-ui/test/field-form.test.tsx`: the base-locale-fallback test
  moves. It becomes a `resolveText` unit test, in a new or existing test
  file covering `packages/form-ui/src/locale.ts`.
- `packages/web/src/areas/app/screens/TaskScreen.tsx` and
  `packages/web/src/areas/studio/screens/PlayerScreen.tsx`: both are
  `FieldForm` consumers. Neither changes its own call. Browser verification
  covers both, since the shared renderer's prop surface changes.
- `packages/web/src/i18n/catalogs/studio.ts`: 16 key deletions.
- `packages/web/src/areas/studio/panels/shared/RuleBuilder.tsx` and
  `packages/web/src/areas/studio/panels/shared/RuleInput.tsx`: 16
  `t("ruleBuilder.*")` call sites point at `t("condition.*")` instead.
- `packages/web/src/areas/studio/screens/playerLogic.ts` and
  `packages/web/src/areas/studio/screens/PlayerScreen.tsx`: the re-export
  goes, and one import splits into two source modules.
- `docs/decisions.md`: gains one Open questions bullet recording
  `TaskScreen.tsx`'s pre-existing baseLocale gap.
- No engine, schema, or API change. No database migration. No route change.
