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

- A hover treatment of its own for destructive controls. They keep the
  secondary control's ink wash.
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
text. It asserts two facts:

- The `.btn-destructive` rule starts after the last `.btn-secondary` rule.
- Every `className` value naming `btn-destructive` also names `btn-secondary`.

That split follows `development-toolchain`'s "A browser check lands as an
assertion or as a checklist entry". This repository produced the defect, and
proposal.md's Why records it with the 2026-09-11 measurement. Both facts read
without a browser.

Whether the accent renders stays a visual judgment. It lands in
`docs/browser-checks.md` as one walk over the ten controls.

Considered: asserting computed colors from a rendered component. The static
renderer, `renderToStaticMarkup`, loads no stylesheet and computes no style.
It cannot see the cascade.

## Risks / Trade-offs

- [A later `.btn-secondary` hover rule sets `color`] → It outranks
  `.btn-destructive` at two classes. The walk checks hover, and the block's
  comment names the constraint.
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
