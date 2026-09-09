## Why

The studio's area nav carries a "Checks" control (`DraftNavControls.tsx`,
`ChecksRail`'s `collapsed` form) beside Save, Discard draft and Publish. A
live test against the Checks tab in the tab row, directly below it, settled
what it does. Both controls resolve to the identical `goToTab("checks")`
navigation. Neither does anything else.

The area nav control is a second way to reach the same tab. It only offers
a second path to the same destination. Its only real distinguishing
behavior is passive: it recolors when a blocking issue exists. The tab
row's own "Checks N" count stays a plain, uncolored digit there, like every
other tab's count.

A second control can carry only a color. The first control could carry that
color itself. Such a control does not earn its own place in the nav.

## What Changes

- <!-- antislop: allow synonym-rotation -->
  <!-- "Discard" here names only the fixed "Discard draft" button label, never a word choice competing with "remove"; every occurrence in this file pairs it with "draft". -->
  Remove the Checks control from the studio's area nav.

  While a draft is open, the area nav then stands empty of draft
  controls. The header bar carries the draft's own three instead.

  **BREAKING** for anyone relying on the area nav's Checks control as a
  reachability path or an accessibility landmark. The Checks tab remains
  reachable via the tab row exactly as it is today.
- The tab row's own "Checks" count takes over the severity signal the area
  nav control used to carry alone. It SHALL read in the blocker color when
  `validation.issues[]`'s worst open issue is a blocker. It SHALL read in
  its ordinary color otherwise. No other tab's count gains color. This
  stays specific to Checks, the one tab whose count already doubles as a
  publish-readiness signal.
- Retire `ChecksRail`'s `collapsed` prop and rendering branch. The component
  keeps exactly one form: the full, grouped-by-source list that stands in
  the Checks tab body. The `narrowedTo`/`onShowEvery` machinery and the
  per-entity `IssueList` placements stay as they are. Only the collapsed
  one-line summary goes away, along with its held-back indicator and its
  own accessible-name sentence (`checksRail.summary*` catalog keys).
- Change the doc comments in `DraftNavControls.tsx`, `ChecksRail.tsx`,
  `draft/process-tabs.ts`, `root.tsx` and `ProcessHeaderBar.tsx`. Each
  currently documents the removed control and the plain-count tab as the
  intended design. Change `.claude/rules/ui-glossary.md`'s process-surface
  section to match. It should state the empty area nav, and the rail's one
  form.
- Rewrite `docs/authoring-guide.md`'s paragraph describing the four-control
  area nav and the Checks control's dot-and-count behavior (lines 779-782),
  in the same commit. CLAUDE.md's own rule requires this. An OpenSpec
  change that changes a rule this guide states must change the guide in
  the same commit.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-process-tabs`: the area nav stands empty of draft controls now.
  Checks was the last one it held. The Checks tab's own count carries a
  state color instead, reading the worst open issue. No other tab's count
  does that.
- `studio-checks-rail`: this change drops the rail's collapsed one-line
  summary, and the area nav site that hosted it. The rail has one form: the
  full grouped list, which stands only in the Checks tab. Every requirement
  describing the collapsed form's behavior is gone now, or folded into the
  Checks tab's own count instead. That covers its count, its held-back
  indicator, its state dot, its accessible name, and its docking history.

## Impact

- `packages/web/src/areas/studio/panels/DraftNavControls.tsx`: remove the
  file. The `ChecksRail` mount was its whole body, so nothing remains once
  that goes. `root.tsx` drops the element it reserved for it.
- `packages/web/src/areas/studio/panels/ChecksRail.tsx`: drop the
  `collapsed`/`onOpen` prop pair and the collapsed rendering branch and
  styles.
- `packages/web/src/areas/studio/panels/ProcessTabRow.tsx`: a new
  `checksBlocked` prop and a `tabCountBlocker` style, applied to the Checks
  tab's count only.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: drop the
  `onOpenChecks` wiring into `DraftNavControls`. Compute `checksBlocked`
  beside the existing `processTabCounts(...)` call, reading
  `checksDotState` and `groupChecksBySource` the same way
  `DraftNavControls.tsx` already does today. Pass `checksBlocked` to
  `ProcessTabRow`. `goToTab("checks")` itself stays. An author now reaches
  it only from the tab row.

  The existing per-entity "opens the tab that owns its subject" placements
  reach it too. `draft/process-tabs.ts` itself stays as it is.
  `processTabCounts` keeps returning a plain number.
- `packages/web/src/i18n/catalogs/studio.ts` (not
  `areas/studio/catalog.ts`, which only re-exports the lookup function):
  remove the `checksRail.summary*` and related collapsed-only keys that no
  longer render anywhere. Keep every key the full grouped list still uses.
- Tests covering the removed collapsed form (component tests for
  `DraftNavControls`/`ChecksRail`, any a11y test asserting the area nav's
  Checks control) move to cover the tab row's colored count instead.
  `studio-processTabRow.test.tsx`'s render helper also needs the new
  required `checksBlocked` prop, independent of anything this change removes.
- `docs/browser-checks.md`: a new manual entry for the count's color.
  `development-toolchain`'s split rule applies here. This is a new visual
  behavior, and this repository has never produced this bug before. So it
  cannot become a `bun:test` assertion.
- `.claude/rules/ui-glossary.md`: the process-surface table and the
  area-nav prose, plus the checks rail's "two forms" wording.
- `packages/web/src/areas/studio/root.tsx`,
  `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` and
  `packages/web/src/areas/studio/screens/EditScreen.tsx` (found during
  implementation, beyond the review's list): doc comments each naming
  "four" area-nav controls including Checks.
- `docs/authoring-guide.md`: the four-control/dot-and-count paragraph.
- `docs/current-state.md` (advisory, not gated per CLAUDE.md, but touched
  by this change directly): the passage naming `DraftNavControls` and
  `checksDotState`. That passage described the area nav's own control set,
  and the state dot `checksDotState` decided for it.
- This change leaves the engine, schema, and definition-contract code
  alone. It leaves `packages/form-ui` and every non-studio area alone too.
