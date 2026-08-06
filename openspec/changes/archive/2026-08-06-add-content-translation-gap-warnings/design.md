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
  baseLocale: string | undefined,
): string | undefined {
  const base = baseLocale ?? "en";
  if (locale === base) return undefined;
  if (!entry?.[base]) return undefined;
  if (entry?.[locale]) return undefined;
  return `No ${locale} translation yet. Publishing still works; a reader of ${locale} sees the ${base} text.`;
}
```

The text names the consequence. It closes with "Publishing still works",
the way both sibling warnings do. A bare "Missing translation" leaves one
question open: does publishing still work? That is the question a
non-blocking warning exists to answer. `resolveDraftLocalizedText` falls
back to the base-locale entry. The second clause states what a reader
gets.

Takes primitive values, not a whole `Draft` or `Step`. This matches
`assignmentWarning`'s own `(terminal, assignment)` shape. Each render site
passes only what it already has in scope. Both stay directly testable,
with no full draft to construct.

`baseLocale` accepts `undefined`. The function applies the `"en"` fallback
itself. `Draft` is `DraftOf<AuthoredProcessBody>` (`draft/types.ts`), which
makes every property optional. `draft.baseLocale` therefore has the type
`string | undefined`. Each render site holds that value and nothing
narrower. A `baseLocale` typed `string` fails `strict` at all six sites.

The fallback is the one `collectUsedLocales` and `DraftProvider` already
apply to the same property. `localeGapCount` above applies it too. Both
functions read the same base locale in a draft that declares none.
`assignmentWarning(terminal: boolean | undefined, ...)` accepts an absent
value the same way.

### Rendering sites

Six existing `LocalizedTextInput` call sites each render
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

The warning renders after the closing `</label>`, never inside it. Five of
the six inputs sit inside a `<label>` element, which takes phrasing content
alone. A `<p>` is flow content, so a warning nested there is invalid markup.
The `assignmentWarning` precedent this design follows sits outside any
`<label>` already, next to `PluginEnvelopeEditor`.

A `<div>` around each
input and its warning answers the same question with a second mechanism.
It also adds a level of markup. The warning goes after the label instead.

Process `description` has no `LocalizedTextInput` render site today, even
though `collectUsedLocales` already counts its locale keys. That gap
predates this change. It gets no warning site here, since it has no editor
to put one under.

`ContentLocaleSwitcher` renders each `<option>` with a suffix built from
`localeGapCount(draft, code)`, omitted at a count of zero. It needs `draft`
added to its existing `useDraft()` destructure. `FieldRow` needs the same
addition: it destructures `contentLocale` alone today.

Both message texts stay raw string literals, not `catalog.ts` lookups. This
matches the studio's fixed-English UI-chrome decision
(`collapse-editor-i18n`), and both sibling warnings' own choice.

The switcher's suffix keeps the literal for a second reason. `t(key)`
returns a fixed string and interpolates nothing. A count cannot pass
through it. Both ways around that are worse than a literal. Interpolation
in `t` builds a mechanism for one string. A suffix assembled from a catalog
fragment and a number breaks another rule. The design language forbids
building a sentence out of pieces.

The studio already settled this. Every interpolated string a person reads
there is a literal. `PluginEnvelopeEditor` has `min ${n} chars`,
`ProcessesScreen` its published-version line, `TemplatesScreen` its version
label. The catalog carries the fixed strings. A string with a value in it
stays beside its call site.

## Risks / Trade-offs

- [Risk] `localeGapCount` re-walks the whole draft once per used locale.
  It does this on every render of `ContentLocaleSwitcher`.

  → Mitigation: at realistic process sizes this costs a few hundred
  comparisons. `runValidation` already redoes that much work on every
  draft change. This design adds no memoization. A `ponytail:` comment
  marks the upgrade path, for a process large enough to make this
  measurable.

  That comment lands in `packages/`, which the `ponytail-ledger-fresh` gate
  reads. `scripts/gates/ponytail-ledger.sh` compares `PONYTAIL-DEBT.md`
  against every file that holds a marker under `src` and `packages`. The new
  marker makes the ledger stale, so `scripts/ponytail-ledgers.sh` runs
  before the push. The ledger is a local file. This worktree carries none,
  so the gate stays quiet here and rejects on a machine that has one.
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
