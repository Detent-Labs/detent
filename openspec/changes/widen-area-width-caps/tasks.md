## 1. Shared token

- [x] 1.1 Add a Layout section to `packages/web/src/shell/tokens.css`'s
      `:root` with `--layout-cap-narrow: 61rem;` and
      `--layout-cap-wide: 80rem;`, placed the way the existing sections
      (space, radius, shadow) are. Verify by reading the file back: both
      declarations present, no other value in the file touched.
- [x] 1.2 Add a `layout` group to `packages/form-ui/src/tokens.stylex.ts`
      via `stylex.defineVars`, with `capNarrow: "var(--layout-cap-narrow)"`
      and `capWide: "var(--layout-cap-wide)"`, matching the `space` /
      `radius` / `shadow` groups' own pattern exactly. Verify with
      `bun run typecheck` inside the devcontainer — zero new errors
      attributable to this file.

## 2. Sweep the participant/shell cap (46rem to 61rem)

- [x] 2.1 In `packages/web/src/shell/LoginScreen.tsx`,
      `ProfilePage.tsx`, `ErrorBoundary.tsx` and `App.tsx`, replace the
      literal `"46rem"` `maxWidth` with `layout.capNarrow`, importing
      `layout` from `form-ui/tokens.stylex` where not already imported.
      Verify with
      `grep -rn '"46rem"' packages/web/src/shell` returning no matches.
- [x] 2.2 In `packages/web/src/areas/app/screens/TaskScreen.tsx`,
      `TasksScreen.tsx`, `InvolvedScreen.tsx`, `StartedScreen.tsx` and
      `StartScreen.tsx`, replace the literal `"46rem"` `maxWidth` with
      `layout.capNarrow`, importing `layout` where not already imported.
      Verify with
      `grep -rn '"46rem"' packages/web/src/areas/app` returning no
      matches.

## 3. Sweep the operator cap (60rem to 80rem)

- [x] 3.1 In the 10 admin screens carrying the literal
      (`UsersScreen.tsx`, `MigrationsScreen.tsx`, `OutboxScreen.tsx`,
      `TimersScreen.tsx`, `UiStringsScreen.tsx`, `GroupsScreen.tsx`,
      `InstanceScreen.tsx`, `InstancesScreen.tsx`, `DataListsScreen.tsx`,
      `DataListScreen.tsx`, all under
      `packages/web/src/areas/admin/screens/`), replace the literal
      `"60rem"` `maxWidth` with `layout.capWide`, importing `layout`
      where not already imported. Verify with
      `grep -rn '"60rem"' packages/web/src/areas/admin` returning no
      matches.
