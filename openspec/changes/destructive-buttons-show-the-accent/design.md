## Context

The shared stylesheet `packages/web/src/shell/tokens.css` holds the `.btn`
family as literal classes. The `web-styling` requirement "A shared class stays
literal until its last consumer migrates" keeps them there. The reset in
`global.css` gives `button` no border and an inherited color. It sets no
background.

The cascade today, in source order:

- `.btn` (line 123): layout, type, a transparent 1px border, no background.
- `.btn-destructive` (line 144): the accent `border-color` and `color`.
- `.btn-secondary` (line 162): a transparent background, the ink `color`, the
  divider `border-color`.
- `.btn-secondary:hover` and `:active` (lines 168 and 172): an ink wash, on the
  background alone.

Each of the first three selectors weighs one class, so source order settles
every tie. See proposal.md's Why for what that does at the call sites.

The requirement lands in `web-styling`, the capability that owns the rules for
literal shared classes.

No `/impeccable shape` ran. Only the main checkout carries that skill, and
this worktree lacks it. It would have had nothing to decide either. The
Destructive entry in `DESIGN.md` fixes the look, and
`.claude/rules/design-language.md` repeats it. This change restores a
specified treatment and invents none.

## Goals / Non-Goals

**Goals:**

- Every destructive control renders the accent text and border that
  `DESIGN.md` specifies, in every area.
- A test fails as soon as anyone reorders the rules or adds an unpaired call
  site.

**Non-Goals:**

- A hover wash of its own for destructive controls. They keep the secondary
  control's ink wash, and only their text and border change.
- Moving the `.btn` family to compiled styles. The family stays literal
  permanently, as `docs/decisions.md` records.
- Deciding again which actions count as destructive. The ten call sites keep
  their role.

## Decisions

### Move the block rather than raise its specificity

The `.btn-destructive` block moves below `.btn-secondary:active`. Source order
then settles the tie in its favour. Its comment gains one sentence naming that
constraint and the test that pins it.

Considered: `.btn.btn-destructive` wins without moving. It weighs two classes,
though, the same as `.btn-secondary:hover`. That works today only because the
hover rule sets no color, and a later one that does would win silently.
Moving keeps every family member at one class, which is the file's own pattern.

### Hover and press read the accent step for a tinted ground

The secondary control's washes tint the ground under the accent text. The
plain accent then falls under the 4.5:1 text minimum. Each figure below mixes
the wash in sRGB over the ground. In light, `--color-accent` (`#d42b11`) reads
4.53:1 at rest, 3.95:1 on the 7% hover wash and 3.43:1 on the 14% pressed
wash. In dark, `#ff563c` reads 5.26:1, 4.35:1 and 3.49:1.

On 2026-09-11 the owner chose `--color-accent-on-muted` for hover and press.
One `.btn-destructive:hover, .btn-destructive:active` rule sets text and border
to it. The wash stays, and the rest state keeps the plain accent. The token
picks a step per scheme. In light, `#ae1800` reads 5.60:1 on hover and 4.86:1
pressed. In dark, `#ff9783` reads 6.54:1 and 5.25:1.

The primary control already changes its accent step under the pointer. Its
background reads `--color-accent-600` on hover and `--color-accent-700`
pressed.

Considered:

- The token in every state. It clears rest too, at 6.41:1 in light and 7.91:1
  in dark. It departs from `DESIGN.md`, whose destructive button reads
  `stamp-600` at rest.
- `--color-accent-600`, the primary control's hover step. It fails in dark, at
  2.90:1 on hover and 2.32:1 pressed.
- Leaving the gap. That keeps a WCAG 1.4.3 shortfall on ten controls.

### Pair the two unpaired call sites

The two unpaired call sites, `ProcessHeaderBar.tsx:571` and
`CanvasBar.tsx:394`, gain `btn-secondary`. The Destructive entry in
`DESIGN.md` says the treatment rides alongside secondary. Eight of the ten call
sites already follow it.

Considered: a complete `.btn-destructive`, with its own transparent background
and hover wash, and `btn-secondary` dropped everywhere. That touches all ten
call sites and `DESIGN.md`, for the same rendered result.

### A source-reading test, and a browser walk for the look

One `bun:test` file reads `tokens.css` and the `packages/web/src` sources as
text. It asserts three facts:

- The `.btn-destructive` rule starts after the last `.btn-secondary` rule.
- The `.btn-destructive:hover` and `:active` rule starts after it too, and
  sets text and border to `--color-accent-on-muted`.
- Every `className` value naming `btn-destructive` also names `btn-secondary`.

That split follows `development-toolchain`'s "A browser check lands as an
assertion or as a checklist entry". This repository produced the defect, and
proposal.md's Why records it with the 2026-09-11 measurement. All three facts
read without a browser.

Whether the accent renders stays a visual judgment. It lands in
`docs/browser-checks.md` as one walk over the ten controls.

Considered: asserting computed colors from a rendered component. The static
renderer, `renderToStaticMarkup`, loads no stylesheet and computes no style.
It cannot see the cascade.

## Risks / Trade-offs

- [A later `.btn-secondary` hover rule sets `color`] → It ties
  `.btn-destructive:hover` at two classes, and source order settles the tie.
  The test pins the hover rule after every `.btn-secondary` rule.
- [Accent text on the dark scheme's surface] → `.btn-ghost` already sets the
  same accent text on the same grounds. The walk runs once per scheme.
- [Discard draft loses its fill] → The stylesheet leaves it the browser's own
  button background today. Losing that fill is the fix. The walk confirms it.
- [Both controls in the draft confirmation dialog read in the accent] → Its
  Cancel carries `btn-ghost`, whose text is the accent too. Only the border
  sets Discard draft apart. The walk judges whether the two read apart.

## Migration Plan

Nothing migrates. The change touches no data and no definition contract. No
stored state changes either. The next build ships it. A rollback reverts its
commits.

## Open Questions

None.
