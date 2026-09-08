## 1. Header bar menu gains a "Views" group

- [x] 1.1 In `ProcessHeaderBar.tsx`, add `onToggleJson: () => void`,
  `onVersions: () => void`, `onPlayer: () => void` to `Props`; import
  `FileJson`, `History`, `Play` from `lucide-react` beside the existing
  `MoreVertical`, `Users2`. Verify: `bun run typecheck` reports no new
  errors in this file.
- [x] 1.2 Add a second `headerBarMenuGroup` below "Process, saved with
  the draft". Label it via a new `headerBar.menuGroupViews` catalog key
  ("Views"). It holds three `runMenuAction`-wrapped buttons in this order:
  the JSON toggle (icon `FileJson`, label
  `t(structureActive ? "headerBar.jsonOpen" : "headerBar.jsonLeave")`,
  `onClick={() => runMenuAction(onToggleJson)}`), Versions (icon `History`,
  label `headerBar.versions`, `onClick={() => runMenuAction(onVersions)}`),
  Player (icon `Play`, label `headerBar.player`,
  `onClick={() => runMenuAction(onPlayer)}`). Reuse the existing
  `headerBarMenuLink`-style layout (icon + label) the `Users2` entry
  already uses. Verify: covered by the browser check in the Verification
  group, since static rendering never opens this menu (see `design.md`
  Context).

## 2. Tab row loses its overflow control

- [x] 2.1 In `ProcessTabRow.tsx`, delete: the trigger `<button>`, the
  `{menuOpen && (...)}` panel, the `overflow`/`overflowPanel`/`menuItem`
  style entries, the `menuOpen`/`menuRef` state and its document-listener
  `useEffect`, `runMenuAction`, the `MoreHorizontal` import, and
  `onToggleJson`/`onVersions`/`onPlayer` from `Props`. Keep `jsonOpen`: it
  still drives `selected = !jsonOpen && tab === open`. Verify:
  `bun run typecheck` passes, and `grep -rn "MoreHorizontal\|overflowPanel"
  packages/web/src/areas/studio/panels/ProcessTabRow.tsx` returns nothing.

## 3. Rewire the one caller

- [x] 3.1 In `EditScreen.tsx`, add `onToggleJson={() => setJsonOpen((open)
  => !open)}`, `onVersions={() => navigate({ name: "versions", processId
  })}`, `onPlayer={() => navigate({ name: "play", processId })}` to the
  `ProcessHeaderBar` call (~line 777); remove those same three props from
  the `ProcessTabRow` call (~line 825), keeping `jsonOpen={jsonOpen}`
  there. Verify: `bun run typecheck` passes.

## 4. Catalog keys

- [x] 4.1 In `packages/web/src/i18n/catalogs/studio.ts`: add
  `"headerBar.menuGroupViews": "Views"`; rename
  `"tabs.overflowJsonOpen"` → `"headerBar.jsonOpen"`,
  `"tabs.overflowJsonLeave"` → `"headerBar.jsonLeave"`,
  `"tabs.overflowVersions"` → `"headerBar.versions"`,
  `"tabs.overflowPlayer"` → `"headerBar.player"`; delete
  `"tabs.overflowTrigger"` outright (nothing reads it once the trigger
  button is gone). Verify: `bun run typecheck` passes, and the `CatalogKey`
  union and every `t(...)` call site still resolve. Also verify `grep -rn
  "tabs.overflow" packages/web/src` returns nothing.

## 5. Existing tests

- [x] 5.1 In `packages/web/test/studio-processTabRow.test.tsx`: drop
  `onToggleJson`/`onVersions`/`onPlayer` from the `render()` helper's
  `<ProcessTabRow>` call, keep `jsonOpen`. Delete the "stays closed until
  something opens it" case from `describe("The overflow menu", ...)`. It
  tests the now-deleted trigger. Keep "marks no tab selected while the
  JSON surface stands open" verbatim. Rename the enclosing `describe`,
  since it no longer covers an overflow menu. One option:
  `"Tab selection while the JSON surface is open"`. Verify: `bun test
  packages/web/test/studio-processTabRow.test.tsx` passes (no DB
  dependency in this file, so a targeted run is meaningful here).
