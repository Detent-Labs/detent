## Why

Text kept for a screen reader makes studio pages scroll into blank ground.
`docs/decisions.md` records the defect twice. CHANGES-1: the Checks tab's
hidden "blocking a publish" text pushes a 400px window to 905px of sideways
scroll. FIELDS-2: the Fields tab's hidden rail words push a 720px window to
2272px of downward scroll.

The hidden style takes the page as its containing block. Take a scroll
container that sets no `position`. Text inside it lands where it would stand
unscrolled, and the page grows to reach it.

## What Changes

- Four scroll containers that hold hidden text set `position: relative`. The
  hidden text then lays out inside them, clipped and scrolling with its entry:
  - the studio tab row (`panels/ProcessTabRow.tsx`, `styles.row`)
  - the entity rail (`panels/EntityTabs.tsx`, `styles.rail`), whose Fields tab
    holds hidden text; the Data sources tab shares the style
  - the process surface's tab body (`screens/EditScreen.tsx`,
    `styles.tabBody`)
  - a step form's tab strip (`packages/form-ui/src/FieldForm.tsx`,
    `styles.tabRow`)
- The hidden-text style itself stays as it is in all seven copies. Its text
  keeps its place beside the content it names, where a screen reader's
  reading cursor expects it.
- A source test pins `position: "relative"` on the four container styles, the
  way `studio-guidedSurfaceStyle.test.ts` pins its own layout rules.
- `docs/browser-checks.md` gains a probe that lists every hidden text whose
  nearest scroll container fails to clip it. The Fields view's narrow-width
  Pass line holds again.
- `docs/decisions.md` drops CHANGES-1 and FIELDS-2. It files one older defect
  the review met: content in the tab body paints over the header bar's open
  `⋮` menu.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spa-accessibility`: adds a requirement that text kept for a screen reader
  stays inside the region that holds it. It leaves the document's size alone
  and keeps its place beside what it names.

## Impact

- Code: `packages/web/src/areas/studio/panels/ProcessTabRow.tsx`,
  `packages/web/src/areas/studio/panels/EntityTabs.tsx`,
  `packages/web/src/areas/studio/screens/EditScreen.tsx`,
  `packages/form-ui/src/FieldForm.tsx`. Each gains one style property.
- Test: `packages/web/test/hiddenTextContainment.test.ts`, new.
- Docs: `docs/browser-checks.md`, `docs/decisions.md`.
- No route, no API, no definition contract change, no new dependency. No
  persisted state.
