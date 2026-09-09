## 1. The dependency generator

- [ ] 1.1 Add `scripts/thirdparty.ts` from report 02's C7, verbatim at 59
      lines. Register it in the root `package.json` scripts block, beside
      `seed`, as `"thirdparty": "bun run scripts/thirdparty.ts"`. Run it in
      the devcontainer, after `bun install`: it reads licenses off disk and
      throws on a stale `node_modules`. Verify:
      `grep -q thirdparty package.json` exits 0. Verify:
      `bun run thirdparty | grep -q stylexjs` exits 0.

## 2. THIRDPARTY.md

- [ ] 2.1 Apply report 02's C1 through C6, from that report's byte-exact
      anchors. Produce the table with `bun run thirdparty --write`, never by
      hand. Then run the script with no `--write` and compare its stdout
      against the committed table. The two must match byte for byte. Verify:
      `bun run thirdparty > /tmp/tp.md && awk '/^\| Package \|/,/^$/' THIRDPARTY.md | grep -v '^$' > /tmp/tpc.md && diff /tmp/tp.md /tmp/tpc.md`
      exits 0. Verify: `grep -q stylexjs THIRDPARTY.md` exits 0. Verify:
      `grep -q 7.0.2 THIRDPARTY.md` exits 0. Verify:
      `grep -q Babel THIRDPARTY.md` exits 0. Verify:
      `grep -q "resolve once" THIRDPARTY.md` exits 0. Verify:
      `grep -q "thirdparty.ts --write" THIRDPARTY.md` exits 0. Verify:
      `grep -q immer THIRDPARTY.md` exits 1.

## 3. docs/current-state.md

- [ ] 3.1 Apply report 04's C1 through C16, from that report's byte-exact
      anchors. Apply C1 through C13 and C16 first, then insert C14 and C15,
      which shift every line below them. C3 needs its two-line anchor, which
      is what separates `:1816` from `:1857`. Do not expand
      `form-ui/tokens.stylex` to a repository-relative path: it is the import
      specifier `CanvasView.tsx:3` writes. Verify:
      `grep -q "app\.css" docs/current-state.md` exits 1. Verify:
      `grep -q PublishMenuItem docs/current-state.md` exits 1. Verify:
      `grep -q "three operations" docs/current-state.md` exits 1. Verify:
      `grep -q PublishNavControl docs/current-state.md` exits 0. Verify:
      `grep -q step-graph docs/current-state.md` exits 0. Verify:
      `grep -q instance-drafts docs/current-state.md` exits 0. Verify:
      `grep -q instance-query-source docs/current-state.md` exits 0. Verify:
      `grep -q web-styling docs/current-state.md` exits 0.

## 4. docs/decisions.md

- [ ] 4.1 Apply report 05's C1 through C8b, from that report's byte-exact
      anchors. Run C5's structural move first, on the current-tree line
      numbers. The other eight replacements are position-independent, so
      apply them afterwards. Keep the seven moved entries in their original
      relative order. Leave `  result.` as the file's last line, with its two
      leading spaces and no blank line after it. Verify:
      `grep -q "Decided and built" docs/decisions.md` exits 0. Verify:
      `grep -c "routes.ts:481" docs/decisions.md` reports 2. Verify:
      `grep -c "root.tsx:86" docs/decisions.md` reports 2. Verify:
      `grep -q ProcessSurface docs/decisions.md` exits 0. Verify:
      `grep -q "routes.ts:449" docs/decisions.md` exits 1. Verify:
      `grep -q EditorArea docs/decisions.md` exits 1. Verify:
      `grep -q "Two types now" docs/decisions.md` exits 1.

## 5. ROADMAP.md

- [ ] 5.1 Apply report 06's C1, C2 and C3, from that report's byte-exact
      anchors. Run C2 before C3, or stage 44's text is gone before its row
      exists. Task 6.1 lands in the same commit, since `ROADMAP.md:10-12`
      binds a finished stage to a row plus a history entry. Verify:
      `grep -q "^63\." ROADMAP.md` exits 0. Verify:
      `grep -q "^| 44 |" ROADMAP.md` exits 0. Verify:
      `grep -q "^45\." ROADMAP.md` exits 1.

## 6. docs/roadmap-history.md

- [ ] 6.1 Apply report 06's C4, C5 and C6, from that report's byte-exact
      anchors. Entry 44 goes between 42 and 45. Entries 61 and 62 append, in
      that order. Write the stage 62 entry from the shipped rule, never from
      its proposal's plan. Verify: `grep -q "^44\." docs/roadmap-history.md`
      exits 0. Verify: `grep -q "^61\." docs/roadmap-history.md` exits 0.
      Verify: `grep -q "^62\." docs/roadmap-history.md` exits 0.

## 7. README.md

- [ ] 7.1 Apply report 07's C1, C2 and C3, from that report's byte-exact
      anchors. C2 inserts a whole grid row, so apply it after C1. Verify:
      `grep -q tenancy README.md` exits 0. Verify:
      `grep -q livez README.md` exits 0. Verify:
      `grep -q "8080:8080 web" README.md` exits 0. Verify:
      `grep -q "8080:8080 app" README.md` exits 1.

## 8. PRODUCT.md

