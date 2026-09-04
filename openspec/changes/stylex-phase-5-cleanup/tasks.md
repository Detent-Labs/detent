## 1. Consolidate global.css

- [x] 1.1 Add `.shell` and `.shell > *` to `global.css`, copied unchanged
  from `shell.css`, with their existing explanatory comments. Add one
  `prefers-reduced-motion` block using the `animation-duration`/
  `transition-duration: 0.01ms !important;` technique (design.md D5).
  Add `.studio-dialog::backdrop` unchanged, with a comment naming why it
  stays literal (design.md D6). Update the file's own header comment to
  name these four additions. Verify the file reads 118 lines (design.md
  D7): `wc -l packages/web/src/shell/global.css`. Done: reads 118.
- [x] 1.2 Verify `bun run typecheck` passes (no source file references
  `global.css` by type, so this should be a no-op check that nothing
  else broke). Done: exits 0.

## 2. Delete the five stylesheets and their imports

- [x] 2.1 Delete `packages/web/src/shell/shell.css`. Remove `import
  "./shell/shell.css";` from `packages/web/src/main.tsx`. Verify `bun run
  build` still succeeds and the built page still renders the shell frame
  (checked fully in Group 5's browser probe). Done: build exits 0.
- [x] 2.2 Delete `packages/web/src/areas/admin/app.css`,
  `packages/web/src/areas/app/app.css`,
  `packages/web/src/areas/reporting/app.css`,
  `packages/web/src/areas/studio/app.css`. Remove each area's own
  `import "./app.css";` from its `root.tsx`. Verify `bun run typecheck`
  and `bun run build` both pass. Done: both exit 0.
- [x] 2.3 Verify `find packages -iname "*.css"` (or `git ls-files
  "packages/**/*.css"`) lists exactly two files:
  `packages/web/src/shell/tokens.css` and
  `packages/web/src/shell/global.css`. Verify `git grep -n '\.css'
  packages/` line by line against design.md D2's categories: confirm
  every remaining match is category 1 (a legitimate tokens.css/global.css
  reference), category 3 (`vite.config.ts`'s generic `.css`-extension
  handling), or one of the accepted category-4 historical comments this
  change leaves untouched. No match is a live import of a deleted file,
  and none sits in `boundaries.test.ts` (Group 3 removes its own two).
  Done: both `find`/`git ls-files` list exactly the two files. The grep
  drops from 78 to 71 matches (the 5 removed imports plus the 2 lines
  gone with their deleted files); the 62 non-tokens/global matches split
  exactly as designed: 2 in `boundaries.test.ts` (Group 3's job), 2 in
  `vite.config.ts`, and 58 historical comments across 47 files.

## 3. Retire the now-vacuous boundary test

- [ ] 3.1 Delete `packages/web/test/boundaries.test.ts`'s `it("no class
  name is defined in two areas' stylesheets", ...)` test (design.md,
  Risks). Verify the file's three remaining `it` blocks under `describe("area
  boundaries", ...)` and the `describe("one package, one build", ...)`
  block still pass: `bun test packages/web/test/boundaries.test.ts`.

## 4. Correct stale doc references

- [ ] 4.1 Rewrite `.claude/rules/design-language.md`'s citations of
  `.app-stamp`, `.admin-badge`, `.rep-stamp`, `.app-task-list`,
  `.app-task-row`, `.studio-panels-rail-entry`, `.studio-panels-rail-field`,
  `.rep-rule`, `.admin-badge-faulted` and `.rep-rule-fill-danger` to
  describe the owning component instead of a class name none of these
  now compiles to. Verify none of the ten strings above still appears in
  the file: `grep -c` each, expect 0.
- [ ] 4.2 Rewrite `.claude/rules/ui-glossary.md`'s "Lives in" column and
  prose wherever it cites `.shell-account-group`, `.shell-menu`,
  `.studio-header-nav`, `.studio-header-bar`, `.studio-surface-toggle`,
  `.studio-rail`, `.studio-palette-list`, `.studio-rail-row`,
  `.studio-panels-screen-header`, `.studio-panels-rail`,
  `.studio-panels-rail-sublist`, `.studio-panels-screen-view`,
  `.studio-player-form`, `.studio-player-record` or
  `.studio-checks-rail-docked`, naming the owning file or component
  instead, matching the pattern rows without a CSS-backed term already
  use. Verify none of the fifteen strings above still appears in the
  file: `grep -oE '\.(shell|studio)-[a-z-]+' .claude/rules/ui-glossary.md`
  returns nothing.
- [ ] 4.3 Correct `docs/current-state.md`'s six passages citing
  `.studio-form-card[data-conditional]`, `.rep-rule`, `.studio-mono`,
  `.studio-canvas-layout`, `.studio-edit-screen` and
  `.studio-matrix-scroll` to describe the current, compiled mechanism.
  Verify each of the six passages (grep for the class name, confirm the
  surrounding sentence no longer claims it as a live selector).
- [ ] 4.4 Add a new dated section to `docs/browser-checks.md`, following
  the pattern every prior phase's own section uses. Cover: the five
  file deletions and where each surviving rule now lives, the
  `boundaries.test.ts` removal, and the manual probe for the
  reduced-motion consolidation (design.md's Risks: trigger a transition
  under `prefers-reduced-motion: reduce` in one screen per area, confirm
  no visible motion in any of the four). Leave every earlier phase's own
  section untouched.
- [ ] 4.5 Add this phase's own paragraph to `docs/decisions.md`'s StyleX
  entry, following the "Phase N (...) is done" pattern the four prior
  paragraphs use. Note the five deletions, the reduced-motion
  consolidation and its chosen technique, and that this closes the
  six-phase migration. Update `ROADMAP.md` stage 45 to "PHASES 0-5
  DONE." with a closing sentence in the same style. Verify the antislop
  and whitespace gates pass on both files:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`,
  run over the committed range once this task's commit lands.
- [ ] 4.6 Verify the antislop and whitespace gates pass on every other
  Markdown file this group touched
  (`.claude/rules/design-language.md`, `.claude/rules/ui-glossary.md`,
  `docs/current-state.md`, `docs/browser-checks.md`), same two commands
  as 4.5, run over the committed range.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and confirm zero errors.
- [ ] 5.2 Run `bun run build` and confirm it succeeds.
- [ ] 5.3 Run the full `bun test` suite with `DATABASE_URL` set, piped
  through `scripts/gates/silent-green.sh`. Confirm 0 failures and the
  skip count at the existing floor.
- [ ] 5.4 Run the antislop and whitespace gates over every Markdown file
  this change touched, including this change's own `proposal.md`/
  `design.md`/`tasks.md`/delta spec, over the committed range. Confirm
  both pass with no rising finding count.
- [ ] 5.5 Serve the production build from `WEB_ROOT` (dev mode has a
  known pre-existing `process is not defined` crash in Studio). Via
  `playwright-cli`, open one screen per area (My-tasks in `app`, the
  instances list in `admin`, a report screen in `reporting`, the process
  list and one open draft's edit screen in `studio`) and confirm each
  renders with no visual regression from the `global.css` consolidation:
  the shell frame still centers and fills the viewport, focus rings and
  button states still render, and a studio dialog's backdrop still
  darkens the page behind it. Confirm the reduced-motion probe from task
  4.4 in at least one area.
- [ ] 5.6 Confirm the exit bar: `find packages -iname "*.css"` (or `git
  ls-files "packages/**/*.css"`) lists only `tokens.css` and
  `global.css`, and every `git grep '\.css' packages/` match reviewed in
  task 2.3 still holds.
