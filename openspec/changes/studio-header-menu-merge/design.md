## Context

See `proposal.md` for motivation. Today two components own two separate
"more" menus, wired from one parent:

- `ProcessHeaderBar.tsx` renders the header bar's `⋮` menu (`MoreVertical`,
  `btn btn-secondary`, bordered). Its one group, "Process, saved with the
  draft" (`headerBarMenuGroup` style: 2px `colors.divider` top border, an
  11px uppercase `colors.textMuted` label via `headerBarMenuLabel`), holds
  the `key` input, the `baseLocale` input (both gated on the `structureActive`
  prop), `AddLocaleControl`, and a `Users2`-iconed link to the admin area's
  Groups screen.
- `ProcessTabRow.tsx` renders the tab row's `···` overflow menu
  (`MoreHorizontal`, `btn btn-ghost`, unbordered), three plain unstyled
  buttons: the self-naming JSON toggle, Versions, Player.
- `EditScreen.tsx` is the only caller of both (lines ~777 and ~825). It
  already computes `jsonOpen` (`useState`) and already reads it for
  `ProcessHeaderBar`'s `structureActive={!jsonOpen}` prop. `ProcessTabRow`
  also reads `jsonOpen` directly today, to compute
  `selected = !jsonOpen && tab === open` — that stays true regardless of
  which control can flip it, so `jsonOpen` itself does not move; only
  `onToggleJson`, `onVersions` and `onPlayer` do. All three are already in
  scope at the `ProcessHeaderBar` call site; no new state.
- Confirmed by reading them, not assumed: three existing `bun:test` files
  construct these components directly and need updating —
  `studio-processTabRow.test.tsx` (drop three props from its render
  helper, split its "overflow menu" describe block) and
  `studio-processHeaderBar-publishGate.test.tsx` /
  `-findingFallback.test.tsx` (add no-op stubs for the three new required
  props). See `proposal.md`'s Impact section for the per-file detail.

`/impeccable shape` resolved the two open UX calls for this merge (heading
text and icons) in the same session; this design records the outcome
rather than re-deriving it.

## Goals / Non-Goals

**Goals:**
- One "more" trigger on the process surface instead of two.
- The merged menu still scans as two distinct kinds of item: process
  identity/settings vs. other views of the same process.
- No behavior change beyond the relocation: the JSON toggle keeps naming
  its own state; Versions/Player keep calling the same `navigate()`
  handlers, so the existing dirty-check-before-navigating behavior
  (`studio-app`'s "Leaving the edit screen with unsaved changes prompts
  first") is untouched — that check lives in `go`/`navigate`, not in
  either menu component.

**Non-Goals:**
- Redesigning the header-bar menu's existing "Process, saved with the
  draft" group, its trigger button, panel width, or position.
- Any change to the JSON surface's own behavior (`studio-json-view`'s
  replace-on-Apply requirement), to Versions, or to the Player screen.
