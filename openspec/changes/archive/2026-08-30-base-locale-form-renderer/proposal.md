## Why

A participant's active locale can lack an entry in a field's `LocalizedText`
label. Today that case never falls back to the process's `baseLocale`.
`FieldForm.tsx` passes the active locale as both the `locale` and the
`baseLocale` argument to `resolveText`. The real base-locale entry, which
`ProcessBody.baseLocale` guarantees exists on every `LocalizedText`, is never
consulted. The participant sees the raw field `key` instead of a real label.
The same gap affects option labels and the studio's Player, since it renders
through the same `FieldForm`.

## What Changes

- `InstanceView` (`src/runtime/api.ts`) gains a `baseLocale: LocaleCode`
  field, populated from the resolved `ProcessBody.baseLocale` already read by
  `getInstanceView`.
- Two web-side `InstanceView` mirrors exist: `packages/web/src/areas/app/api/
  types.ts` and `packages/web/src/areas/studio/api/types.ts`. Both gain the
  matching field. Neither HTTP route needs a change. Both already return the
  whole view object as JSON.
- `TaskScreen.tsx` and the studio's `PlayerScreen.tsx` pass `view.baseLocale`
  into a new `FieldForm` prop.
- `form-ui`'s `FieldForm` gains an optional `baseLocale` prop. It defaults to
  `locale` when the caller omits it. That preserves today's behavior for the
  one caller with no real base-locale concept, the field catalog's
  field-preview. Both of its `resolveText` calls, the field label and each
  option's label, use the new prop instead of the active `locale`.
- Corrects a comment in `packages/web/src/areas/studio/draft/field-preview.ts`
  claiming `FieldForm` "carries no separate base-locale concept". That claim
  no longer holds once the prop exists.
- Corrects `docs/decisions.md`'s "Open questions" second bullet. It currently
  describes the effect as the label "rendering blank". The actual effect is
  the raw field key showing, because `resolveText(...) || def.key` already
  catches the empty-string case. This change also resolves the question that
  bullet raises, so this change removes the bullet rather than merely
  rewording it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `runtime-api`: `InstanceView` gains a `baseLocale` field.
- `form-ui`: `FieldForm` resolves a field's label, and each option's label,
  against the process's real base locale instead of the active locale twice.
- `end-user-app`: the Task screen's step form now falls back to the process's
  base locale for an untranslated label.
- `studio-player`: the Player's step form gains the same real fallback.

## Impact

- `src/runtime/api.ts`: `InstanceView` type, `getInstanceView`.
- `packages/web/src/areas/app/api/types.ts`,
  `packages/web/src/areas/app/screens/TaskScreen.tsx`.
- `packages/web/src/areas/studio/api/types.ts`,
  `packages/web/src/areas/studio/screens/PlayerScreen.tsx`.
- `packages/web/src/areas/studio/draft/field-preview.ts` (comment only).
- `packages/form-ui/src/FieldForm.tsx`.
- `docs/decisions.md`. This change removes an Open questions bullet.
- UI-visible: `docs/browser-checks.md` requires a real browser check, since a
  green test suite cannot see a fallback label render correctly.
