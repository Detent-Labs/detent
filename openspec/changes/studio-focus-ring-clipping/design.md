# Design

## Context

See proposal.md for the motivation. `global.css` draws the ring with two
literals: `outline: 2px solid var(--color-accent)` and `outline-offset: 2px`.
A scroll box clips at its padding edge on both axes, even when it scrolls on
one. The four boxes named in the audit set no padding.

| Finding | Box | Scrolls | Clips |
|---|---|---|---|
| RAIL-3 | `StepsRail.tsx` `rail` | block | inline edges, first row's top |
| FIELDS-4 | `EntityTabs.tsx` `rail` and `editor` | block | inline edges |
| CHANGES-2 | `EditScreen.tsx` `tabBody` | block | inline edges |
| ROW-1 | `ProcessTabRow.tsx` `row` | inline | block edges |

Eleven more boxes set `overflow: auto` on one axis. They sit in the studio,
admin and reporting areas. `FieldMatrixGrid.tsx` and `ChangeList.tsx`
already draw their rings at -2px. Their rings stay inside their own boxes.

## Shape brief

The owner confirmed this brief in the 2026-09-23 `/impeccable shape` round.

- **Job:** a keyboard author tabs through the studio. The author sees the
  whole focus ring on every control, the first and last row of a scroll box
  included.
- **Direction:** keep the ring exactly as DESIGN.md states it: 2px accent at a
  2px offset. Give each scroll box room for the ring. Do not inset the ring.
- **Consequence:** content in a padded box moves 4px inward. The tab row
  sizes to its own content. Its block padding makes the row 8px taller and
  the tab body 8px shorter. The rail's right divider and the edge fade stay
  where they were.
- **Untouched:** the field ring at 0 offset, the grid cell ring at -2px and the
  canvas's drawn indicator.

## Goals / Non-Goals

**Goals:**

- One token set drives both the ring and the room it needs.
- Every studio scroll box whose controls take the global ring shows that ring
  in full.

**Non-Goals:**

- The admin and reporting scroll boxes. The browser sweep measures them. A
  clipped one gets a new decisions.md entry and waits for its own change.
- Any other RAIL, FIELDS or CHANGES finding. Those go to the per-screen
  bundles.

## Decisions

**Pad the box, keep the ring.** The owner chose padding over an inset ring.
An inset ring would add a third ring rule to the design language. It would
also overlap the entity rail's 3px current mark.

**Three CSS custom properties in `tokens.css`.** `--focus-ring-width: 2px`,
`--focus-ring-offset: 2px`, and `--focus-ring-reach` as their `calc()` sum.
`global.css` reads the first two. `tokens.css` holds no element selector, so
the unified-shell rule on it still holds. Alternative considered: one literal
`4px` in each box. It drifts the day the ring changes, which is the defect
class the shared token exists to stop.

**One StyleX group `focus` in `form-ui/tokens.stylex.ts`.** It holds
`reach: "var(--focus-ring-reach)"`, beside `space` and `radius`. Every
StyleX box reads `focus.reach`. Alternative considered: reuse `space.s1`,
which is also 4px today. It hides why the gap exists and breaks when
either value moves.

**Pad on all four sides.** Each box takes one `padding: focus.reach` on all
sides at once. A block scroller also clips its first row's top ring edge. The tab
row loses nothing by a 4px inline gap either. One shape at every site is
easier to check than four.

**The open tab's mark moves to a pseudo-element.** Today `tabSelected` in
`ProcessTabRow.tsx` draws the mark as `inset 0 -2px 0` on the tab. That
rule sits flush on the row's 2px divider. A 4px bottom pad on the row would
lift it 4px clear of the divider. The mark therefore moves to the tab's own
`::after`: a 2px accent bar, `focus.reach` below the tab's bottom edge,
with the tab set to `position: relative`. The bar lands flush on the
divider again. It lies inside the row's padding box, so the row does not
clip it. Alternative considered: an outer box shadow offset by the reach.
It paints a 4px bar, twice the mark's width.

The two rails keep their marks as they are. Their 3px current mark sits inside each
row, so it moves inward with the row.

**Sweep the remaining studio boxes in the browser.** Tab through
`ChecksRail`, `FormsTab`, `FormTabStrip`, `StepPage`, `CanvasBar` and
`FormEditorScreen`. Pad each one that clips the same way.

Outcome: the canvas bar's `bar` and the form tab strip's `row` clipped and
now pad by `focus.reach`. The change list's `body` held the "Open …" row
command's pull-back at 400px; its own `paddingInlineStart` now restores
that room. Three boxes, `ChecksRail`, `FormsTab` and `FormEditorScreen`,
already pad past the ring's reach on their own. The step page's own
`page` box sets no block padding. Its first and last controls still clear
the ring, through the masthead's own padding and the developer section's
own padding.

## Risks / Trade-offs

- [A box that already pads, pads 4px more] → Check each box's existing
  padding first. Where it already reaches the ring's reach, leave it.
- [A new form-ui token reads as TS2339 in web typecheck] → Run `bun install`
  inside the container first. Then run `bun run typecheck`.
- [Two top edges drift apart] → The browser check compares the rail's top
  edge with the step page's. It measures both
  before and after the change.

## Migration Plan

None. The change is CSS only. A revert of the commit restores the old
layout.

## Open Questions

None.
