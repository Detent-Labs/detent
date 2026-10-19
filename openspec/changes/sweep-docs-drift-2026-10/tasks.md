# Tasks

## 1. The authoring guide

- [x] 1.1 Apply design.md D1 (H-4, H-5, H-6, B-13) to `docs/authoring-guide.md`. Verify with a search for each old anchor, which finds nothing.
- [x] 1.2 Run the antislop linter on `docs/authoring-guide.md`. Verify the count does not rise over `origin/main`.

## 2. ROADMAP.md and the roadmap history

- [x] 2.1 Apply design.md D2's Stage 40 and count fixes to `ROADMAP.md`. Verify with a search for each old anchor.
- [x] 2.2 Move Stage 63 to the Done table and its prose to `docs/roadmap-history.md`. Verify `ROADMAP.md` lists no stage 63 under Open stages.
- [x] 2.3 Run the antislop linter on both files. Verify neither count rises over `origin/main`.

## 3. README.md and CLAUDE.md

- [x] 3.1 Apply design.md D3's two `README.md` fixes. Verify the handler list matches `src/engine/host.ts`.
- [x] 3.2 Apply design.md D3's layout rows and audit pointer to `CLAUDE.md`. Verify each named path exists.
- [x] 3.3 Run the antislop linter on both files. Verify neither count rises over `origin/main`.

## 4. Code comments

- [ ] 4.1 Apply design.md D5 to the comments in `src/` and `scripts/`. Change no code token.
- [ ] 4.2 Verify with `git diff` that every changed line sits inside a comment.

## 5. The process access entry test

- [ ] 5.1 Add the test design.md D4 names to `test/http-process-access.test.ts`. Verify it passes in the full suite run of 7.2.

## 6. decisions.md and the deployment runbook

- [ ] 6.1 Apply design.md D6's H-7, A-9d and B-10 edits to `docs/decisions.md`.
- [ ] 6.2 Re-point every line citation in `docs/decisions.md` per design.md D6. List each dropped or reworded citation in the SDD ledger.
- [ ] 6.3 Prove the hand-run schema command against the devcontainer's database. Then apply D6's runbook edits to `docs/runbooks/deployment.md`.
- [ ] 6.4 Run the antislop linter on both files. Verify neither count rises over `origin/main`.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` and `bun run build` in the devcontainer.
- [ ] 7.2 Run the full gated suite with `DATABASE_URL` set: `sh scripts/test-gated.sh bun test`.
- [ ] 7.3 On the host, pipe `sh scripts/gates/range.sh < /dev/null` into `prose.sh`, then into `whitespace.sh`.

## Workflow follow-up

- Delete this change's entry and the emptied audit index section in `docs/decisions.md` when it archives.
- After the last merge of `main`, re-check the citations in any file that merge touched.
- At sync, change the `authorization` Purpose by hand, per design.md D4.
