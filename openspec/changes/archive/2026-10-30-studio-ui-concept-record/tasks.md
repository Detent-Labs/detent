# Tasks

The source is the session scratchpad `concept-draft.md` of 2026-10-30. It is
outside git. Read it in full before task 1.1. The linter runs as
`python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check <file>`. A file's
gate count is 0 when the linter exits 0, else the number of lines it prints.

## 1. The design record

- [x] 1.1 Create `docs/studio-ui-concept.md` from the scratchpad's sections 1a to 4, in the order design D1 states, in English. The head names the date and says the record states no requirement. It says the record moves to the archive when stage 64 closes (design D2, D3). Verify: `grep -c '^## ' docs/studio-ui-concept.md` prints at least 8.
- [x] 1.2 Carry the seven principles word for word. Carry the owner's confirmation line and the rating table. Verify: `grep -c 'The canvas is the map' docs/studio-ui-concept.md` prints 1.
- [x] 1.3 Carry decisions D1 to D8 with the options shown and the owner's choice. Carry the vocabulary table with an English way-out example (design D8). Verify: `grep -c 'Freigeben' docs/studio-ui-concept.md` prints 0 and `grep -c 'only if' docs/studio-ui-concept.md` prints at least 1.
- [x] 1.4 Carry the ordered list of 16 changes as a table with name, capabilities, screens, needs and resolves. Name `.claude/rules/ui-glossary.md` and `DESIGN.md` as files (design D5). Verify: `grep -c '^| 1[0-6] \|^| [1-9] ' docs/studio-ui-concept.md` prints 16.
- [x] 1.5 Carry the seven artifact links verbatim in the last section, with the D2 link resolved (design D6). Verify: `grep -o 'claude.ai/artifact/[A-Za-z0-9]*' docs/studio-ui-concept.md | sort -u | wc -l` prints 7.
- [x] 1.6 Lint the record. Verify: `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/studio-ui-concept.md` exits 0.

## 2. Stage 64 in ROADMAP.md

- [x] 2.1 Insert stage 64 under `## Open stages` after stage 43, as `64. **Studio UI overhaul: NOT STARTED.**`. It opens with a dated paragraph. The seven principles follow as a numbered list. The 16 changes follow as a numbered list of name, needs and resolves. A closing line names the record and the studio specs (design D4). Verify: `awk '/^64\. /{f=1} /^## Done/{exit} f' ROADMAP.md | grep -c 'studio-' ` prints at least 16.
- [x] 2.2 Lint the file. Its count is 0 today. Verify: `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check ROADMAP.md` exits 0.

## 3. DRAFT-1 in docs/decisions.md

- [x] 3.1 Record the base count at `HEAD`. Verify: `git show HEAD:docs/decisions.md > /tmp/base.md; python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check /tmp/base.md | grep -c .` prints a number; note it.
- [x] 3.2 Append two sentences to the DRAFT-1 bullet after its risk line, per design D7. A re-check on 2026-10-30 did not reproduce it. The entry stays open until a second check or a found cause. Verify: `grep -c '2026-10-30' docs/decisions.md` prints at least 1 and `grep -n 'DRAFT-1' docs/decisions.md` prints one line.
- [x] 3.3 Re-lint and compare with 3.1. Verify: `python3 "${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}" check docs/decisions.md | grep -c .` prints a number at or below the 3.1 base.

## 4. Gates and validation

- [x] 4.1 Commit the three files and the change folder, then run the prose gate on the host. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0.
- [x] 4.2 Run the whitespace gate on the host. Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` exits 0.
- [x] 4.3 Confirm nothing outside Markdown changed. The change folder's `.openspec.yaml` and the hook's `VERSION` bump are the two non-Markdown files allowed. Verify: `git diff --name-only origin/main..HEAD | grep -v '\.md$' | grep -vc '^VERSION$\|/\.openspec\.yaml$'` prints 0.
- [x] 4.4 Validate the change. Verify: `openspec validate studio-ui-concept-record --strict` exits 0 on the `skip_specs: true` marker.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer. Verify: it exits 0.
- [x] 5.2 Run `bun run build` in the devcontainer. Verify: it exits 0.
- [x] 5.3 Run the full `bun test` in the devcontainer with `DATABASE_URL` set, through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Verify: 0 fail, the gate accepts the run, and the skip count sits at the floor.
- [x] 5.4 Confirm no browser check applies. Verify: `git diff --name-only origin/main..HEAD | grep -c '^packages/'` prints 0.

## Workflow follow-up

- Archive the change, push the branch and open the PR.
- Change 1 of the list, `studio-fresh-draft-starts-clean`, starts after the merge.