- [ ] 8.1 Apply report 07's C4, C5 and C6, from that report's byte-exact
      anchors. Anchor on text: the audit's three line numbers are four lines
      early. Verify: `grep -q "Nine example" PRODUCT.md` exits 0. Verify:
      `grep -q it-onboarding PRODUCT.md` exits 0. Verify:
      `grep -q "system stack" PRODUCT.md` exits 0. Verify:
      `grep -q "99 capability" PRODUCT.md` exits 1.

## 9. .claude/rules/design-language.md

- [ ] 9.1 Apply report 07's C7 and C8, from that report's byte-exact anchors.
      Leave the pre-existing clause `It carries no stamp` byte-identical:
      rewriting it is what holds this file's prose delta at zero. Keep the
      word `issue` out of the file, since `error` already names that concept
      here. Verify: `grep -q EntityTabs .claude/rules/design-language.md`
      exits 0. Verify: `grep -q StepsRail .claude/rules/design-language.md`
      exits 0. Verify: `grep -q "studio-dialog::backdrop"
      .claude/rules/design-language.md` exits 0. Verify:
      `grep -q PanelsScreen .claude/rules/design-language.md` exits 1.

## 10. The two live specs

- [ ] 10.1 Apply report 07's C9 to
      `openspec/specs/authored-content-localization/spec.md`. One word
      changes, on line 127. Verify:
      `grep -q StepsRail openspec/specs/authored-content-localization/spec.md`
      exits 0. Verify:
      `grep -q StepsPanel openspec/specs/authored-content-localization/spec.md`
      exits 1.
- [ ] 10.2 Apply report 07's C10 to `openspec/specs/studio-canvas/spec.md`.
      One word changes, on line 102. Leave `PathsPanel` alone in the same
      sentence, since that component still exists. Verify:
      `grep -q StepsRail openspec/specs/studio-canvas/spec.md` exits 0.
      Verify: `grep -q StepsPanel openspec/specs/studio-canvas/spec.md` exits
      1.

## 11. Verification

- [ ] 11.1 Run `bun run typecheck` in the devcontainer and confirm it exits 0.
      It proves no code file was touched by accident. Then run
      `git status --porcelain -- THIRDPARTY.md package.json docs/current-state.md docs/decisions.md ROADMAP.md docs/roadmap-history.md README.md PRODUCT.md .claude/rules/design-language.md openspec/specs/authored-content-localization/spec.md openspec/specs/studio-canvas/spec.md scripts/thirdparty.ts`
      and confirm twelve entries. Naming the paths is what makes the new
      untracked `scripts/thirdparty.ts` appear; `git diff --stat` never shows
      it, and reports the shared tree's own `VERSION` edit instead. Then run
      `git status --porcelain -- src packages test` and confirm it prints
      nothing.
- [ ] 11.2 Run `bun run build` in the devcontainer and confirm it exits 0.
- [ ] 11.3 Run the full `bun test` in the devcontainer, with `DATABASE_URL`
      set, and confirm 0 failures. Read the verdict off a named failure,
      never off a pass count. Capture the run, then hand the capture to the
      gate:
      `bun test 2>&1 | tee /tmp/t.log; sh scripts/gates/silent-green.sh /tmp/t.log`.
      The script reads its path from `$1`, so a bare pipe into it exits 1 with
      "No captured run at". Confirm the gate exits 0.
- [ ] 11.4 Lint the six unarmed Markdown files on the host, and read the exit
      code rather than the printed line count. Run
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check <file>` over
      each of `THIRDPARTY.md`, `docs/decisions.md`, `ROADMAP.md`,
      `docs/roadmap-history.md`, `PRODUCT.md` and
      `.claude/rules/design-language.md`. Each one must exit 0, the way it
      does today. At exit 0 the gate scores the file 0 at both ends, so an
      advisory line changes nothing. At exit 1 every printed line counts, and
      a file that exits 0 at the base and 1 at the tip is a rise.
- [ ] 11.5 Check the worktree bytes of the twelve changed paths. The push
      gate reads committed content and this change stays uncommitted here, so
      the gate would see none of it. Run `git ls-files --eol` over the eleven
      tracked paths of task 11.1 and confirm every row reads `w/lf`. Run
      `grep -rnE '[[:blank:]]+$'` over the same paths and confirm no hit; the
      bracket form catches a trailing tab, which `git diff --check` also
      rejects and a plain space probe misses. Run
      `tail -c 2 <file>` on each and confirm no file ends in a blank line.
      `scripts/thirdparty.ts` is untracked, so `git ls-files --eol` skips it:
      confirm its line endings with `file scripts/thirdparty.ts`.
- [ ] 11.6 Measure the four armed files on the host. The devcontainer does not
      carry the linter, which is why `scripts/gates/prose.sh` resolves it from
      `$ANTISLOP` with a `$HOME`-relative fallback. Run
      `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check <file>` on
      each, and confirm the count is at or below its base:
      `docs/current-state.md` 619, `README.md` 23,
      `openspec/specs/authored-content-localization/spec.md` 9, and
      `openspec/specs/studio-canvas/spec.md` 107. Each of the four exits 1
      today. A rise blocks the push, whatever the absolute number is.

The two range-based push gates belong to the controller, who commits. Both read
committed content: `scripts/gates/prose.sh` reads each side through
`git show`, and `scripts/gates/whitespace.sh` takes its file list from
`git diff --name-only`. Run them after the commit and before the push:
`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, then
`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`. The
`< /dev/null` belongs on `range.sh` alone, never on the consumer.
