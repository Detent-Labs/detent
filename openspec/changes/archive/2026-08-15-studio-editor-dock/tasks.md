## 1. Visual direction

- [x] 1.1 Invoke `/frontend-design:frontend-design` for the strip, its tab bar
  and the Paths table.
- [x] 1.2 Pull in `web-design-guidelines`, `vercel-react-best-practices` and
  `vercel-composition-patterns`.
- [x] 1.3 Hold `.claude/rules/design-language.md`: radius 0, a 2px divider above
  the dock, 1px hairlines between rows.
- [x] 1.4 Hold its mono rule. A guard's CEL source, a priority number, a step
  `key` and a raw `step_` id all take the mono face.
- [x] 1.5 Keep a resolved step label in the body face. It is prose, not a value
  the engine matches.

## 2. The base version reaches `EditorArea`

- [x] 2.1 Add `loadedBaseVersion: number | null` to `EditorAreaProps` in
  `screens/EditScreen.tsx`.
- [x] 2.2 Name it `loadedBaseVersion`, not `initialBaseVersion`. In this file
  `initial` marks a value that seeds a `useState`.
- [x] 2.3 Pass `state.record.baseVersion` from `EditScreen`'s loaded branch into
  that prop.
- [x] 2.4 Derive `const baseVersion = publishResult?.version ?? loadedBaseVersion`
  in `EditorArea`, and pass that to the dock.
- [x] 2.5 Confirm `markDraftPublished` moves `base_version` on publish
  (`src/engine/drafts.ts:213`), so the derived value is right.

## 3. The pure row derivation

- [x] 3.1 Add `src/areas/studio/dock/pathRows.ts` with `pathRows(steps)`.
- [x] 3.2 Return one row per path, in step order, then in each step's own path
  order.
- [x] 3.3 Carry `pathId`, `sourceKey`, `sourceLabel`, `targetKey`,
  `targetLabel`, `trigger`, `priority` and `guardSrc`.
- [x] 3.4 Type both label values as `DraftLocalizedText` from
  `../draft/localized-text.js`. The module reads no content locale.
- [x] 3.5 Carry `guardSrc` on every row, with no branch on the trigger. A manual
  path can hold a guard.
- [x] 3.6 Leave the target fields unset when `to` names no step in the draft.
- [x] 3.7 Add `packages/web/test/studio-dock-path-rows.test.ts`, over `bun:test`
  and plain literal fixtures.
- [x] 3.8 Cover the order, a guardless manual path, and a manual path carrying a
  guard.
- [x] 3.9 Cover an automatic path with a guard, a dangling `to`, and a draft
  holding no path.

## 4. The dock component

- [x] 4.1 Add `src/areas/studio/dock/EditorDock.tsx`.
- [x] 4.2 Take the open flag, the active tab, their two setters, plus the
  inputs the three tabs need.
- [x] 4.3 Render the control as a `<button type="button">` with `aria-expanded`
  for its state and `aria-controls` naming the dock body's id.
- [x] 4.4 Follow the collapsed checks rail, which ships that trio already.
  `spa-accessibility` asks a disclosure for all three.
- [x] 4.5 Render the tab bar with `role="tablist"`, `role="tab"` and
  `aria-selected`, as the toggle at `EditScreen.tsx:288` does.
- [x] 4.6 Give the dock region an accessible name from the catalog.
- [x] 4.7 Mount all three tab bodies while the dock is open and reveal one with
  `hidden`, as `PanelsScreen` does. Mount none while collapsed.
- [x] 4.8 Changes tab: fetch the base body once through `getVersionBody`, keyed
  on the derived `baseVersion`.
- [x] 4.9 Strip it through `stripCompiledContent` before the compare, as
  `VersionsScreen.tsx:123` does.
- [x] 4.10 Run `diffJson(strippedBase, draft)` inside a `useMemo`. Base first,
  so every entry runs from the published value toward the draft.
- [x] 4.11 Render the entries with the existing `.studio-diff` markup
  `VersionsScreen` uses. Add no second diff style.
- [x] 4.12 Render a first-publish message when `baseVersion` is null, and a
  no-difference message on an empty result.
- [x] 4.13 Render a waiting line while the fetch runs, and the error text when
  it fails.
- [x] 4.14 Field matrix tab: render `<FieldMatrixPanel />`. It takes no props.
- [x] 4.15 Paths tab: render a `<table>` over `pathRows`, with `<th
  scope="col">` on all five columns.
- [x] 4.16 Resolve both labels through
  `resolveDraftLocalizedText(label, contentLocale, baseLocale)`. It takes three
  arguments.
- [x] 4.17 Fall back to the row's `key` when that call returns `undefined`, as
  the area's other views do.
- [x] 4.18 Render the no-priority and no-guard words rather than a blank cell.
- [x] 4.19 Render the empty state when the draft holds no path.

## 5. Wiring in the canvas arm

- [x] 5.1 Add two `useState` hooks in `EditorArea`: the open flag, starting
  collapsed, and the active tab, starting on Changes.
- [x] 5.2 Write neither into `saveState.layout`.
- [x] 5.3 Wrap the last arm of the ladder in a fragment holding the grid and
  the dock.
- [x] 5.4 Confirm the dock renders after `</div>` closes
  `.studio-canvas-layout`, as its sibling.
- [x] 5.5 Confirm the panels screen, the form editor and `JsonView` each carry
  no dock.
- [x] 5.6 The canvas arm sits inside the `surface === "structure"` branch, which
  carries the JSON rule. Do not hoist it.

## 6. Styling

