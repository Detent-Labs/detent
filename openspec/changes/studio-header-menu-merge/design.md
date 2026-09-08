## Context

See `proposal.md` for motivation. Today two components own two separate
"more" menus, wired from one parent:

- `ProcessHeaderBar.tsx` renders the header bar's `⋮` menu (`MoreVertical`,
  `btn btn-secondary`, bordered). Its one group is "Process, saved with the
  draft" (`headerBarMenuGroup` style: a 2px `colors.divider` top border, an
  11px uppercase `colors.textMuted` label via `headerBarMenuLabel`). That
  group holds the `key` input and the `baseLocale` input, both gated on the
  `structureActive` prop. It also holds `AddLocaleControl` and a
  `Users2`-iconed link to the admin area's Groups screen.
- `ProcessTabRow.tsx` renders the tab row's `···` overflow menu
  (`MoreHorizontal`, `btn btn-ghost`, unbordered): three plain unstyled
  buttons for the self-naming JSON toggle, Versions, and Player.
- `EditScreen.tsx` is the only caller of both (lines ~777 and ~825). It
  already computes `jsonOpen` (`useState`) and already reads it for
  `ProcessHeaderBar`'s `structureActive={!jsonOpen}` prop. `ProcessTabRow`
  also reads `jsonOpen` directly today, to compute
  `selected = !jsonOpen && tab === open`. That stays true regardless of
  which control can flip it, so `jsonOpen` itself does not move. Only
  `onToggleJson`, `onVersions` and `onPlayer` do. All three are already in
  scope at the `ProcessHeaderBar` call site, so nothing new gets added.
- Confirmed by reading them, not assumed: three existing `bun:test` files
  construct these components directly and need updating.
  `studio-processTabRow.test.tsx` drops three props from its render
  helper and splits its "overflow menu" describe block.
  `studio-processHeaderBar-publishGate.test.tsx` and
  `-findingFallback.test.tsx` each add no-op stubs for the three new
  required props. See `proposal.md`'s Impact section for the per-file
  detail.

`/impeccable shape` resolved the two open UX calls for this merge (heading
text and icons) in the same session. This design records the outcome
rather than re-deriving it.

## Goals / Non-Goals

**Goals:**
- One "more" trigger on the process surface instead of two.
- The merged menu still scans as two kinds of item: identity/settings,
  and views of the same process.
- No behavior change beyond the relocation. The JSON toggle keeps naming
  its own state. Versions/Player keep calling the same `navigate()`
  handlers. The existing dirty-check-before-navigating behavior stays
  untouched (see `studio-app`'s unsaved-changes-prompt requirement). That
  check lives in `go`/`navigate`. Neither menu component owns it.

**Non-Goals:**
- Redesigning the header-bar menu's existing "Process, saved with the
  draft" group, its trigger button, panel width, or position.
- Any change to the JSON surface's own behavior (`studio-json-view`'s
  replace-on-Apply requirement), to Versions, or to the Player screen.
