## Why

The process surface stacks two "more" triggers one row apart: the header
bar's `⋮` and the tab row's `···`. They read as near-identical controls at a
glance and are easy to confuse — confirmed today, when a screenshot of both
drew exactly that question. Folding what the tab row's overflow menu holds
into the header bar's existing `⋮` menu removes the second top-level
trigger; the process surface keeps exactly one "more" control.

This knowingly gives back part of what
`openspec/changes/archive/2026-09-08-studio-guided-surface` split apart
hours earlier: that change moved the JSON surface, Versions and Player out
of a pair beside the header bar specifically so the header-bar menu would
carry only process-identity items (key, baseLocale, locale, the groups
link). This change accepts that trade — one visible trigger over the
identity/views separation.

## What Changes

- The header bar's `⋮` menu (`ProcessHeaderBar.tsx`) gains a second group
  holding the three entries the tab row's overflow menu carries today: the
  JSON-surface toggle (a self-naming Open/Leave entry), Versions, and
  Player.
- The tab row's overflow control — trigger button, panel, and its three menu
  items — is deleted from `ProcessTabRow.tsx`. The tab row carries tabs
  only, no trailing control.
- `EditScreen.tsx` adds `onToggleJson`, `onVersions`, `onPlayer` to its
  `ProcessHeaderBar` call and drops them from its `ProcessTabRow` call.
  `jsonOpen` itself stays a `ProcessTabRow` prop — that component still
  needs it to suppress the open tab's selected state while the JSON
  surface is open — and `ProcessHeaderBar` keeps deriving the same fact
  from its existing `structureActive` prop rather than taking a second,
  redundant one. No new state either way.
- `docs/authoring-guide.md` updates the two passages that point authors at
  "the tab row's overflow menu" for JSON/Versions/Player.
- `.claude/rules/ui-glossary.md` drops the "overflow menu" row (today: "the
  tab row's own menu: the JSON surface, Versions and Player") and folds its
  contents into the header-bar-menu row.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `studio-process-tabs`: removes the "An overflow menu holds what is not a
  tab" requirement. The tab row carries no overflow control; its trailing
  edge is the last tab.
- `studio-json-view`: the requirement that the JSON surface "opens from the
  tab row's overflow menu" changes to "opens from the header bar's `⋮`
  menu."

Checked, no delta needed:
- `studio-app` — its two `baseLocale`-lives-in-the-header's-`⋮`-menu
  requirements stay true unchanged (the menu still carries `baseLocale`;
  nothing moves it to a tab). Its "JSON surface renders no link into the
  panels screen" scenario stays true (it asserts the tab row stands away
  once JSON is open, regardless of which control opened it). Its
  leaving-with-unsaved-changes requirement names the Versions/Player
  *links* generically, not their host menu.
- `studio-checks-rail` — only cross-references the tab row's tab set, never
  its overflow control.
- `studio-canvas`, `studio-publish` — each names `ProcessHeaderBar.tsx` once,
  both times for its "renders from compiled component styles" requirement.
  This change reuses the existing `headerBarMenuLink` compiled style for the
  three new entries rather than adding inline/uncompiled markup, so both
  stay true.

## Impact

- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`: three new
  props (`onToggleJson`, `onVersions`, `onPlayer`; the open/closed state
  comes from the existing `structureActive` prop), a second menu group
  with its own catalog-key group label.
- `packages/web/src/areas/studio/panels/ProcessTabRow.tsx`: the overflow
  trigger, panel, its three styles (`overflow`, `overflowPanel`,
  `menuItem`) and three of its four props (`onToggleJson`, `onVersions`,
  `onPlayer`) are deleted, with the `MoreHorizontal` import. `jsonOpen`
  stays — it still gates the open tab's selected state
  (`selected = !jsonOpen && tab === open`).
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: rewires the four
  props from the `ProcessTabRow` call to the `ProcessHeaderBar` call.
- `packages/web/src/i18n/catalogs/studio.ts`: the moved catalog keys
  (`tabs.overflowJsonOpen`, `tabs.overflowJsonLeave`,
  `tabs.overflowVersions`, `tabs.overflowPlayer`) — rename under
  `headerBar.*` or keep the `tabs.` prefix is a design.md decision.
- `docs/authoring-guide.md:788-791,978`: reword the two passages naming
  "the tab row's overflow menu."
- `.claude/rules/ui-glossary.md`: process-surface table — the header-bar-menu
  row, the overflow-menu row, and the tab-row row itself (its own
  description also names "the overflow menu at its end").
- `docs/current-state.md:4391-4394`: `ProcessTabRow.tsx`'s description
  states today that "its overflow menu holds the JSON surface, Versions
  and Player" — reword to say it renders tabs only, still reading
  `jsonOpen` to suppress the open tab's selected state, and move the
  JSON/Versions/Player fact to wherever this file next describes
  `ProcessHeaderBar.tsx`.
- `openspec/specs/studio-process-tabs/spec.md`,
  `openspec/specs/studio-json-view/spec.md`: requirement text per
  Capabilities above.

No engine, HTTP, or definition-contract impact.

Three existing `bun:test` files need updates, found by reading them rather
than assumed:
- `packages/web/test/studio-processTabRow.test.tsx`: its `render()` helper
  passes all four props to `ProcessTabRow` today — drop the three deleted
  ones, keep `jsonOpen`. Its `describe("The overflow menu", ...)` block
  splits: the "stays closed until something opens it" case tests the
  deleted trigger and is removed (with equivalent coverage added for
  `ProcessHeaderBar`'s own trigger, since none exists today); the "marks no
  tab selected while the JSON surface stands open" case is unchanged
  behavior and stays as-is.
- `packages/web/test/studio-processHeaderBar-publishGate.test.tsx` and
  `studio-processHeaderBar-findingFallback.test.tsx`: both construct
  `<ProcessHeaderBar>` directly and will fail to typecheck once the three
  new props are required — add no-op stubs (`onToggleJson: () => {}`, etc.)
  to each file's render helper. Neither file's existing assertions change:
  both already establish, in a comment, that the panel's own open-state
  content is out of `renderToStaticMarkup`'s reach (`menuOpen` is component
  state; no static render fires a click) — the same reason the merged
  menu's new entries get no new unit assertions and rely on the browser
  check instead.
