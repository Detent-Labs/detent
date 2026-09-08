## Why

The process surface stacks two "more" triggers one row apart: the header
bar's `⋮` and the tab row's `···`. They read as near-identical controls at
a glance. They are easy to confuse. A screenshot of both drew exactly
that question today. Folding what the tab row's
overflow menu holds into the header bar's existing `⋮` menu removes the
second top-level trigger. The process surface keeps exactly one "more"
control.

This knowingly gives back part of what
`openspec/changes/archive/2026-09-08-studio-guided-surface` split apart
hours earlier. That change moved the JSON surface, Versions and Player
out of a pair beside the header bar. The goal was for the header-bar menu
to carry only process-identity items: key, baseLocale, locale, the groups
link. This change accepts that trade. One visible trigger wins over the
identity/views separation.

## What Changes

- The header bar's `⋮` menu (`ProcessHeaderBar.tsx`) gains a second group.
  It holds the three entries the tab row's overflow menu carries today.
  Those are the JSON-surface toggle (a self-naming Open/Leave entry),
  Versions, and Player.
- `ProcessTabRow.tsx` deletes the tab row's overflow control: trigger
  button, panel, and its three menu items. The tab row carries tabs only,
  with no trailing control.
- `EditScreen.tsx` adds `onToggleJson`, `onVersions` and `onPlayer` to its
  `ProcessHeaderBar` call, and drops them from its `ProcessTabRow` call.
  `ProcessTabRow` keeps `jsonOpen` unchanged, since it still suppresses
  the open tab's selected state while the JSON surface is open.
  `ProcessHeaderBar` derives the same fact from
  its own `structureActive` prop instead of taking a second, redundant
  one. Neither component gains new state.
- `docs/authoring-guide.md` updates the two passages that point authors
  at "the tab row's overflow menu" for JSON, Versions and Player.
- `.claude/rules/ui-glossary.md` drops the "overflow menu" row. Today it
  reads "the tab row's own menu: the JSON surface, Versions and Player."
  Its content folds into the header-bar-menu row instead.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `studio-process-tabs`: removes the "An overflow menu holds what is not
  a tab" requirement. The tab row has no overflow control; its
  trailing edge is the last tab.
- `studio-json-view`: the requirement that the JSON surface "opens from
  the tab row's overflow menu" changes. It now opens from the header
  bar's `⋮` menu.

Checked, no delta needed:
- `studio-app`: its two `baseLocale`-lives-in-the-header's-`⋮`-menu
  requirements stay true, unchanged. The menu still carries `baseLocale`;
  nothing moves it to a tab. Its "JSON surface renders no link into the
  panels screen" scenario stays true too. It asserts the tab row stands
  away once JSON is open, regardless of which control opened it. Its
  leaving-with-unsaved-changes requirement names the Versions/Player
  links generically, never their host menu.
- `studio-checks-rail`: only cross-references the tab row's tab set,
  never its overflow control.
- `studio-canvas`, `studio-publish`: each names `ProcessHeaderBar.tsx`
  once, both times for its "renders from compiled component styles"
  requirement. This change reuses the existing `headerBarMenuLink`
  compiled style for the three new entries. It does not add inline or
  uncompiled markup, so both stay true.

## Impact

- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` gains three
  new props: `onToggleJson`, `onVersions`, `onPlayer`. The open/closed
  state still comes from the existing `structureActive` prop. A second
  menu group joins the first, with its own catalog-key label.
- `packages/web/src/areas/studio/panels/ProcessTabRow.tsx` drops three
  items: the overflow trigger and panel, its three styles (`overflow`,
  `overflowPanel`, `menuItem`), and three of its four props
  (`onToggleJson`, `onVersions`, `onPlayer`). The `MoreHorizontal` import
  goes too. `jsonOpen` stays; it still gates the open tab's selected
  state (`selected = !jsonOpen && tab === open`).
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: rewires three
  props from the `ProcessTabRow` call to the `ProcessHeaderBar` call.
- `packages/web/src/i18n/catalogs/studio.ts`: the moved catalog keys
  (`tabs.overflowJsonOpen`, `tabs.overflowJsonLeave`,
  `tabs.overflowVersions`, `tabs.overflowPlayer`). Whether they rename
  under `headerBar.*` or keep the `tabs.` prefix is a design.md decision.
- `docs/authoring-guide.md:788-791,978`: reword the two passages naming
  "the tab row's overflow menu."
- `.claude/rules/ui-glossary.md`: process-surface table. This covers the
  header-bar-menu row, the overflow-menu row, and the tab-row row
  itself. That row's own description also names "the overflow menu at
  its end".
- `docs/current-state.md:4391-4394`: `ProcessTabRow.tsx`'s description
  states today that its overflow menu holds the JSON surface, Versions
  and Player. Reword it to say the row renders tabs only, still reading
  `jsonOpen` to suppress the open tab's selected state. Move the
  JSON/Versions/Player fact to wherever this file next describes
  `ProcessHeaderBar.tsx`.
- `openspec/specs/studio-process-tabs/spec.md`,
  `openspec/specs/studio-json-view/spec.md`: requirement text per
  Capabilities above.

No engine, HTTP, or definition-contract impact.

Three existing `bun:test` files need updates, found by reading them
rather than assumed:
- `packages/web/test/studio-processTabRow.test.tsx`: its `render()`
  helper passes all four props to `ProcessTabRow` today. Drop the three
  deleted ones; keep `jsonOpen`. Its `describe("The overflow menu", ...)`
  block splits. The "stays closed until something opens it" case tests
  the deleted trigger. That case goes away, and `ProcessHeaderBar` gains
  equivalent new coverage of its own trigger instead. The "marks no tab
  selected while the JSON surface stands open" case keeps its current
  behavior, unchanged.
- `packages/web/test/studio-processHeaderBar-publishGate.test.tsx` and
  `studio-processHeaderBar-findingFallback.test.tsx`: both construct
  `<ProcessHeaderBar>` directly. The three new props are now mandatory.
  Both files would otherwise fail to typecheck, so both add no-op stubs
  (for example, `onToggleJson: () => {}`) to their test helpers. Neither
  file's existing assertions change. Both already establish, in a
  comment, that the panel's own open-state content sits out of
  `renderToStaticMarkup`'s reach: `menuOpen` is component state, and
  nothing static fires a click. That is why the merged menu's new
  entries get no new assertions; they rely on the browser check
  instead.
