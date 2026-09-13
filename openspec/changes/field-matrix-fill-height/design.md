## Context

See proposal.md for the motivation. This section names the layout chain the
grid sits in.

The screen around the tabs already hands each tab body a definite height. The
chain runs from `.shell` through `EditScreen.tsx`'s `studioEditScreen`,
`surface` and `tabBody` styles. The tab body is a flex column with
`minHeight: 0` and its own vertical scroll. The comment above
`studioEditScreen` records why each zero floor is there.

Inside the tab body, `FieldMatrixPanel` draws one flex column, its `matrix`
style. That column holds the toolbar and whatever `FieldMatrixGrid` returns.
The grid returns a fragment of two siblings. The first is a status line that
collapses to zero height while idle. The second is the scroll region, the
`matrixScroll` style, with `overflow: auto` and `maxHeight: "32rem"`.

The column has no minimum height of its own. A flex item that is not a
scroll container takes its content height as its automatic minimum. So the
column never shrinks, and the 32rem cap is the only thing that stops the grid.
The same passage in `docs/current-state.md` records the cap as a leftover of
the removed dock.

## Goals / Non-Goals

**Goals:**

- The grid takes the height under the toolbar, above a 24rem floor.
- A long grid scrolls inside itself, with the sticky headers working as today.

**Non-Goals:**

- The legend's two lines. A denser toolbar is a separate change.
- The tab body, the tab row, the header bar or any other tab.
- The keyboard model, the scroll region's one tab stop, or its label.

## Shape brief

This section holds the `/impeccable shape` result for the Field matrix tab.

- **Job and audience.** A process author, in Operate mode, scans every field
  against every step. They work on a desktop window and read many rows at
  once.
- **Outcome.** More rows show per window height. The toolbar and its legend
  stay put. The count line and the Hide inert columns control stay one glance
  away.
- **Direction.** The incumbent world stays. DESIGN.md's "The Field Matrix" and
  "Layout" sections hold unchanged. The one hairline frame, the sticky headers
  on paper and the contained overscroll all stay. No token, color or motion
  joins the tab.
- **States and ranges.** A catalog with no field shows words and no grid, as
  today. A grid of a few rows ends under its last row, or at the floor. The
  example `it_offboarding`, 51 fields against 12 steps, fills the height and
  scrolls. A window too short for the floor scrolls the tab body. Below 64rem
  wide the legend wraps, the toolbar grows, and the grid reaches its floor
  sooner.
- **Constraints.** No i18n key, no new component and no JavaScript height
  measurement. The German catalog has no bearing here, since the studio ships
  English only.

## Decisions

### Two style declarations carry the layout

The `matrix` column gains `minHeight: 0`. The `matrixScroll` region drops
`maxHeight: "32rem"` and gains `minHeight: "24rem"`.

The column needs the explicit zero, because its automatic minimum is its content
height. The scroll region needs none. A scroll container's automatic minimum is
already zero, so it shrinks once its parent may shrink. Its flex basis stays
`auto`, which is its content height. So a short grid keeps its own height and
a long one gives way.

Alternatives considered:

- A `flex: 1 1 0` basis on the scroll region. It fills the height every time,
  so a grid of three rows draws a tall empty frame. Rejected.
- No scroll region of its own, with the tab body scrolling instead. The
  sticky headers would then stick to the tab body. A sideways scroll would move
  the toolbar along with the grid. The scroll region's one tab stop from
  `field-matrix-operability` would go too. Rejected.
- A `ResizeObserver` that sets a pixel height. CSS already expresses the rule,
  and a measured height goes stale across a hidden tab. Rejected.

### The floor sits at 24rem

The owner asked for the header plus two or three rows at the floor. A
screenshot of `it_offboarding`'s Field matrix tab measures the parts.

| Part | Height |
|---|---|
| Step header row, labels over three lines, bulk badges under them | 152px |
| `personal_details`, a group row with bulk badges | 102px |
| `full_name`, a field row with bulk badges | 82px |
| `email_address`, a field row whose key wraps | 101px |
| Horizontal scrollbar, 12 columns wide | about 15px |
| Top and bottom frame | 2px |

The header, the first two rows, the scrollbar and the frame sum to about 355px.
A 24rem floor gives 384px, which leaves about 29px of margin. A 20rem floor
gives 320px and cuts the second row.

The Canvas and Steps tabs use 36rem. Their floor serves a drawing area and a
two-column page. The grid needs less than either to stay usable. A laptop
window 768px tall still leaves about 400px under the toolbar, above this floor.

When the window cannot fit the toolbar and the floor, the scroll region
overflows the column. The column draws no border and no fill, so the overflow
shows nothing wrong. The tab body counts that overflow and scrolls.

The implementer does not pick another value. Task 3.5 measures the header and
two rows at the floor. A failed check stops the task and goes back to the
author.

### A source assertion and a browser check share the proof

The `development-toolchain` split rule asks two things of a `bun:test`
assertion. The repository produced the defect, and the assertion observes the
property with no browser. The defect sits at `FieldMatrixGrid.tsx:37`.

The harness lays out nothing, so no assertion reads a height. The repository
already answers that case for the same defect class, though. The test file
`studio-guidedSurfaceStyle.test.ts` guards "the steps rail scrolls, not the
document" by reading the declarations with its `styleBlock` helper. Its header
comment leaves the laid-out height to a browser check.

This change follows that precedent. A new `describe` block in the same file
asserts both declarations. It runs red before the style tasks and green after
them. The entry in `docs/browser-checks.md` then proves the height itself.

## Risks / Trade-offs

- Risk: a grid of two rows, or three under a short header, can run under 24rem.
  Its frame then holds an empty band. Mitigation: accepted. The examples
  `laptop_inventory` and `credit_check` carry two fields and one field.
- Risk: on a short window both the tab body and the grid scroll. Mitigation:
  both regions contain their overscroll, so the wheel stops at the grid's end.
  DESIGN.md's Layout section already states that rule.
- Risk: a hidden tab body lays out nothing. Mitigation: no script measures a
  height. The browser lays the grid out again when the tab opens.
- Risk: the measurements come from one screenshot. Mitigation: task 3.5
  measures the same parts in the built bundle before the floor counts as
  proven.

## Migration Plan

None. The change touches browser styles and one test file. Reverting the commit
restores the 32rem cap.

## Open Questions

None.
