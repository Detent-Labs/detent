## 1. `.claude/rules/process-contract.md`

- [ ] 1.1 Apply C1 through C7 from `tmp/doc-audit/08-rules-contract.md`. Use
      that report's byte-exact anchors, and apply C2 before C3, because C3's
      anchor is the last sentence C2 introduces. Read the file immediately
      before editing it. Narrow the `allow-file` directive on line 14 to
      `em-dash passive-voice sentence-length run-ons`, per `design.md`. The
      facts behind each correction sit in `design.md`, in the seven-row table.
      Verify: `grep -c "order / group" .claude/rules/process-contract.md`
      reports 0.
      Verify: `grep -oE "org\.actor-from-field|three org-aware|validateCrossProcessReadGrant|validationMode|ALLOWED_BY_TYPE|checkRedactableFields|checkColumnMapping|View\.columns" .claude/rules/process-contract.md | sort -u | wc -l`
      reports 8. All eight markers are absent today, so this command fails
      until every correction lands.
      Verify: `grep -c "allow-file em-dash passive-voice sentence-length run-ons" .claude/rules/process-contract.md`
      reports 1.
      Verify: `grep -c "two pickers" .claude/rules/process-contract.md` reports
      0. The studio reads no format or control table. `design.md` records the
      correction, under the seven-row table.
      Verify: `python $HOME/AI/AntiSlop/antislop.py check .claude/rules/process-contract.md`
      exits 0. Its printed advisory lines do not matter; the gate reads the exit
      code. `scripts/gates/prose.sh:48` carries the same `$HOME`-relative path,
      so this trips no `no-machine-paths` gate.

## 2. `.claude/rules/authoring-invariants.md`

- [ ] 2.1 Apply C9 through C16 from `tmp/doc-audit/08-rules-contract.md`. Read
      the file immediately before editing it. Keep every added bullet at six
      sentences or fewer: this file's `allow-file` on line 12 does not silence
      `paragraph-length`. The facts behind each correction sit in `design.md`,
      in the eight-row table.
      Verify: `grep -oE "checkFieldTree|checkFieldFormatControl|checkColumnMapping|checkRedactableFields|wait-state|reserved CEL namespace|injective|non-field-tree" .claude/rules/authoring-invariants.md | sort -u | wc -l`
      reports 8. All eight markers are absent today, so this command fails
      until every correction lands.
      Verify: `grep -c "Checked in" .claude/rules/authoring-invariants.md`
      reports 0. C16 replaces the file's one "Checked in" sentence, which
      credits `checkLengthBounds` for two bounds it no longer owns.
      Verify: `python $HOME/AI/AntiSlop/antislop.py check .claude/rules/authoring-invariants.md`
      exits 0. Its printed advisory lines do not matter; the gate reads the exit
      code.
      Every added bullet appends inside an existing check group. Adding a group
      here, or reordering the existing ones, would make the comment at
      `packages/web/src/areas/studio/draft/checksRail.ts:4` stale.

## 3. `docs/authoring-guide.md`

- [ ] 3.1 Apply C8 from `tmp/doc-audit/08-rules-contract.md`: drop `order` from
      the view-key list on line 482. Read the file immediately before editing
      it. Line 833 already states the list correctly, so leave it alone. This
      file carries no `allow-file` directive. C8 deletes two words and adds
      none, so its finding count cannot rise.
      Verify: `grep -c "its order, its group" docs/authoring-guide.md` reports
      0, and `grep -c "its span, its group" docs/authoring-guide.md` reports 1.

## 4. Scope

- [ ] 4.1 Confirm the change touched three files, all documentation. This
      change edits nothing under `src/`, `packages/`, `test/` or
      `openspec/specs/`. The wrong source comment at
      `src/schema/compile.ts:1218-1220` stays for Change E, per `design.md`.
      Verify: `git diff --name-only origin/main...HEAD` lists
      `.claude/rules/process-contract.md`,
      `.claude/rules/authoring-invariants.md`, `docs/authoring-guide.md` and
      this change's own artifacts, beside what earlier waves on this branch
      already added. It lists `CLAUDE.md` and `openspec/config.yaml` today. No
      `src/`, `packages/`, `test/` or `openspec/specs/` path appears. A bare
      `git diff --stat` reports the worktree, so name the base ref.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` in the devcontainer and confirm it exits 0.
      It proves no accidental code touch, and nothing more: no test asserts
      anything about the two rule files.
- [ ] 5.2 Run `bun run build` in the devcontainer and confirm it exits 0.
- [ ] 5.3 Run the full `bun test` in the devcontainer with `DATABASE_URL` set,
      and confirm 0 failures. Read the skip count, not the pass count alone. A
      single-file rerun is not the signal. Pipe the run through
      `sh scripts/gates/silent-green.sh` and confirm it exits 0.
- [ ] 5.4 Check the coverage first, then run the prose gate over the committed
      range. `sh scripts/gates/range.sh < /dev/null` prints `origin/main..HEAD`,
      and `git diff --name-only origin/main..HEAD -- '*.md'` lists
      `.claude/rules/process-contract.md`,
      `.claude/rules/authoring-invariants.md` and `docs/authoring-guide.md`.
      Before this change lands that command prints `CLAUDE.md` alone, and the
      gate then exits 0 without reading one target file. Output carrying
      "nothing to check" proves nothing.
      Then run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
      The `< /dev/null` belongs on `range.sh`, never on `prose.sh`. Confirm it
      exits 0. All three target files exit 0 at the linter today, so each one's
      base count is 0. Judge the result by the process exit code, never by the
      printed line count.
- [ ] 5.5 Check the same coverage first: `sh scripts/gates/range.sh < /dev/null`
      prints `origin/main..HEAD`, and `git diff --name-only origin/main..HEAD`
      lists the three target files. Then run the whitespace gate over the
      committed range:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
      Confirm it exits 0. Both gates read committed content. A run over a tree
      with uncommitted edits checks nothing and reports green.
- [ ] 5.6 Skip the browser check. No wave in this effort touches
      `packages/web`, and a rule file is not a screen.