- Any change to `baseLocale`'s presence/behavior in the menu
  (`studio-app`'s two requirements naming it) — it stays exactly as is.

## Decisions

**Two groups, not a flat list.** The existing group mutates the draft
(key, baseLocale) or navigates to draft-scoped admin config (groups link);
the incoming three items navigate to other views of the same process and
mutate nothing. Flattening seven mixed-purpose items into one list reads as
a junk drawer in Operate mode, where scanability outranks compactness
(`.claude/rules/design-language.md`). Reusing the existing
`headerBarMenuGroup` pattern for a second group is the smallest diff that
keeps that distinction legible — the pattern already exists for exactly
this purpose.

**Heading "Views", appended below the existing group.** Confirmed via
`/impeccable shape`. Terser than matching the existing group's full-sentence
voice ("Process, saved with the draft") — accepted as a legible category
label. The existing group keeps its current first position (no disruption
to an author's existing muscle memory for key/baseLocale/groups); "Views"
appends after it, since it is the new content.

**Each moved entry gets a Lucide icon.** Confirmed via `/impeccable shape`:
`FileJson` (JSON toggle, both Open/Leave states — the icon marks the
destination, not a state), `History` (Versions), `Play` (Player). 18px,
1.75 stroke, `currentColor`, matching the existing group's `Users2` entry
and this repo's icon rule. Rejected: leaving them text-only (today's tab-row
appearance) — one iconed entry beside three bare-text ones in the same
panel would read as two unfinished styles glued together, undercutting the
whole point of merging into "one coherent menu."

**Catalog keys move under the `headerBar.*` prefix.** Renames
`tabs.overflowJsonOpen` → `headerBar.jsonOpen`, `tabs.overflowJsonLeave` →
`headerBar.jsonLeave`, `tabs.overflowVersions` → `headerBar.versions`,
`tabs.overflowPlayer` → `headerBar.player`; adds `headerBar.menuGroupViews`
("Views") beside the existing `headerBar.menuGroupDraft`. `tabs.overflowTrigger`
("More") is deleted outright — confirmed via repo-wide grep, nothing but the
deleted trigger button reads it. `packages/web/src/i18n/catalogs/studio.ts`
already namespaces every key by owning component (`tabs.*` for
`ProcessTabRow`, `headerBar.*` for `ProcessHeaderBar`); moving the component
ownership without moving the namespace would leave four `headerBar`-rendered
strings under a `tabs.` prefix, breaking that existing convention for no
reason.

**Only the handlers move; `jsonOpen` stays shared.** `onToggleJson`,
`onVersions`, `onPlayer` leave `ProcessTabRow`'s `Props` and join
`ProcessHeaderBar`'s, which derives the toggle's open/closed state from
its existing `structureActive` prop (`= !jsonOpen`, already true of every
caller) rather than taking a redundant `jsonOpen` of its own.
`ProcessTabRow` keeps `jsonOpen` — untouched, since it still drives
`selected = !jsonOpen && tab === open`, the "no tab reads selected while
the JSON surface is open" behavior that has nothing to do with which
control opens or closes it. `EditScreen.tsx` rewires its two call sites; it
introduces nothing new since both values are already read there today.

**Alternative rejected: keep two menus, make them visually distinct
instead.** This was the recommended option going into this change (see the
conversation this proposal came out of) — differentiate the two triggers
rather than merge them, to keep the identity/views separation
`studio-guided-surface` deliberately built. The user chose to merge anyway;
this design does not re-litigate that call.

## Risks / Trade-offs

- [Risk] This reverses part of a requirement set written the same day
  (`studio-guided-surface`, archived 2026-09-08), so the two changes'
  git history reads as "split, then re-merged hours later." → Mitigation:
  `proposal.md`'s Why section states this plainly; nothing here hides it.
- [Risk] Leaving the JSON surface via the header-bar menu re-enables
  `structureActive`, which makes the existing group's `key`/`baseLocale`
  inputs reappear inside the same panel the click just happened in — the
  open menu's own content grows by two fields at the moment of that click.
  This gating already exists today (`structureActive={!jsonOpen}` already
  drives it); this change only makes it visible inside the same panel
  instead of a different one. → Mitigation: no code change needed: call it
  out explicitly for the browser check (`tasks.md`) to confirm it does not
  read as janky, and fix layout only if it does.
- [Risk] Views now sits one group below identity in the same list, one
  physical inch further from the trigger than the tab row's dedicated
  overflow was. → Mitigation: accepted; the panel holds two short groups
  (~7 items total), not a scroll — reading past one more heading is the
  cost of one trigger instead of two.

## Migration Plan

No data migration, no persisted state, no engine change — a client-side
chrome relocation only, on a pre-1.0 project with nothing deployed
(`CLAUDE.md`'s "Stage: pre-1.0" section). No feature flag.

1. `ProcessHeaderBar.tsx`: add the three props, the `Views` group, its
   three iconed entries.
2. `ProcessTabRow.tsx`: delete the overflow trigger, panel, its three
   styles, three of its four props, the `MoreHorizontal` import. Keep
   `jsonOpen`.
3. `EditScreen.tsx`: add `onToggleJson`/`onVersions`/`onPlayer` to the
   `ProcessHeaderBar` call, drop them from the `ProcessTabRow` call.
4. `packages/web/src/i18n/catalogs/studio.ts`: rename/add the keys per the
   Decisions section above.
5. Update the three existing `bun:test` files per `proposal.md`'s Impact
   section (`studio-processTabRow.test.tsx`,
   `studio-processHeaderBar-publishGate.test.tsx`,
   `-findingFallback.test.tsx`).
6. `docs/authoring-guide.md:788-791,978`, `.claude/rules/ui-glossary.md`
   (process-surface table: header-bar-menu row, overflow-menu row, and the
   tab-row row's own "with the overflow menu at its end" clause),
   `docs/current-state.md:4391-4394` (ProcessTabRow's own description
   currently states it), and `docs/browser-checks.md:2602` (names "the tab
   row's overflow menu" as where the JSON view opens from): reword to
   match.
7. Sync the two delta specs in this change into
   `openspec/specs/studio-process-tabs/` and `openspec/specs/studio-json-view/`
   at archive time.

Rollback is a plain revert; nothing here is one-way.

## Open Questions

None. The two open UX calls (group heading, icons) were resolved via
`/impeccable shape` before this document was written.
