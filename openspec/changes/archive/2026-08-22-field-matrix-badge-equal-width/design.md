## Context

The field matrix draws its three bulk-toggle badges from a fixed map.
`FieldMatrixGrid.tsx` renders `.studio-matrix-flag-badge` once per
eligible flag key. The map prints `VIS` for `visible`, `REQ` for
`required`, and `RO` for `readonly`. `VIS` and `REQ` use three
characters; `RO` uses two. In a monospace face the two three-letter
badges share one width and the two-letter badge renders narrower. The
three badges sit at two widths.

The badges already live in a three-column grid, `.studio-matrix-flags`.
Its tracks read `repeat(3, var(--matrix-flag-col))`.
`.studio-matrix-table` declares that custom property and sized it to
the widest badge, `REQ`, in `field-matrix-badge-alignment`. Each badge
centers in its own track through `justify-items: center`. The grid is
already in place, so this change only needs to equalize the badge
boxes.

## Goals / Non-Goals

**Goals:**
- All three badges render at one shared width.
- Reuse `--matrix-flag-col` as the single source of truth. The badge
  width then cannot drift from the track it sits in.

**Non-Goals:**
- Changing what a badge does, which flags stay eligible, its pressed or
  hover state, or the keyboard model.
- Widening the grid track. The cell checkboxes below share it.
- A new design-system token. Nothing outside this rule needs the value.

## Decisions

**`width`, not `min-width`.** `min-width: var(--matrix-flag-col)` grows
`RO` to the track width. The three-letter badges keep their natural
width, which runs slightly past the track. The badges still sit at two
widths. `width` forces all three to one box. The three-letter label
already fits the value. Any sub-pixel overflow lands in the badge's own
padding, not past its border.

**Reuse `--matrix-flag-col`.** The value already exists on
`.studio-matrix-table` and already equals the widest badge. A new
literal or token would declare one width twice. That is the exact gap
`field-matrix-badge-alignment` removed for the grid tracks.

**`text-align: center`.** The `<button>` default is center and no reset
overrides it. The property appears anyway for clarity. These are
fixed-width badges holding a two- or three-character code, centered in
a fixed track. They are not wide buttons whose labels sit flush left
per `design-language.md`. A left-aligned `RO` would hug one edge of a
wider box and look broken. With centered text, the badge reads as a
member of the group.

**No automated test.** The change touches computed CSS width only. The
`bun:test` and jsdom setup cannot observe it, because jsdom does no
layout. The earlier badge change's `renderToStaticMarkup` test asserted
DOM structure, a slot count. This change alters no DOM. A manual
browser-check step covers the width.

## Risks / Trade-offs

- **A wider future label would not fit.** `FLAG_KEYS` is a fixed
  three-entry array. The map hardcodes the badge letters as English
  abbreviations, not catalog strings. A fourth flag key or a longer
  abbreviation is a contract or catalog change that revisits this grid
  anyway. The widest badge fits the width today.
- **No locale drift.** The visible letters are `FLAG_LETTER` constants.
  Only the badges' `aria-label` and `title` come from the catalog. The
  width never depends on a localized label.

## Migration Plan

One CSS declaration, no data migration. It ships in one deploy with no
feature flag. Both mounts that draw bulk badges adopt it the next time
they render. The canvas dock's Field matrix tab draws no badge, so it
stays unchanged.

## Open Questions

None. The decisions above settle the width source, the `width` choice,
and the centering.
