## Context

See `proposal.md` - Why. Two facts shape this design.

First, `tokens.css` already exposes an accent ramp
(`--color-accent-400/600/700`) and a `--color-refusal` role. Every one of
them sits on the same red hue. Only the lightness step differs.
`--color-accent-700` and `--color-refusal` render identically in light
mode, at `#ae1800`. In dark mode, `--color-refusal` moves to `#ff9783`.
`--color-accent-700` carries no dark-mode override, so it stays at
`#ae1800`. Detent's studio area draws with one hue plus neutrals today.

Three colored checkboxes need hues this palette does not have yet. The
user confirmed that trade-off is worth making. Distinct hues win over
reusing existing lightness steps of the one hue already in place.

Second, each flag checkbox already carries an `aria-label`. It also keeps
a fixed left-to-right position. That order is `visible`, `required`,
`readonly`, per the "A live cell edits its own view entry inline"
requirement. Color adds a third way to tell the three apart. It replaces
neither of the first two.

## Goals / Non-Goals

**Goals:**
- Three new color tokens, one per `FlagKey`, each distinct in hue from the
  other two and from `--color-accent`/`--color-refusal`.
- Applied through CSS classes keyed on `FlagKey`, never a literal color in
  a component file.
- A legend swatch per token, so the mapping reads directly off the screen.

**Non-Goals:**
- Recoloring the column/row bulk badges. Each badge already carries its
  own `VIS`/`REQ`/`RO` text. Its three squares already read apart from
  each other, unlike the plain checkboxes' three squares. A later change
  can extend these tokens to the badges if that reads as an improvement
  once the checkboxes ship.
- Any change to `setFlag`, the gating rules, or which cells render a
  checkbox versus a CEL stamp versus nothing. Those stay exactly as the
  "A live cell edits its own view entry inline" requirement already states.
- A custom checkbox widget. The native `<input type="checkbox">` stays.
- Coloring an unchecked checkbox. Native `accent-color` tints only the
  checked and indeterminate states. An unchecked control keeps the
  platform default appearance in every evergreen browser, whatever token
  it carries. The three checkboxes' fixed left-to-right order and each
  one's own `aria-label` set an unchecked control apart from its
  neighbors.
- Fixing the `readonly` checkbox's render for a `technical` field. That
  checkbox renders unchecked and uncolored regardless of this change.
  `effectiveFlag`'s `FLAG_DEFAULT.readonly` (`view-flags.ts`) does not
  special-case a technical field's forced `readonly: true`
  (`resolveFields`, `src/runtime/api.ts` around line 493). This is a
  pre-existing render gap this change does not introduce, and closing
  it is out of scope here. The row's own technical-field marker stays
  the intended way to spot the field, not this checkbox's color.

## Decisions

**Three new semantic tokens, not a rename of existing ones.**
Three new tokens, `--color-flag-visible`, `--color-flag-required` and
`--color-flag-readonly`, sit in tokens.css. Each pairs a light-mode
value with a dark-mode override under the
`@media (prefers-color-scheme: dark)` block. Two primitives,
`--stamp-600` and `--refusal-700`, already carry their own dark override
the same way. The three new tokens follow that primitive-tier pattern
directly. A flag color needs no separate primitive layer of its own.

This is a second, deliberate exception to design-language.md's Color
section. That section states a component must never touch a primitive
directly. Here `--color-flag-*` collapses the primitive tier and the
semantic-alias tier into one token per flag. Each flag has exactly one
consumer, so an alias would add indirection with no behavioral gain.

Naming them by function still keeps a `design-language.md` rule intact: a
component reads a semantic role, never a hex. `FieldMatrixGrid.tsx` reads
`--color-flag-required`. It never reads a literal hex.

Alternative considered: reuse the existing accent ramp steps (400/600/700)
plus a neutral, one step per flag. Rejected per the user's choice above.
A matrix checkbox renders small. At that size, three steps of one hue
read as light, medium and dark red. They do not read as three distinct
functions.

**Native `accent-color`, not a repainted checkbox.**
Each checkbox gets one of three classes
(`.studio-matrix-flag-visible/-required/-readonly`), set from the cell's
`FlagKey`. Each class sets only `accent-color: var(--color-flag-<key>)`.
Every evergreen browser supports `accent-color` on a native checkbox, so
this design needs no SVG or `<div>`-based checkbox replacement.

A real-browser check (Chromium, via `playwright-cli`) found that the
native `disabled` attribute defeats this. The browser substitutes its own
muted checkmark for a checked box. That substitution overrides any author
CSS, including opacity. MDN documents the cause: `accent-color` never
paints a browser-suppressed disabled render.

