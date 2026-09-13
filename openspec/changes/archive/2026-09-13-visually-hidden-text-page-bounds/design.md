## Context

See `proposal.md` for the defect. Seven style copies carry the hidden-text
recipe: `position: absolute`, a 1px box, `overflow: hidden`, and
`clip-path: inset(50%)`. The reporting area's `srOnly` clips with `clip`
instead. The copies sit in `ProcessTabRow.tsx`, `EntityTabs.tsx`,
`ChangeList.tsx`, `PlayerScreen.tsx`, the app area's `TaskScreen.tsx`,
`form-ui`'s `FieldForm.tsx` and `ReportBuilderScreen.tsx`.

A box with `position: absolute` and no inset keeps its static position. Its
containing block is the nearest positioned ancestor, or the page when none
exists. A scroll container clips a descendant only when that container, or
something inside it, is the descendant's containing block. An unpositioned
scroll container therefore neither clips its hidden text nor scrolls it. The
text stays where it would stand at scroll offset zero, and the document grows
to hold it.

A browser probe measured every screen on 2026-09-13, at 1280x720 and 400x800.
It covered each process-surface tab, the form editor, the Player, the Versions
screen, a task screen and the report builder. It flagged three offending scroll
containers:

| Container | Hidden text it holds | Document `scrollWidth`/`scrollHeight` |
|---|---|---|
| `ProcessTabRow.tsx` `styles.row` | the Checks tab's "blocking a publish" | `scrollWidth` 900–912 at 400px, every tab |
| `EntityTabs.tsx` `styles.rail` | 95 kind words and group names, plus the move live region | `scrollHeight` 2306 at 1280x720, 2539 at 400x800 |
| `EditScreen.tsx` `styles.tabBody` | the change list's "Before:"/"After:" | `scrollHeight` 849 at 400x800 |

`FieldForm.tsx`'s `styles.tabRow` scrolls sideways. A tab there holds a hidden
count of its fields that failed validation. The probe met no tab with a count.
This fourth case rests on the same mechanism instead of a measurement.

The change list's Developer view box already sets `position: relative` beside
`overflowX: auto` (`ChangeList.tsx` `styles.developerBox`). Its hidden labels
measured as contained.

## Goals / Non-Goals

**Goals:**
- No hidden text grows the document, on any screen the probe reaches.
- Hidden text keeps its static position beside the content it names.
- The four fixed containers cannot silently lose the property again.

**Non-Goals:**
- Merging the seven style copies into one. `design-language.md` lets an area
  keep its own copy. The defect lives in the containers, and each copy is
  sound.
- CHANGES-2's focus-ring clipping at the tab body's edges. It is its own
  finding, and `position` on the tab body leaves clipping as it stands.
- The Versions screen's 437px table width at 400px (CHANGES-3). Visible content
  causes that one.

## Decisions

### D1. Position the scroll container and leave the hidden text alone

Each offending scroll container sets `position: "relative"`. The hidden text
then takes that container as its containing block. The container clips it and
scrolls it with the entry it belongs to.

Rejected: an inset of 0 on the hidden style (`insetBlockStart: 0`,
`insetInlineStart: 0`). It is the smaller diff, and one copy-wide rule could
guard it. It pins every hidden text to its containing block's corner, which is
often the page's top left. NVDA's browse mode and VoiceOver scroll the view to
the text the reading cursor lands on.

The change list's "Before:" and "After:" read as text of their own inside a
`dd`. Pinned to the page corner, they would pull the view to the top and back.
Hidden text inside a control's name reaches the reader with that control. The
change list's copy alone still rules the inset out. The container fix keeps the
text in place. `ChangeList.tsx`'s Developer view box already follows it.

`position: relative` with no inset moves nothing visible. With no `z-index`, it
creates no stacking context. Only hidden text changes its containing block:
- `CanvasView.tsx`'s absolute toolbar, marquee and reject message sit under its
  own positioned `styles.wrap`.
- `CanvasBar.tsx`'s menu is a top-layer popover. Its drag ghost sets
  `position: fixed`.
- `FieldMatrixGrid.tsx`'s sticky headers resolve against their own scroll box.
  Only their `offsetParent` moves, and no source reads it.
- `ProcessHeaderBar.tsx`'s menu panel sets `zIndex: 1` and stays on top.

Measured 2026-09-13 with the property set inline: every such element kept its
coordinates, and the menu panel kept every hit point.

### D2. The four containers

`ProcessTabRow.tsx` `styles.row`, `EntityTabs.tsx` `styles.rail`,
`EditScreen.tsx` `styles.tabBody` and `FieldForm.tsx` `styles.tabRow`. The
probe measured the first three. The fourth follows from the same mechanism. Its
hidden count renders only once a tab holds a field that failed validation.

`styles.tabBody` covers any tab body whose hidden text has no closer scroll
container. That is the Changes tab today. `styles.rail` still needs its own
property. Without it, a rail entry below the rail's fold would stretch the tab
body's scroll area into blank ground.

Each property carries a one-line comment naming the hidden text it contains,
in the file's own comment density.

### D3. A source test for the four, a browser probe for the class

`bun:test` cannot lay out a page, so it cannot see containment. The repo
already guards layout rules at the source:
`studio-guidedSurfaceStyle.test.ts` reads a file and matches a pattern. A new
`packages/web/test/hiddenTextContainment.test.ts` reads the four files. It cuts
out each named style block and asserts `position: "relative"` inside it, after
stripping comments. It fails once a later commit drops the property.

The class of defect is a new scroll container around hidden text. Only a
browser sees that one. `docs/browser-checks.md` gains the probe this design's
measurement used. It lists every hidden text whose `offsetParent` is neither
its nearest clipping ancestor nor inside it. A clipping ancestor is any
ancestor whose computed `overflow-x` or `overflow-y` reads `auto`, `scroll`,
`hidden` or `clip`. The probe passes on an empty list.

### D4. Design skills

Nothing visible moves, so `/impeccable shape` has no layout to decide. The
design detector runs on the four files from the CLI, after a positive control.
The hook that runs after each file write does nothing in this worktree.
`/impeccable critique` and `/impeccable audit` run on the process surface at
400px. They also run on the Task screen of a `purchase-requisition` instance at
Finance Review. That participant route draws `FieldForm`'s tab strip.

## Risks / Trade-offs

- [A later popover with `position: absolute` inside one of the four containers
  would clip to it] → none exists today. Such a popover belongs in a dialog or
  a positioned wrapper outside the scroll box, as `ProcessHeaderBar.tsx`'s menu
  already does.
- [A new scroll container around hidden text reintroduces the defect] → the
  browser probe in `docs/browser-checks.md` lists it. The source test covers
  only the four known containers.
- [No probe has measured the fourth container] → the browser check opens
  `purchase-requisition`'s Finance Review in the Player at 400px. It submits from
  "Review" with Finance Note empty. The probe runs once that tab shows its
  count.

## Migration Plan

Style-only. No persisted state, no route, no definition contract change.
Rollback is a revert of the change's commits.

## Open Questions

None.