- [x] 3.2 In exactly 4 reporting files — `ReportsListScreen.tsx`,
      `ProcessPickerScreen.tsx`, `ReportBuilderScreen.tsx` (all under
      `screens/`) and `root.tsx` (directly under `areas/reporting/`) —
      replace the literal `"60rem"` `maxWidth` on that file's `screen`
      style with `layout.capWide`, importing `layout` where not already
      imported. In `ReportBuilderScreen.tsx` touch ONLY the `screen`
      style's `"60rem"` — its `scope` and `empty` styles each carry an
      unrelated `maxWidth: "46rem"` caption/note cap (paired with
      `marginInline: 0`, not `"auto"` — it does not center, so it is not
      this screen's own cap) and must be left exactly as they are. Do
      NOT touch `components.tsx`, `ColumnEditor.tsx` or `ShareEditor.tsx`
      — none of the three carries a genuine screen-level cap; their
      `"46rem"` occurrences are the same unrelated caption/note pattern.
      Verify with `grep -n '"60rem"' packages/web/src/areas/reporting/screens/ReportsListScreen.tsx
      packages/web/src/areas/reporting/screens/ProcessPickerScreen.tsx
      packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx
      packages/web/src/areas/reporting/root.tsx` returning no matches,
      and `grep -c '"46rem"' packages/web/src/areas/reporting/components.tsx
      packages/web/src/areas/reporting/screens/ColumnEditor.tsx
      packages/web/src/areas/reporting/screens/ShareEditor.tsx
      packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx`
      still reporting 2, 2, 1 and 2 respectively (untouched).
- [x] 3.3 In the 7 studio files carrying the literal
      (`ToolsScreen.tsx`, `VersionsScreen.tsx`, `ProcessesScreen.tsx`,
      `TemplatesScreen.tsx`, `MigrationPlanScreen.tsx`, `PlayerScreen.tsx`,
      `EditScreen.tsx`, all under
      `packages/web/src/areas/studio/screens/`), replace the literal
      `"60rem"` `maxWidth` with `layout.capWide`, importing `layout`
      where not already imported. In `EditScreen.tsx`, touch only the
      `studioScreen` style (the bare-screen fallback, per design.md's
      Context) — do not touch the separate `.studio-edit-screen` rule
      that already widens past it for the process surface itself, and
      do not touch `MigrationSpecEditor.tsx`'s unrelated `"64rem"` block
      cap. Verify with `grep -rn '"60rem"' packages/web/src/areas/studio`
      returning no matches, and confirm `MigrationSpecEditor.tsx` and the
      five `NARROW = "@media (max-width: 64rem)"` files
      (`StepsRail.tsx`, `StepPage.tsx`, `FieldCatalogPanel.tsx`,
      `EntityTabs.tsx`, plus `EditScreen.tsx`'s own `NARROW` constant)
      are unchanged by this task.

## 4. Repo-wide sweep verification

- [ ] 4.1 Run `grep -rln 'maxWidth: "46rem"\|maxWidth: "60rem"'
      packages/web/src` and verify the result is exactly these 4 files,
      none other: `components.tsx`, `ColumnEditor.tsx`, `ShareEditor.tsx`,
      `ReportBuilderScreen.tsx` (the last one for its untouched `scope`
      and `empty` styles only — confirm its `screen` style now reads
      `layout.capWide`, not a literal). Every other file among the 30
      genuine screen-level occurrences now reads `layout.capNarrow` or
      `layout.capWide` instead of the old literal.

## 5. Design documentation

- [ ] 5.1 Update `DESIGN.md`'s Layout section: change "cap at 46rem" to
      "cap at 61rem" and "cap at 60rem" to "cap at 80rem" in the sentence
      describing area screen caps. Verify by re-reading the updated
      lines.
- [ ] 5.2 Grep `.claude/rules/design-language.md` and
      `tmp/Detent Design Language.dc.html` for `46rem` and `60rem`; update
      any occurrence found to `61rem` / `80rem` to match. Verify with the
      same grep returning no stale occurrence in either file.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` inside the devcontainer with zero
      errors.
- [ ] 6.2 Run `bun run build` inside the devcontainer and verify it
      succeeds.
- [ ] 6.3 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set (never a single-file rerun). Verify by reading
      the printed summary: pass count, zero unexpected failures, and the
      skip count consistent with `DATABASE_URL` actually being picked up
      (not a silent all-DB-tests-skipped run).
- [ ] 6.4 In a real browser, open the app area's My tasks screen and one
      task, and confirm the content column now renders visibly wider
      (61rem) and still centers correctly at both a wide and a narrow
      viewport.
- [ ] 6.5 In a real browser, open the Player screen and confirm: (a) its
      content column renders visibly wider (80rem); (b) above roughly a
      64rem-equivalent viewport width, the form pane and the record pane
      now render side by side, the scenario `studio-player`'s own spec
      already specified but the previous 60rem cap made unreachable;
      (c) below that width, the layout still stacks with the record
      last. Screenshot both states.
- [ ] 6.5a In the same browser session, open the process surface (any
      process's Canvas tab) and confirm it still fills the full viewport
      width, unaffected by the studio area's new 80rem cap — matching
      `studio-app`'s "The process surface stays uncapped" scenario.
- [ ] 6.6 Run `/impeccable critique` and `/impeccable audit` against the
      Task screen route and the Player screen route, and resolve any
      material finding either reports.
- [ ] 6.7 Run the antislop prose gate and the whitespace gate over the
      pushed range on every Markdown file this change touched:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      and
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
      Verify both exit clean, and fix anything either one flags.