- [x] 6.1 Add `.studio-dock` rules to `src/areas/studio/app.css`, under the
  canvas block.
- [x] 6.2 Follow `prefix-block-element`: `.studio-dock`, `.studio-dock-tabs`,
  `.studio-dock-body`, `.studio-dock-paths`.
- [x] 6.3 Bound `.studio-dock-body` at 16rem with `overflow: auto`, so a wide
  row scrolls inside the dock on both axes.
- [x] 6.4 Give `.studio-dock` `flex: 0 0 auto`, so a short window shrinks
  neither the strip nor its tab bar.
- [x] 6.5 Change no rule of `.studio-canvas-layout`. Its `flex` and its 36rem
  floor already carry the height.
- [x] 6.6 Bring the field matrix's own cap DOWN inside the dock:
  `.studio-dock-body .studio-matrix-scroll { max-height: 11rem; }`.
- [x] 6.6a Do not lift that cap instead. The box stays a scroll container, so
  its sticky headers then scroll away.
- [x] 6.7 Space the dock with `border-top` and `padding-top`, never
  `margin-top`. The rule `.studio-edit-screen > *` zeroes a top margin.
- [x] 6.8 Mark the active tab with an underline, or a 2px accent rule. Do not
  copy the toggle's `font-weight: 600`.
- [x] 6.9 Style state off the attributes the DOM carries, never off a state
  class.
- [x] 6.10 Keep every gap on the 4-point scale, and every radius at 0.

## 7. Catalog keys

- [x] 7.1 Add a `dock.*` block to `src/i18n/catalogs/studio.ts`, after the
  `canvas.*` block.
- [x] 7.2 Add the region name, the control's two labels and the three tab
  labels.
- [x] 7.3 Add the five Paths column headers, the empty state, the no-priority
  word and the no-guard word.
- [x] 7.4 Add the first-publish message, the no-difference message and the
  waiting line.
- [x] 7.5 Add English alone. The studio catalog ships `en`, and `t()` reads
  that locale.
- [x] 7.6 Give each sentence one key. Assemble no sentence from fragments.

## 8. Documents

- [x] 8.1 Add the row `| dock | the collapsible strip below the canvas columns |
  `dock/EditorDock.tsx` |` to section 1 of `.claude/rules/ui-glossary.md`.
- [x] 8.2 Place it after the `checks rail` row. State that the noun names that
  strip alone, because the live specs keep the verb.
- [x] 8.3 Change the `field matrix` row of that table. The grid now renders on
  the panels screen and in the dock.
- [x] 8.4 Retire the verb in that same file: "docks a second instance" becomes
  "shows a second instance".
- [x] 8.5 Retire it in `docs/browser-checks.md` and `docs/current-state.md`
  wherever prose reads it. Leave every code comment and CSS class alone.
- [x] 8.6 Add the change's entry to `docs/current-state.md`.
- [x] 8.7 Add a `### The editor dock (`studio-editor-dock`)` section to
  `docs/browser-checks.md`, one step per walk in group 9, each with a Pass line.
- [x] 8.8 Amend the existing "Studio canvas: the columns fill a tall window"
  entry there. Its pass line reads to the collapsed dock's top edge now.
- [x] 8.9 Mark the dock entry in `docs/decisions.md` as built, naming this
  change.
- [x] 8.10 Repair that entry's two wrong premises while there. The field matrix
  is not read-only, and `canDiff` does not carry the Changes tab.
- [x] 8.11 Correct its column arithmetic too. A 200-step process gives the field
  matrix 200 columns, not 50.
- [x] 8.12 Add no row to `ROADMAP.md` and no entry to `docs/roadmap-history.md`.
  The dock carries no stage, as item 1 carried none.
- [x] 8.13 Confirm the later stage that names the dock still reads true once
  this lands, and leave `ROADMAP.md` as it is.
- [x] 8.14 Move item 19 to `ARCHIVED` in `tmp/open-work-priority.md`, with what
  each pass found.
- [x] 8.15 Run the antislop linter over every Markdown file this change touches.

## 9. Verification

- [x] 9.1 Run `bun run typecheck` in the devcontainer, and report what it
  printed.
- [x] 9.2 Run `bun run build`, and report what it printed.
- [x] 9.3 Run the FULL `bun test` with `DATABASE_URL` set. Report the pass, skip
  and fail counts.
- [x] 9.4 Read the skip count, not the pass count alone. A single-file rerun is
  not the signal.
- [x] 9.5 Run `git diff --check`, then `git ls-files --eol` for the `w/` column.
- [x] 9.6 Browser check: the dock starts collapsed on the canvas screen.
- [x] 9.7 Browser check: the control opens and closes it, with a step selected
  and with nothing selected.
- [x] 9.8 Browser check at a 900px viewport height. Record whether opening the
  dock scrolls the page, and hold or lower the 16rem bound against that.
- [x] 9.9 Browser check: each of the three tabs shows its own body. The field
  matrix stays usable inside the bound.
- [x] 9.10 Browser check: the Paths tab against `purchase-requisition`, over its
  own path count.
- [x] 9.11 Browser check: an unsaved rename reaches the Changes tab. Its entry
  runs from the published label toward the unsaved one.
- [x] 9.12 Browser check: publish from the header bar with the Changes tab open.
  The tab refetches and reports no difference.
- [x] 9.13 Browser check: the panels screen, the form editor and `JsonView`
  each draw no dock, control included.
- [x] 9.14 Browser check: a long CEL guard in the Paths tab at 1024px wide. The
  table scrolls inside the dock and the page does not.