- [x] 5.2 In `studio-processHeaderBar-publishGate.test.tsx` and
  `studio-processHeaderBar-findingFallback.test.tsx`, add
  `onToggleJson={() => {}}`, `onVersions={() => {}}`, `onPlayer={() => {}}`
  to each file's `<ProcessHeaderBar>` test helper, matching the existing
  no-op style already used for `go={() => {}}`. Add a test (in the
  publish-gate file) asserting the `⋮` trigger's closed-state markup:
  `aria-expanded="false"`, no `role="menu"`. Task 8.2 later changes this
  test's `aria-haspopup` value from `"menu"` to `"true"`. This is the
  equivalent of the case deleted from `ProcessTabRow`'s test in 5.1. That
  coverage had no counterpart on this component before. Verify: `bun test
  packages/web/test/studio-processHeaderBar-publishGate.test.tsx
  packages/web/test/studio-processHeaderBar-findingFallback.test.tsx`
  passes.

## 6. Docs and glossary

- [x] 6.1 `docs/authoring-guide.md:788-791` and `:978`: reword "the tab
  row's overflow menu" to "the header bar's `⋮` menu" in both passages.
  Verify: `grep -n "tab row's overflow menu" docs/authoring-guide.md`
  returns nothing.
- [x] 6.2 `.claude/rules/ui-glossary.md`: delete the "overflow menu" row
  from the process-surface table. Fold its description ("the tab row's
  own menu: the JSON surface, Versions and Player") into the "header bar"
  row's description. It should name what the header-bar menu now carries.
  Also strip
  "with the overflow menu at its end" from the "tab row" row's own
  description, immediately above it. That row survives, just without the
  clause. Verify: `grep -n "overflow menu"
  .claude/rules/ui-glossary.md` returns nothing in the process-surface
  section.
- [x] 6.3 `docs/browser-checks.md:2602`: reword "Open the JSON view from
  the tab row's overflow menu". It becomes "Open the JSON view from the
  header bar's `⋮` menu". Verify: `grep -n "tab row's overflow menu"
  docs/browser-checks.md` returns nothing.
- [x] 6.4 `docs/current-state.md:4391-4394`: `ProcessTabRow.tsx`'s
  description currently reads "Its overflow menu holds the JSON surface,
  Versions and Player. The JSON entry names its own state, so an author
  reads what pressing it does." Reword to state it renders tabs only, no
  trailing control, still reading `jsonOpen` to suppress the open tab's
  `aria-selected` while the JSON surface is open. Move the
  JSON/Versions/Player/self-naming fact into this file's existing
  `ProcessHeaderBar.tsx` passage instead (the one already describing its
  `⋮` menu). Verify: `grep -n "overflow menu" docs/current-state.md`
  returns nothing.

## 7. Verification

Run these in order. `CLAUDE.md`'s verification gate requires reporting
each command's real output as evidence. A claim that a check ran is not
enough on its own.

- [x] 7.1 `bun run typecheck`: zero errors.
- [x] 7.2 `bun run build`: succeeds.
- [x] 7.3 Full `bun test` with `DATABASE_URL` set (inside the devcontainer),
  piped through `sh scripts/gates/silent-green.sh`. Check the skip count,
  not only the pass count. For the DB-backed suites, only the full run is
  the signal, never a single-file rerun.
- [x] 7.4 Antislop prose gate over every Markdown file this change
  touched. Run: `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`.
- [x] 7.5 Whitespace/CRLF gate over the same range: `sh
  scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
- [x] 7.6 Real-browser check, on a production build. This project's
  `bun run dev` crashes Studio on first validation, so build and serve
  instead. Sign in as an author/developer, open a draft's process surface,
  and open the header bar's `⋮` menu. Pass:
  - the existing "Process, saved with the draft" group keeps its fields
    and order (task group 8 changes how `key`/`baseLocale` gate, not
    what the group holds)
  - a "Views" group stands below it, with three iconed entries: JSON,
    Versions, Player
  - the JSON entry's label matches its current state, and toggling it
    opens or leaves the JSON surface correctly
  - Versions and Player navigate correctly, and still prompt on an
    unsaved draft
  - the tab row's trailing edge is now just the last tab, with no `···`
    control after it

  Run `.claude/skills/impeccable/scripts/impeccable detect --json` over
  the two changed files, and resolve any findings. Then run
  `/impeccable critique` and `/impeccable audit` against this route, per
  this repo's UI verification convention.

## 8. Critique fixes

`/impeccable critique`'s dual-agent run (task 7.6) found five issues, all
in `ProcessHeaderBar.tsx`. The user chose to fix all five in this same
change (see design.md's new Decisions entry). None need a delta-spec
change. Each one fixes how an already-specified control behaves.

- [x] 8.1 [P1] Escape returns focus to the `⋮` trigger. Add a
  `triggerRef`; the existing Escape `useEffect` calls
  `triggerRef.current?.focus()` after `setMenuOpen(false)`. Verify:
  `bun run typecheck` passes; live check, `document.activeElement` is the
  trigger button after Tab-into-panel then Escape.
- [x] 8.2 [P1] Drop `role="menu"` from the panel; the trigger's
  `aria-haspopup` becomes `"true"`. Update
  `studio-processHeaderBar-publishGate.test.tsx`'s closed-state assertion
  to match. Verify: `bun test
  packages/web/test/studio-processHeaderBar-publishGate.test.tsx` passes.
  Live check: `document.querySelectorAll('[role="menu"]')` excludes this
  panel (`Chrome.tsx`'s account menu is the one legitimate survivor).
- [x] 8.3 [P2] `key`/`baseLocale` inputs carry `disabled={!structureActive}`
  instead of the prior conditional unmount, matching the process label's
  pattern for the same gate. Verify: `bun run typecheck` passes. Live
  check: toggle the JSON surface and reopen the menu; both fields stay
  visible and disabled.
- [x] 8.4 [P3] `headerBarMenuLink` gets `textAlign: "left"`, so its text
  stays flush left. That overrides the global `.btn` class's default
  center alignment, visible on the one label long enough to wrap.
  Verify: live check, the wrapped second line stays flush left under the
  icon.
- [x] 8.5 [P3] The first menu group uses a new `headerBarMenuGroupFirst`
  style with no top border. `headerBarMenuGroup` (bordered) now applies
  only from the second group on. Verify: live check, no divider sits
  between the panel's own border and the first group's heading.
- [x] 8.6 Re-run the full verification group (7.1-7.3, 7.5) after 8.1-8.5:
  `bun run typecheck`, `bun run build`, the full `bun test` suite piped
  through `sh scripts/gates/silent-green.sh`, and the whitespace gate.
  Report each command's real output.

## 9. `/openspec-verify-change` follow-up

`/openspec-verify-change` found one CRITICAL gap the original review
missed. `studio-canvas`'s own header-bar requirement claimed one heading.
It also named the tab row as where the JSON surface opens from. Both
claims are false after this change. Two SUGGESTION-level findings landed
inline instead
(tasks.md's own `aria-haspopup` staleness, fixed above in 5.2's text; the
`studio-app` wording observation, left as a proposal.md note, out of
scope).

- [x] 9.1 Add `openspec/changes/studio-header-menu-merge/specs/studio-canvas/spec.md`:
  a MODIFIED delta for "A process-identity header bar shows draft and
  publish status." It corrects the one-heading and JSON-surface-location
  claims, deferring the "Views" heading's contents to
  `studio-process-tabs`. List `studio-canvas` under Modified Capabilities
  in `proposal.md`. Verify: `openspec validate --changes
  studio-header-menu-merge --strict` passes; antislop clean on the new
  file.
