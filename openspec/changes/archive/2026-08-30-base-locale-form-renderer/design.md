## Context

See `proposal.md` - Why for the defect. This section covers a constraint the
proposal doesn't state. `form-ui`'s own spec already forbids the fix the
original bug report suggested.

`packages/web/src/areas/studio/screens/PlayerScreen.tsx:225` and
`packages/web/src/areas/app/screens/TaskScreen.tsx:283` both call `FieldForm`
today with `locale` alone. That is not an oversight. The archived
`2026-08-18-studio-formui-ridealong-cuts` change deliberately removed
`FieldForm`/`FieldInput`'s `baseLocale` prop. No production caller ever
passed a value distinct from `locale`, so the prop was dead weight. That
change added the requirement `form-ui` still carries today: "form-ui takes
locale as a prop and holds no locale state". It carries a scenario asserting
the component's prop type offers no `baseLocale` prop at all.

Re-adding that prop would revert a considered decision. It would also break
that scenario. That change's own design.md foresaw this exact fix. It named
two changes short of touching `FieldForm` itself: an `InstanceView` API
change, and a `TaskScreen.tsx` wiring change. This design takes that path.

## Goals / Non-Goals

**Goals:**
- `InstanceView` carries the process's `baseLocale`.
- Both `FieldForm` callers (`TaskScreen.tsx`, `PlayerScreen.tsx`) render a
  field label, and each option label, with a real base-locale fallback.
- `FieldForm`/`FieldInput` keep taking `locale` alone, per the standing
  `form-ui` requirement.

**Non-Goals:**
- Reintroducing a `baseLocale` prop on `FieldForm`/`FieldInput`.
- Resolving locale for chrome strings or any catalog lookup. Those already
  fall back correctly, and this change does not touch `t()`.
- A translation-coverage UI. `docs/decisions.md` already defers that as its
  own, separate tab.

## Decisions

**Resolve the fallback in the caller, not the component.** `form-ui` gains
one exported pure function (working name: `resolveFieldsLocale`). It takes
`fields: ResolvedViewField[]`, `locale`, and `baseLocale`. It returns a new
array. In that array, each field's `label`, and each option's `label`,
becomes a single-entry `LocalizedText`. Each carries the key `locale` and
holds the resolved text. `TaskScreen.tsx` and `PlayerScreen.tsx` both call it on
`view.fields` before handing the result to `FieldForm`. `FieldForm`'s own
`resolveText(def.label, locale, locale) || def.key` then finds the resolved
text under `locale` unchanged. `FieldForm` itself needs no change.

Alternative considered: resolve the fallback at the engine. That would mean
embedding the already-resolved string into `InstanceView.fields`
server-side. Rejected: `getInstanceView` has no active locale to resolve
against. The participant's active locale is a client-side
(`packages/web/src/i18n/`) concern the engine does not see. Threading it
through every runtime-api caller for a formatting concern would be a bigger,
unrelated change.

Alternative considered: duplicate the transform separately in
`TaskScreen.tsx` and `PlayerScreen.tsx`. Rejected: the Player's own purpose
states that "what a developer previews is what a participant gets"
(`studio-player`'s Purpose). Two independently maintained copies of the same
fallback logic could drift, and silently defeat that guarantee.

**`getInstanceView` reads `baseLocale` off the body it already has.**
`loadInstanceForActor` already resolves the pinned `ProcessBody` before
`getInstanceView` builds its return value. Reading `body.baseLocale` costs
one field access. It needs no new query.

**The studio field-preview path (`FieldCatalogPanel.tsx:609`) keeps its
current call.** It has no `InstanceView`, and no participant-facing active
locale. It already bakes its own single-locale fallback in
`field-preview.ts`, before values reach `FieldForm`. Its reason differs:
previewing one field, in the studio's own `contentLocale`, with no instance
behind it. Only its stale comment about `FieldForm` needs a fix.
`FieldForm`'s caller-side contract now includes the new helper, so
describing it as "no separate base-locale concept" no longer holds. The
concept exists; it just lives outside the component.

## Risks / Trade-offs

- [The new helper copies the fields array on every render] → Cheap. A step
  form's `fields` list is small: one process's current step. Both callers
  already re-render `FieldForm` on every state change.
- [A future third `FieldForm` caller forgets to call the helper] → Accepted:
  `form-ui`'s spec already states the caller-resolves-first rule. This
  change adds no new enforcement for it. That matches the existing pattern
  for `field-preview.ts`'s own caller-side resolution.

## Migration Plan

This change is additive on the wire. `InstanceView` gains a field; this
change removes or renames no field. No stored data changes, no version bump.
Rollback is reverting the commit.

## Open Questions

None. The design considered one open question: whether to reintroduce
`FieldForm`'s `baseLocale` prop. The Decisions section above answers it: no,
resolve the fallback in the caller instead.
