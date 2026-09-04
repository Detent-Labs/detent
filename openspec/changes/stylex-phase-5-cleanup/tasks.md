## 1. Consolidate global.css

- [x] 1.1 Add `.shell` and `.shell > *` to `global.css`, copied unchanged
  from `shell.css`, with their existing explanatory comments. Add one
  `prefers-reduced-motion` block using the `animation-duration`/
  `transition-duration: 0.01ms !important;` technique (design.md D5).
  Add `.studio-dialog::backdrop` unchanged, with a comment naming why it
  stays literal (design.md D6). Change the file's own header comment to
  name these four additions. Verify the file reads 118 lines (design.md
  D7): `wc -l packages/web/src/shell/global.css`. Done: reads 118.

- [x] 1.2 Verify `bun run typecheck` passes (no source file references
  `global.css` by type, so this should be a no-op check that nothing
  else broke). Done: exits 0.

## 2. Delete the five stylesheets and their imports

- [x] 2.1 Delete `packages/web/src/shell/shell.css`. Delete `import
  "./shell/shell.css";` from `packages/web/src/main.tsx`. Verify `bun
  run build` still succeeds. Confirm the built page still renders the
  shell frame (checked fully in Group 5's browser probe). Done: build
  exits 0.

- [x] 2.2 Delete `packages/web/src/areas/admin/app.css`,
  `packages/web/src/areas/app/app.css`,
  `packages/web/src/areas/reporting/app.css`,
  `packages/web/src/areas/studio/app.css`. Delete each area's own
  `import "./app.css";` from its `root.tsx`. Verify `bun run typecheck`
  and `bun run build` both pass. Done: both exit 0.

- [x] 2.3 Verify `find packages -iname "*.css"` (or `git ls-files
  "packages/**/*.css"`) lists exactly two files:
  `packages/web/src/shell/tokens.css` and
  `packages/web/src/shell/global.css`. Verify `git grep -n '\.css'
  packages/` line by line against design.md D2's categories. Confirm
  every remaining match fits one of three buckets. Category 1 is a
  legitimate tokens.css/global.css reference. Category 3 is
  `vite.config.ts`'s generic `.css`-extension handling. Category 4 is
  an accepted historical comment this change leaves untouched.

  No match is a live import of a deleted file, and none sits in
  `boundaries.test.ts` (Group 3 deletes its own two).
  Done: both `find`/`git ls-files` list exactly the two files. The
  grep drops from 78 to 71 matches: the 5 deleted imports, plus the 2
  lines gone with their deleted files. The 62 non-tokens/global
  matches split exactly as designed. Two sit in `boundaries.test.ts`
  (Group 3's job), two sit in `vite.config.ts`, and 58 are historical
  comments across 47 files.

## 3. Retire the now-vacuous boundary test

<!-- The quoted string is the removed test's exact title, unchanged. -->
<!-- antislop: allow passive-voice -->
- [x] 3.1 Delete `packages/web/test/boundaries.test.ts`'s `it("no class
  name is defined in two areas' stylesheets", ...)` test (design.md,
  Risks). Verify the file's three remaining `it` blocks under `describe("area
  boundaries", ...)` and the `describe("one package, one build", ...)`
  block still pass: `bun test packages/web/test/boundaries.test.ts`.
  Done: 7 pass, 0 fail.

## 4. Correct stale doc references

- [x] 4.1 Rewrite `.claude/rules/design-language.md`'s citations of ten
  stale class names. The first three are `.app-stamp`, `.admin-badge`
  and `.rep-stamp`. The next three are `.app-task-list`,
  `.app-task-row` and `.studio-panels-rail-entry`. The last four are
  `.studio-panels-rail-field`, `.rep-rule`, `.admin-badge-faulted` and
  `.rep-rule-fill-danger`. Describe the owning component for each
  instead, since none of these now compiles to a class name.

  Also rewrite the "Class names" and "The StyleX pilot" passages. The
  whole app compiles now, not a pilot. The naming convention they
  describe applies only to the `.btn`/`.app-back` family, which stays
  permanently literal (design.md D1). Verify none of the ten strings
  above still appears in the file: `grep -c` each, expect 0. Done: 0
  for all ten, plus the pilot/naming passages rewritten.

- [x] 4.2 Rewrite `.claude/rules/ui-glossary.md`'s "Lives in" column and
  prose wherever it cites a class from this migration. Name the owning
  file or component instead. Match the pattern rows without a
  CSS-backed term already use. Verify:
  `grep -oE '`.[a-zA-Z][a-zA-Z0-9-]*`' .claude/rules/ui-glossary.md`
  returns nothing. Done: returns nothing; found and fixed 19 distinct
  citations, four more than the class-prefix grep alone would have
  caught (`.canvas-inspector`, `.step-identity-zone`,
  `.step-behavior-tabs`, `.step-diagnostics`, none `.shell-`/`.studio-`
  prefixed).

- [x] 4.3 Correct `docs/current-state.md`'s six passages. Three cite
  `.studio-form-card[data-conditional]`, `.rep-rule` and
  `.studio-mono`. The other three cite `.studio-canvas-layout`,
  `.studio-edit-screen` and `.studio-matrix-scroll`. Rewrite each to
  describe the current, compiled mechanism.

  Verify each of the six passages. For each, grep for the class name
  and confirm the surrounding sentence no longer claims it as a live
  selector. Done: 0 hits for all six. (The sweep also surfaced
  several `.canvas-` prefixed stale citations in this same file.
  Those sit outside this change's dispatched scope: `.canvas-`
  classes are phase 4's own concern, left untouched here.)

- [x] 4.4 Add a new dated section to `docs/browser-checks.md`, following
  the pattern every prior phase's own section uses. Cover three
  things. First, the five file deletions and where each surviving
  rule now lives. Second, the `boundaries.test.ts` deletion. Third,
  the manual probe for the reduced-motion consolidation (design.md's
  Risks). That probe triggers a transition under
  `prefers-reduced-motion: reduce`, in one screen per area.

  It confirms no visible motion in any of the four. Leave every
  earlier phase's own section untouched. Done: appended
  "Shell and area stylesheets deleted (`stylex-phase-5-cleanup`)".

<!-- The quoted string is the exact pattern prior phases used. -->
<!-- antislop: allow passive-voice -->
- [x] 4.5 Add this phase's own paragraph to `docs/decisions.md`'s StyleX
  entry. Follow the "Phase N (...) is done" pattern the four prior
  paragraphs use. Note the five deletions, and the reduced-motion
  consolidation with its chosen technique. This closes the six-phase
  migration. Change `ROADMAP.md` stage 45 to "PHASES 0-5 DONE." with a
  closing sentence in the same style.

  Verify the antislop and whitespace gates pass on both files:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`,
  run over the committed range once this task's commit lands. Done:
  both paragraphs added; gates verified in 4.6's commit below.

- [x] 4.6 Verify the antislop and whitespace gates pass on every other
  Markdown file this group touched. That set is
  `.claude/rules/design-language.md`, `.claude/rules/ui-glossary.md`,
  `docs/current-state.md` and `docs/browser-checks.md`. Use the same
  two commands as 4.5, run over the committed range. Done: both gates
  exit 0 at HEAD (`d5b06487`), independently re-run.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm zero errors. Done: exits
  0 (verified via `bun run check`, which runs typecheck first).

- [x] 5.2 Run `bun run build` and confirm it succeeds. Done: exits 0.

- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set, piped
  through `scripts/gates/silent-green.sh`. Confirm 0 failures and the
  skip count at the existing floor. Done: `bun run check` captured to a
  log inside the devcontainer, gate run against it on the host. 3812
  pass (one fewer than phase 4's 3813, since Group 3 deleted one test),
  1 skip at the floor, 0 fail, across 207 files. The `test:tz` suite
  adds 20 pass, 0 fail. Gate exits 0.

- [x] 5.4 Run the antislop and whitespace gates over every Markdown file
  this change touched, over the committed range. That set includes
  this change's own `proposal.md`/`design.md`/`tasks.md`/delta spec.
  Confirm both pass with no rising finding count. Done: both exit 0 at
  HEAD (`d5b06487`).

<!-- "edit screen" is the glossary name of the screen. The linter reads
     its "edit" as a synonym of "change". -->
<!-- antislop: allow synonym-rotation -->
- [ ] 5.5 Serve the production build from `WEB_ROOT` (dev mode has a
  known pre-existing `process is not defined` crash in Studio). Via
  `playwright-cli`, open one screen per area. Use My-tasks in `app`,
  the instances list in `admin`, and a report screen in `reporting`.
  In `studio`, use the process list plus one open draft's edit screen.
  Confirm each screen renders with no visual regression from the
  `global.css` consolidation.

  Check three things. The shell frame still centers and fills the
  viewport. Focus rings and button states still render. A studio
  dialog's backdrop still darkens the page behind it. Confirm the
  reduced-motion probe from task 4.4 in at least one area.

- [ ] 5.6 Confirm the exit bar: `find packages -iname "*.css"` (or `git
  ls-files "packages/**/*.css"`) lists only `tokens.css` and
  `global.css`, and every `git grep '\.css' packages/` match reviewed in
  task 2.3 still holds.