- Any change to `baseLocale`'s presence or behavior in the menu
  (`studio-app`'s two requirements naming it). It stays exactly as is.

## Decisions

**Two groups, not a flat list.** The existing group mutates the draft
(key, baseLocale). Or it navigates to draft-scoped admin config, the
groups link. The incoming three items navigate to other views of the same
process and mutate nothing. Flattening seven mixed-purpose items into one
list reads as a junk drawer in Operate mode, where scanability outranks
compactness (`.claude/rules/design-language.md`). Reusing the existing
`headerBarMenuGroup` pattern for a second group is the smallest diff that
keeps that distinction legible. The pattern already exists for exactly
this purpose.

**Heading "Views", appended below the existing group.** Confirmed via
`/impeccable shape`. It reads terser than the existing group's
full-sentence voice ("Process, saved with the draft"), accepted here as a
legible category label. The existing group keeps its current first
position, so an author's existing muscle memory for key/baseLocale/groups
stays undisturbed. "Views" appends after it, since it is the new content.

**Each moved entry gets a Lucide icon.** Confirmed via `/impeccable
shape`. The icons are `FileJson` for the JSON toggle, `History` for
Versions, and `Play` for Player. The JSON icon marks the destination,
never a state, so it stays the same across both Open and Leave. Each icon
renders at 18px with a 1.75 stroke in `currentColor`, matching the
existing group's `Users2` entry and this repo's icon rule. The design
rejected leaving them text-only, as they appeared in the tab row. One
iconed entry beside three bare-text ones would read as two unfinished
styles glued together.

**Catalog keys move under the `headerBar.*` prefix.** This renames
`tabs.overflowJsonOpen` to `headerBar.jsonOpen`, `tabs.overflowJsonLeave`
to `headerBar.jsonLeave`, `tabs.overflowVersions` to `headerBar.versions`,
and `tabs.overflowPlayer` to `headerBar.player`. It adds
`headerBar.menuGroupViews` ("Views") beside the existing
`headerBar.menuGroupDraft`. `tabs.overflowTrigger` ("More") is deleted
outright. A repo-wide grep confirms nothing but the deleted trigger
button reads it. `packages/web/src/i18n/catalogs/studio.ts` already
namespaces every key by owning component (`tabs.*` for `ProcessTabRow`,
`headerBar.*` for `ProcessHeaderBar`). Moving the component ownership
without moving the namespace would leave four `headerBar`-rendered
strings under a `tabs.` prefix, for no reason, breaking that existing
convention.

**Only the handlers move; `jsonOpen` stays shared.** `onToggleJson`,
`onVersions` and `onPlayer` leave `ProcessTabRow`'s `Props` and join
`ProcessHeaderBar`'s. `ProcessHeaderBar` derives the toggle's open/closed
state from its existing `structureActive` prop, which already equals
`!jsonOpen` for every caller. It skips a second, redundant `jsonOpen`
prop. `ProcessTabRow` keeps `jsonOpen` untouched, since it still drives
`selected = !jsonOpen && tab === open`. That behavior keeps every tab
unselected while the JSON surface is open. It has nothing to do with
which control opens or closes the surface. `EditScreen.tsx` rewires its
two call sites. It introduces nothing new, since both values are already
read there today.

**Alternative rejected: keep two menus, and make them visually distinct
instead.** Going into this change, that was the recommended option. See
the conversation this proposal came out of. It would differentiate the
two triggers, rather than merge them. That keeps the identity/views
separation `studio-guided-surface` deliberately built. The user chose to
merge anyway. This design does not re-litigate that call.

## Risks / Trade-offs

- [Risk] This reverses part of a requirement set written the same day
  (`studio-guided-surface`, archived 2026-09-08). The two changes' git
  history now reads as "split, then re-merged hours later." Mitigation:
  `proposal.md`'s Why section states this plainly. Nothing here hides it.
- [Risk] Leaving the JSON surface via the header-bar menu re-enables
  `structureActive` (already `= !jsonOpen`), so the existing group's
  `key`/`baseLocale` inputs reappear inside the same panel the click just
  happened in. The open menu's own content grows by two fields at that
  moment. This gating already exists today; this change only makes it
  visible in the same panel instead of a different one. Mitigation: no
  code change needed. The browser check (`tasks.md`) should confirm this
  does not read as janky, and fix the layout only if it does.
- [Risk] Views now sits one group below identity, in the same list. That
  is one physical inch further from the trigger than the tab row's
  dedicated overflow was. Mitigation: accepted. The panel holds two short
  groups, about seven items total. It never needs to scroll. Reading past
  one more heading is the cost of one trigger instead of two.

## Migration Plan

No data migration, no persisted state, and no engine change. This is a
client-side chrome relocation only, on a pre-1.0 project with nothing
deployed (`CLAUDE.md`'s "Stage: pre-1.0" section). No feature flag.

1. `ProcessHeaderBar.tsx`: add the three props, the `Views` group, its
   three iconed entries.
2. `ProcessTabRow.tsx`: delete the overflow trigger, panel, its three
   styles, three of its four props, and the `MoreHorizontal` import. Keep
   `jsonOpen`.
3. `EditScreen.tsx`: add `onToggleJson`/`onVersions`/`onPlayer` to the
   `ProcessHeaderBar` call, and drop them from the `ProcessTabRow` call.
4. `packages/web/src/i18n/catalogs/studio.ts`: rename and add the keys
   per the Decisions section above.
5. `studio-processTabRow.test.tsx`, `studio-processHeaderBar-publishGate.test.tsx`
   and `-findingFallback.test.tsx`: apply the per-file detail from
   `proposal.md`'s Impact section.
6. Reword to match, in each of:
   - `docs/authoring-guide.md:788-791,978`
   - `.claude/rules/ui-glossary.md` (process-surface table: header-bar-menu
     row, overflow-menu row, and the tab-row row's own "with the overflow
     menu at its end" clause)
   - `docs/current-state.md:4391-4394` (`ProcessTabRow`'s own description
     currently states it)
   - `docs/browser-checks.md:2602` (names "the tab row's overflow menu"
     as where the JSON view opens from)
7. Sync the two delta specs in this change into
   `openspec/specs/studio-process-tabs/` and
   `openspec/specs/studio-json-view/` at archive time.

Rollback is a plain revert. Nothing here is one-way.

## Open Questions

None. `/impeccable shape` resolved the two open UX calls (group heading,
icons) before anyone wrote this document.
