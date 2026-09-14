## Why

Four findings from the 2026-09-13 Forms tab audits stand open in
`docs/decisions.md`, and the owner picked a direction for each on a mockup.
Below 627px and above 480px, the shell header clips its Account button and
the page scrolls sideways (FORMS-11). At 1100px the form editor squeezes a
field key to one character per line (FORMS-12).

At phone width the Forms tab grid scrolls inside its own box (FORMS-15).
Below about 594px the tab row leaves an open Forms tab partly or wholly out
of view. Nothing tells the author that more tabs lie past its edge (FORMS-16).

## What Changes

- The shell header wraps at every width. The identity span shortens to its
  6rem floor first. Below the header's own minimum, 627px in the studio, the
  account group moves to a second line.
- The area nav no longer grows, and keeps its buttons on one line. A nav
  wider than its line still overflows in the app, admin and reporting
  areas. A new NAV-1 entry in `docs/decisions.md` records where.
- The form editor keeps its preview beside the canvas only above 80rem
  (1280px). At 80rem and below, the preview stands under the palette and the
  canvas.
- The Forms tab grid keeps its own scroll box at phone width. FORMS-15 moves
  to the decided entries, with the owner's reason: the studio targets a
  desktop. The same entry records the process list table, which overflows
  at 480px and below.
- The tab row scrolls the open tab whole into view. It does so on load, on
  every tab change and when the row's own width changes. A late count and a
  Tab-key entry bring the open tab into view too. One function in
  `ProcessTabRow.tsx` does that scroll for every caller. It absorbs the
  focus hand-off's own scroll from commit `a2f551fe`.
- An edge of the tab row fades its tabs out over 24px wherever more tabs lie
  past that edge. The row stays one line. Under forced colors it shows no
  fade.
- New browser checks cover the header from 1440px down to 400px in all four
  areas. They cover the form editor at 1100, 1280 and 1300px, and the tab row
  at 400 and 1440px.
- The record in `docs/decisions.md` drops FORMS-11, FORMS-12 and FORMS-16.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-shell`: the header wraps at every width, in place of the old 30rem
  condition. An item its line cannot hold moves to a further line. Three
  migration requirements drop their
  declaration-for-declaration match for the header's wrap, the area nav's
  growth and the account group. One new requirement states the wrap's order
  and the identity span's floor.
- `studio-form-editor`: one new requirement states the 80rem turn that moves
  the preview under the canvas. Two requirements change with it. They are "A
  live participant preview stands beside the form canvas" and "The form
  editor renders from compiled styles".
- `studio-process-tabs`: two new requirements. The open tab stands whole in
  the row's view. An edge of the row fades where more tabs lie past it.

## Impact

- `packages/web/src/shell/Chrome.tsx` and `packages/web/src/shell/navStyles.ts`,
  which all four areas share.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx` and
  `packages/web/src/areas/studio/panels/FormPreview.tsx`.
- `packages/web/src/areas/studio/panels/ProcessTabRow.tsx` and
  `packages/web/src/areas/studio/screens/EditScreen.tsx`.
- Tests: `studio-processTabRow.test.tsx` and `chrome-header.test.tsx`, plus
  two new source-text files, `shell-headerWrap.test.ts` and
  `studio-narrowWidths.test.ts`.
- Docs: `DESIGN.md`, `docs/current-state.md`, `docs/browser-checks.md`,
  `docs/decisions.md` and `.claude/rules/ui-glossary.md`.
- No engine, schema, HTTP or definition contract change. No catalog key
  joins or leaves.
