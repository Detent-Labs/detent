# Tasks

## 1. Move the test mechanics into the skill

- [ ] 1.1 Add a "Running the suite" section to `.claude/skills/devcontainer-exec/SKILL.md` per design D2. It carries `CLAUDE.md`'s paragraphs "The host call filters through rtk", "Exit 1 with `0 fail` means the gate rejected the run" and "Three traps in the host call" (with the 2026-09-30 measurement), unchanged in substance. Verify that `grep -n -E 'rtk/tee|sh -c .exit 3.|rtk err' .claude/skills/devcontainer-exec/SKILL.md` prints the three trap lines.

## 2. Slim `CLAUDE.md`

- [ ] 2.1 Rewrite `CLAUDE.md` section by section per design D1, leaving line 1 (the `allow-file` directive) in place. Every rule stays; the anecdotes, the repository layout block and the moved test mechanics go. Verify with `wc -l CLAUDE.md` printing at most 280.
- [ ] 2.2 Verify that every cited statement in design's citation table still holds, one grep per row:
  - `grep -n -F '/admin/*' CLAUDE.md` (the three-defect sentence)
  - `grep -n -i 'real browser' CLAUDE.md`
  - `grep -n -E '3 red runs of 20|0 of 20' CLAUDE.md`
  - `grep -n -F 'DATABASE_URL' CLAUDE.md` (one bold rule)
  - `grep -n -F 'git diff --check' CLAUDE.md`
  - `grep -n -i 'every Markdown file' CLAUDE.md`
  - `grep -n -i 'cheap' CLAUDE.md`
  - `grep -n -i 'authoring \*\*surface\*\*' CLAUDE.md`
  - `grep -n -i 'never on the host' CLAUDE.md`
  - `grep -n -i 'per-machine' CLAUDE.md`

  Record each hit. A row with no hit sends 2.1 back.
- [ ] 2.3 Read the full `git diff` of `CLAUDE.md` once and classify every removed line as history or rule (design Risks). A removed rule goes back in. Record the classification in the task report.

## 3. Repoint stale citations

- [ ] 3.1 Apply design D4 to `scripts/gates/whitespace.sh`, `scripts/gates/silent-green.sh`, `test/compile-validation.test.ts` and `test/definitions.test.ts`. Verify that `git grep -n 'CLAUDE.md' -- scripts test` lists only pointers whose content `CLAUDE.md` holds, and that `sh scripts/dev-exec.sh bun test test/gates.test.ts` passes.

## 4. Remove the file-wide directive

- [ ] 4.1 Per design D3, if the antislop linter is installed: delete line 1 of `CLAUDE.md`, run the linter on the file, and fix each finding or place a targeted `<!-- antislop: allow <rule> -->` with a one-sentence reason next to the line. Verify that `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` reports no rise for `CLAUDE.md`. If the linter is absent, leave this task open and say so.
- [ ] 4.2 Run the antislop linter on every other Markdown file this change touched (the skill, this change's artifacts), if it is installed. Fix each finding or add a targeted directive with a reason. If it is absent, leave this task open and say so.

## 5. Verification

- [ ] 5.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 5.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [ ] 5.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 5.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding; then start apply without asking (owner's rule).
- Archive last, after `devcontainer-on-podman`, `rename-devcontainer-dir` and `drop-windows-host-support`.
- No push until the user says the new machine is set up.
