## Context

See `proposal.md` for the "why". `PathsPanel.tsx`'s path row currently
renders `key`, `label` and `to` as three bare `<label>text<input></label>`
pairs (lines ~177-204). `StepPage.tsx`'s masthead already carries the
target pattern. `styles.fieldLabel` is a flex column with a 4px gap.
`styles.fieldLabelText` is an 11px uppercase span. `styles.monoInput` gives
the `key` field alone a mono face at 0.8rem. `global.css`'s `input, select`
rule already gives every `<input>` and `<select>` the same 1px hairline
border. It gives them the same paper background and 8px padding too. A
`search_code`/grep sweep across `packages/web/src/areas/studio` found no
styled select anywhere in the studio today.

`/impeccable shape` resolved the open question. This is a component-level
addition inside Detent's fixed visual system: zero radius, hairline
borders, mono for machine values. It is neither a new surface nor a new
visual world. It follows the "Extend an existing surface" path instead: no
concept tournament, no comp round. Asked how far the `to` select's fix
should go, the user picked the larger scope. The user chose a durable
"studio select" component recorded in `DESIGN.md`. It applies to every
select `PathsPanel.tsx` renders.

## Goals / Non-Goals

**Goals:**

- Reorder the path row's `label`/`key`/`to` fields and give `label`/`key`
  the Step masthead's stacked field treatment.
- Define one studio select component: a native `<select>` with its UA
  chevron replaced by a decorative Lucide `ChevronDown`. Apply it to both
  `to` selects `PathsPanel.tsx` already renders.
- Record the select component in `DESIGN.md` and
  `.claude/rules/design-language.md` as the pattern a studio `<select>`
  adopts the next time a future change touches its own file.

**Non-Goals:**

- Retrofitting every other `<select>` in the app (admin, app, reporting
  areas) in this change. Those adopt the pattern when a later change
  touches their own file.
- Any change to `Path.key`/`Path.label`/`Path.to`'s runtime behavior, the
  path-creation default derivation, or any other requirement `studio-canvas`
  already states. Only the rendered markup and styles change.

## Decisions

**Field order and stacking reuse `StepPage.tsx` verbatim.**

`fieldLabel`, `fieldLabelText` and `monoInput` are already the Step
masthead's compiled styles. `design-language.md`'s "Rules for building"
section keeps each component's compiled styles beside its own module.
StyleX styles therefore never cross a module boundary. `PathsPanel.tsx`
copies the three declarations into its own `styles.create()` call instead
of importing them. Copying three declarations is simpler than extracting a
shared module for them. This also matches how this same file's
`studioSegmented`/`studioOnlyWhen` already mirror `StepPage.tsx`'s
`segmented`/`segmentedLegend` pattern; see the file's own comments on those
styles.

**The select's arrow is CSS, not a wrapped React component.**

A native `<select>` cannot host a child React node inside its own box. The
standard way to replace its UA chevron is `appearance: none` on the
select. A decorative icon then layers over it through a positioned
wrapper. The wrapper is a plain `<span>` with `position: relative`. It
holds the `<select>` and a `<ChevronDown size={18} strokeWidth={1.75}
aria-hidden="true" />` set to `position: absolute` at its trailing edge.

The icon takes `pointer-events: none` so clicks still reach the select
underneath. This reuses the exact `ChevronDown` import
`CanvasBar.tsx`, `CanvasView.tsx`, `ChangeList.tsx` and `StepsRail.tsx`
already use for other studio chevrons, at the same 18px/1.75 stroke. It
rules out an inline SVG or a Unicode glyph.

**The glyph color is slate (`colors.textMuted`).**

Ink and the accent stay unused here. The slate matches `StepsRail.tsx`'s
own decorative chevrons, `styles.move`'s `color: colors.textMuted`. It
also matches the field label's own slate. `design-language.md` reserves
the accent as a stamp and a selection mark. A purely decorative
disclosure glyph is neither.

**The select keeps its existing global border and background.**

Only the `appearance` and the end padding change locally. `global.css`'s
`input, select` rule already gives the control DESIGN.md's field
treatment: 1px hairline, paper ground, 8px padding. The local style adds
only `appearance: none` and enough `paddingInlineEnd` to keep option text
clear of the overlaid icon. No rule this change did not ask to touch
moves.

**No new dependency.**

`lucide-react` is already a project dependency. `ChevronDown` is already
imported in four other studio files.

## Risks / Trade-offs

[A wrapper `<span>` around each `<select>` adds one DOM node per select] →
mitigation: the wrapper has no border, background or padding. It is
layout-only (`position: relative`). It changes no rendered box DESIGN.md's
field rule governs.

[`appearance: none` on `<select>` drops the native dropdown affordance in
some older browsers] → mitigation: `global.css` already overrides UA
chrome on the same selector. Its `input, select { border-radius:
var(--radius-md) }` rule does it today. The project's supported browser
set already relies on that override. This change does not need new
browser-support work.

## Migration Plan

No data or runtime migration. The change is UI-only:

1. Change `PathsPanel.tsx`'s markup and `styles` object.
2. Change `DESIGN.md`'s `components:` block and
   `.claude/rules/design-language.md`'s "Fields" section to record the new
   select component. `CLAUDE.md` requires the two files to change
   together.
3. Sync the `studio-canvas` delta spec (already written) into the main
   spec at archive.
4. Browser-check the Paths tab (`/impeccable critique` and
   `/impeccable audit`) per `CLAUDE.md`'s UI-work rule.
   `docs/browser-checks.md` and the automated gates never render a page.

## Open Questions

None. This design settles the task brief's one open question: how far the
`to` select's restyle should go.