A gated checkbox therefore carries `aria-disabled="true"` instead of the
native `disabled` attribute. The element then stays enabled from the
browser's own point of view, so its `accent-color` keeps painting. The
`onChange` handler returns early while `aria-disabled` reads `true`. The
checkbox also carries `tabIndex={-1}` for that same span. That reuses the
roving-tabindex mechanism `FieldMatrixGrid.tsx` already uses to manage
focus between cells. The control stays the native
`<input type="checkbox">` throughout; only its disabling mechanism
changes.

`.studio-matrix-cell input:disabled { opacity: 0.45 }` retargets to
`.studio-matrix-cell input[aria-disabled="true"]`. The dimming rule then
keys off the new attribute instead of the native one.

A native, non-natively-disabled checkbox still flips its DOM `checked`
property on click, before `onChange` fires. The guarded `onChange` handler
returns early with no state change, so React does not resync the checkbox
on that ground alone. The resync instead comes from the enclosing cell's
`onClick` handler (`FieldMatrixGrid.tsx`, around lines 319-323), which
passes a new `setFocus` object literal on every click. That forces a
re-render, and the re-render redraws the checkbox from its true, unchanged
state. A future change to that handler must keep forcing a re-render on
every click. Otherwise a gated checkbox could flash checked before it
resyncs.

**Color is additive, per WCAG 1.4.1.**
The three checkboxes stay distinguishable with color turned off. Their
fixed `visible`/`required`/`readonly` order in the row is one cue. Their
per-control `aria-label` is a second. This design adds a third, faster cue
on top of those two. It introduces no case where color is the only way to
tell two controls apart.

**Scope stays inside the field matrix.**
The three tokens carry the `--color-flag-*` prefix. They do not fold into
`--color-accent-*`. The form editor's own strip carries the same three
flags and could reuse these tokens later. Keeping the prefix separate
means that reuse stays a deliberate choice, not an inherited default.

## Risks / Trade-offs

- New hues might fail the WCAG 1.4.11 non-text-contrast floor (3:1)
  against `--color-surface` in one color scheme. Each token paints only a
  checkbox's `accent-color` fill and a decorative legend swatch, neither
  one text. The stamp hex hit an analogous contrast failure before.
  Mitigation: pick each token's light/dark pair with a contrast checker
  before merging, the step the stamp-hex fix took. Hold each pair to the
  stricter 4.5:1 text floor too, as a deliberate house target.
- Three new hues stretch the studio area past its current one-hue design
  language. Mitigation: scope the tokens to `--color-flag-*` and to the
  field matrix alone. Add one line to `design-language.md` naming the
  exception, so the decision stays visible instead of silent.
- A developer with a hue-based color vision deficiency may see less
  separation between two of the three tokens. A developer with typical
  vision sees more. Mitigation: the `aria-label` and fixed column order
  stay the controls' primary identification path. Color stays a
  secondary, glanceable one.
- `field-matrix-badge-alignment` is a separate, open change. It touches the
  same `FieldMatrixGrid.tsx` cell-flag markup, including the
  `.studio-matrix-cell-flags` wrapper that `field-matrix-badge-alignment`'s
  task 1.3 changes to a CSS grid. Mitigation: implement this color change
  first. This change's own task 2.2 only adds a class to the existing
  `<input>`, plus new CSS keyed on that class. That composes cleanly under
  either a flex or a grid layout. The sibling change should rebase its
  markup change onto the new per-key classes.

## Migration Plan

No data migration. Deploy is the CSS and component change:
1. Add the three tokens to `tokens.css` (light and dark values).
2. Add the three checkbox classes to `app.css`.
3. Apply the classes in `FieldMatrixGrid.tsx`, keyed on `FlagKey`.
4. Switch each gated checkbox in `FieldMatrixGrid.tsx` from the native
   `disabled` attribute to `aria-disabled="true"` plus an `onChange`
   early-return guard and `tabIndex={-1}`. Retarget
   `.studio-matrix-cell input:disabled` to
   `.studio-matrix-cell input[aria-disabled="true"]` in `app.css`, per
   the accent-color decision above.
5. Add the legend's seventh entry and its three swatches in
   `FieldMatrixPanel.tsx`.
6. Add the one-line exception note to `design-language.md`.

Rollback is a plain revert. No schema, no stored draft, and no published
process definition reads any of these tokens or classes.

## Open Questions

- The exact hue/lightness value for each of the three tokens. This is a
  value choice inside the "three distinct hues, AA-safe in both schemes"
  constraint this design already sets. It changes neither the requirement
  text nor the approach nor the task breakdown. Implementation picks the
  values and verifies contrast at that point.
