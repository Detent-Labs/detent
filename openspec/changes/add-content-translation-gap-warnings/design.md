## Context

See `proposal.md` - Why. Full background and the brainstorm that produced
this design lives at
`docs/superpowers/specs/2026-08-05-content-translation-ui-design.md`; this
document extracts the technical decisions from it.

Three facts from the existing studio area drive the approach:

- `contentLocale` is single, global draft state (`useDraft()`). Switching
  it already re-renders every `LocalizedTextInput` in every open panel
  against the new locale.
- `collectUsedLocales` already walks every `LocalizedText` position in a
  draft. That walk covers:
  - the process label and description
  - each step's label and description
  - each field's label and description, recursing into `group` sub-fields
  - each field option's label
- Two sibling non-blocking warnings already exist:
  `assignmentWarningLogic.ts::assignmentWarning` and
  `dataListKeysLogic.ts::unknownListKeyWarning`. Both are pure functions
  rendered as a `studio-warning` paragraph, outside the
  `EditorIssue`/`IssueList` system.

## Goals / Non-Goals

See `proposal.md` - Capabilities, and the design's own Non-goals section,
for the full list. Two boundaries at the design level: no jump-to-field
navigation, since switching `contentLocale` already relocates every input.
No new component for the switcher's badge, since a native `<select>`
`<option>`'s own text carries it.

## Decisions

### Shared entry walk, not a second traversal

This design extracts `collectUsedLocales`'s walk into
`forEachLocalizedEntry(draft, visit)`. Both `collectUsedLocales` and the
two new functions call it:

```ts
function forEachLocalizedEntry(draft: Draft, visit: (entry: DraftLocalizedText) => void): void {
  visit(draft.label);
  visit(draft.description);
  for (const step of draft.workflow?.steps ?? []) {
    visit(step.label);
    visit(step.description);
  }
  for (const field of draftFields(draft)) {
    visit(field.label);
    visit(field.description);
    for (const option of field.options ?? []) visit(option.label);
  }
}
```

Alternative considered: keep two independent walks. Rejected. The two
would drift the moment someone adds a new `LocalizedText` position, a
future process-level `description` editor for instance. Only one of the
two would get updated.

### `localeGapCount`: counts only entries that already satisfy the base-locale invariant

```ts
export function localeGapCount(draft: Draft, locale: string): number {
  const baseLocale = draft.baseLocale ?? "en";
  if (locale === baseLocale) return 0;
  let count = 0;
  forEachLocalizedEntry(draft, (entry) => {
    if (entry?.[baseLocale] && !entry?.[locale]) count++;
  });
  return count;
}
```

An entry with no base-locale text yet is already flagged by the existing
`EditorIssue`. Counting it again here, as a gap for every other locale,
would double-report the same entry under a different label. Alternative
considered: count every entry missing the target locale, base-locale
status aside. Rejected for that double-report reason.

### `missingTranslationWarning`: same shape as `assignmentWarning`

```ts
export function missingTranslationWarning(
  entry: DraftLocalizedText,
  locale: string,
  baseLocale: string,
): string | undefined {
  if (locale === baseLocale) return undefined;
  if (!entry?.[baseLocale]) return undefined;
  if (entry?.[locale]) return undefined;
  return `Missing translation for "${locale}".`;
}
```

Takes primitive values, not a whole `Draft` or `Step`. This matches
`assignmentWarning`'s own `(terminal, assignment)` shape. Each render site
passes only what it already has in scope. Both stay directly testable,
with no full draft to construct.

### Rendering sites

Five existing `LocalizedTextInput` call sites each render
`missingTranslationWarning(...)` directly underneath, the way
`StepsPanel.tsx` already renders `assignmentWarning`:

| Entity | File | Entry |
|---|---|---|
| Process label | `screens/EditScreen.tsx` | `draft.label` |
| Step label | `panels/StepsPanel.tsx` | `step.label` |
| Step description | `panels/StepsPanel.tsx` | `step.description` |
| Field label | `panels/FieldCatalogPanel.tsx` | `field.label` |
| Field description | `panels/FieldCatalogPanel.tsx` | `field.description` |
| Option label | `panels/FieldCatalogPanel.tsx` | `option.label` |

Process `description` has no `LocalizedTextInput` render site today, even
though `collectUsedLocales` already counts its locale keys. That gap
predates this change. It gets no warning site here, since it has no editor
to put one under.

`ContentLocaleSwitcher` renders each `<option>` with a
`localeGapCount(draft, code) > 0 ? \` (${count} missing)\` : ""` suffix,
needing `draft` added to its existing `useDraft()` destructure.

Message text stays a raw string literal, not a `catalog.ts` lookup. This
matches the studio's fixed-English UI-chrome decision
(`collapse-editor-i18n`), and both sibling warnings' own choice.

## Risks / Trade-offs

- [Risk] `localeGapCount` re-walks the whole draft once per used locale.
  It does this on every render of `ContentLocaleSwitcher`.

  → Mitigation: at realistic process sizes this costs a few hundred
  comparisons. `runValidation` already redoes that much work on every
  draft change. This design adds no memoization. A `ponytail:` comment
  marks the upgrade path, for a process large enough to make this
  measurable.
- [Risk] Process-level `description` stays unbranded by this warning,
  since it has no editor. → Mitigation: none needed here. Giving it an
  editor is a separate, unrelated change. It counts as a known
  pre-existing gap, one this change did not introduce.

## Migration Plan

Additive, browser-side only. No schema, route, or `definitionHash` input
change. A draft with every locale fully translated renders no new badge
and no new warning.

## Open Questions

None. The brainstorm resolved scope, placement, and the warning pattern to
follow before this document.
