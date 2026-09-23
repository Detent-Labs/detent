# Tasks

## 1. Dependency and configuration

- [x] 1.1 Add `@playwright/test` to the root `devDependencies`. Run `bun install` in the devcontainer. Then run `bun run scripts/thirdparty.ts --write`. Verify: `THIRDPARTY.md` gains the row, and `sh scripts/gates/lockfile.sh` passes.
- [x] 1.2 Write `playwright.config.ts` per design D2. Add `test-results/`, `playwright-report/` and `e2e/.auth/` to `.gitignore`. Add `e2e` and `playwright.config.ts` to the root `tsconfig.json` include list. Verify: `bun run typecheck` passes.
- [x] 1.3 Verify that `bun test` collects no file under `e2e/`. Read the file list the run prints, and name the check in the ledger.

## 2. The run script

- [x] 2.1 Write `scripts/e2e.ts` per design D1, steps 1 to 3 and 6 to 8. Add the root script `"e2e": "bun run scripts/e2e.ts"`. Verify: the script exits non-zero and names `DATABASE_URL` when that variable is unset. A run without `packages/web/dist` names `bun run build`.
- [x] 2.2 Add the account and the draft per design D3, as step 5 of the script. Verify: after a run, the `_e2e` database holds the account and the draft. The development database keeps its row count in `definitions` and `auth_users`.
- [x] 2.3 Verify the cleanup path. Run the suite with one flow forced to fail. Then confirm that no `src/http/server.ts` process stays alive in the container.

## 3. The four flows

- [x] 3.1 Write the `setup` project and `e2e/areas.e2e.ts` per design D4, the **areas** flow. Verify: it passes, and it fails when the flow expects "Something went wrong." to render.
- [x] 3.2 Write `e2e/task.e2e.ts` per design D4, the **task** flow. Verify: it passes. On a throwaway commit, remove the navigation to My tasks after a submit in `TaskScreen.tsx`. See the flow fail by name. Undo that commit with `git revert`.
- [x] 3.3 Write `e2e/cancel.e2e.ts` per design D4, the **cancel** flow. Verify: it passes. On a throwaway commit, make `InstancesScreen.tsx` keep its first loaded list across a remount. See the flow fail by name, then `git revert` the commit.
- [x] 3.4 Write `e2e/publish.e2e.ts` per design D4, the **publish refusal** flow first and the **publish** flow second. Verify: both pass. On a throwaway commit, render the refusal in the header banner instead of in the dialog. See the refusal flow fail by name, then `git revert` the commit.

## 4. CI

- [ ] 4.1 Add the `e2e` job to `.github/workflows/check.yml` per design D5. Verify: the pull request's checks list `e2e` beside `check`, and it runs green. Read the job log for the four flow names.

## 5. Documentation

- [x] 5.1 Remove the covered steps from `docs/browser-checks.md` per design D6. Add the pointer to `bun run e2e` under "Before you start". Verify: every removed step maps to an assertion in an `e2e/*.e2e.ts` file.
- [x] 5.2 Add a short "Smoke suite" section to `README.md`: the install command and `bun run e2e`. In `CLAUDE.md`'s Verification section, change the sentence that names the split rule to name three homes. Verify: `rg -n 'bun run e2e' README.md docs/browser-checks.md` finds both files.
- [x] 5.3 Check `docs/current-state.md` for a tooling passage that lists the root scripts or the test layout. If one exists, add `bun run e2e` and `e2e/` there.

## 6. Verification

- [ ] 6.1 In the devcontainer with `DATABASE_URL` set, run `bun run check`. It runs `bun run typecheck`, `bun run build`, the full `bun test` suite and `test:tz`. Pipe the output through `sh scripts/gates/silent-green.sh`, and report what each step printed.
- [ ] 6.2 In the devcontainer, run `bun run e2e` twice in a row. Report the flow count and the pass count of each run.
- [ ] 6.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and report its output.
- [ ] 6.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` and report its output.
- [ ] 6.5 This change touches no screen, so it does not need a manual browser check. The CI run of task 4.1 is the browser evidence.
