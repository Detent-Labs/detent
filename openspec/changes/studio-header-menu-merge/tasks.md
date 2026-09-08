## 1. Header bar menu gains a "Views" group

- [x] 1.1 In `ProcessHeaderBar.tsx`, add `onToggleJson: () => void`,
  `onVersions: () => void`, `onPlayer: () => void` to `Props`; import
  `FileJson`, `History`, `Play` from `lucide-react` beside the existing
  `MoreVertical`, `Users2`. Verify: `bun run typecheck` reports no new
  errors in this file.
- [x] 1.2 Render a second `headerBarMenuGroup` below "Process, saved with
  the draft", labeled via a new `headerBar.menuGroupViews` catalog key
  ("Views"), holding three `runMenuAction`-wrapped buttons in this order:
  the JSON toggle (icon `FileJson`, label
  `t(structureActive ? "headerBar.jsonOpen" : "headerBar.jsonLeave")`,
  `onClick={() => runMenuAction(onToggleJson)}`), Versions (icon `History`,
  label `headerBar.versions`, `onClick={() => runMenuAction(onVersions)}`),
  Player (icon `Play`, label `headerBar.player`,
  `onClick={() => runMenuAction(onPlayer)}`). Reuse the existing
  `headerBarMenuLink`-style layout (icon + label) the `Users2` entry
  already uses. Verify: covered by the browser check in the Verification
  group (static rendering never opens this menu — see `design.md`
  Context).

## 2. Tab row loses its overflow control

- [x] 2.1 In `ProcessTabRow.tsx`, delete: the trigger `<button>`, the
  `{menuOpen && (...)}` panel, the `overflow`/`overflowPanel`/`menuItem`
  style entries, the `menuOpen`/`menuRef` state and its document-listener
  `useEffect`, `runMenuAction`, the `MoreHorizontal` import, and
  `onToggleJson`/`onVersions`/`onPlayer` from `Props`. Keep `jsonOpen` — it
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
  button is gone). Verify: `bun run typecheck` passes (the `CatalogKey`
  union and every `t(...)` call site must still resolve), and `grep -rn
  "tabs.overflow" packages/web/src` returns nothing.

## 5. Existing tests

- [x] 5.1 In `packages/web/test/studio-processTabRow.test.tsx`: drop
  `onToggleJson`/`onVersions`/`onPlayer` from the `render()` helper's
  `<ProcessTabRow>` call, keep `jsonOpen`. Delete the "stays closed until
  something opens it" case from `describe("The overflow menu", ...)` (it
  tests the now-deleted trigger); keep "marks no tab selected while the
  JSON surface stands open" verbatim, and rename the enclosing `describe`
  since it is no longer about an overflow menu (e.g. `"Tab selection while
  the JSON surface is open"`). Verify: `bun test
  packages/web/test/studio-processTabRow.test.tsx` passes (no DB
  dependency in this file, so a targeted run is meaningful here).
- [x] 5.2 In `studio-processHeaderBar-publishGate.test.tsx` and
  `studio-processHeaderBar-findingFallback.test.tsx`, add
  `onToggleJson={() => {}}`, `onVersions={() => {}}`, `onPlayer={() => {}}`
  to each file's `<ProcessHeaderBar>` render helper, matching the existing
  no-op style already used for `go={() => {}}`. Add one new test (in the
  publish-gate file, beside its other `describe` blocks) asserting the
  `⋮` trigger's closed-state markup — `aria-haspopup="menu"`,
  `aria-expanded="false"`, no `role="menu"` present — the equivalent of
  the case deleted from `ProcessTabRow`'s test in 5.1, since that coverage
  had no counterpart on this component before. Verify: `bun test
  packages/web/test/studio-processHeaderBar-publishGate.test.tsx
  packages/web/test/studio-processHeaderBar-findingFallback.test.tsx`
  passes.

## 6. Docs and glossary

- [x] 6.1 `docs/authoring-guide.md:788-791` and `:978`: reword "the tab
  row's overflow menu" to "the header bar's `⋮` menu" in both passages.
  Verify: `grep -n "tab row's overflow menu" docs/authoring-guide.md`
  returns nothing.
- [x] 6.2 `.claude/rules/ui-glossary.md`: delete the "overflow menu" row
  from the process-surface table; fold its description ("the tab row's
  own menu: the JSON surface, Versions and Player") into the "header bar"
  row's description so it names what that menu now carries. Also strip
  "with the overflow menu at its end" from the "tab row" row's own
  description, immediately above it — that row survives, just without the
  clause. Verify: `grep -n "overflow menu"
  .claude/rules/ui-glossary.md` returns nothing in the process-surface
  section.
- [x] 6.3 `docs/browser-checks.md:2602`: reword "Open the JSON view from
  the tab row's overflow menu" to "Open the JSON view from the header
  bar's `⋮` menu". Verify: `grep -n "tab row's overflow menu"
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

Run in order; report what each one printed, per `CLAUDE.md`'s
verification gate — not merely that it was run.

- [x] 7.1 `bun run typecheck` — zero errors.
- [x] 7.2 `bun run build` — succeeds.
- [ ] 7.3 Full `bun test` with `DATABASE_URL` set (inside the devcontainer),
  piped through `sh scripts/gates/silent-green.sh` — check the skip count,
  not only the pass count; a single-file rerun is not the signal for the
  DB-backed suites.
- [ ] 7.4 Antislop prose gate over every Markdown file this change
  touched: `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`.
- [ ] 7.5 Whitespace/CRLF gate over the same range: `sh
  scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
- [ ] 7.6 Real-browser check (production build, per this project's known
  `bun run dev` Studio crash — build and serve instead): sign in as an
  author/developer, open a draft's process surface, open the header bar's
  `⋮` menu. Pass: the existing "Process, saved with the draft" group is
  unchanged; a "Views" group stands below it with three iconed entries
  (JSON, Versions, Player); the JSON entry's label matches its current
  state and toggling it opens/leaves the JSON surface correctly; Versions
  and Player navigate correctly and still prompt on an unsaved draft; the
  tab row's trailing edge is now just the last tab, with no `···` control
  after it. Run `.claude/skills/impeccable/scripts/impeccable detect
  --json` over the two changed files and resolve any findings, then
  `/impeccable critique` and `/impeccable audit` against this route, per
  this repo's UI verification convention.
