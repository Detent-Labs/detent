# Tasks

## 1. Add the linter

- [x] 1.1 Add `"oxlint": "1.85.0"` (exact, no caret) to the root `devDependencies`, run `bun install` in the devcontainer, and confirm `bun.lock` changed and `bunx oxlint --version` prints `1.85.0`.
- [x] 1.2 Add the `lint` script from design D2. Put it first in `check` per D4. Confirm that `bun run lint` runs and reports findings. It stays red until group 2.
- [x] 1.3 Run `bun run scripts/thirdparty.ts --write` and confirm `THIRDPARTY.md` names `oxlint` and its license.

## 2. Clear the findings

- [x] 2.1 Delete every directive oxlint reports as unused, line by line per design D6. Confirm `git grep -n 'eslint-disable' -- src packages test scripts` prints nothing and the seven Markdown hits remain.
- [x] 2.2 Fix the 27 warnings per design D5, one fix per rule. Report each `oxlint-disable` directive added, with its reason. Confirm `bun run lint` exits 0.
- [x] 2.3 Prove the dead-directive rule fails the script. On a scratch copy of the tree, never the shared working tree, add one `// eslint-disable-next-line no-debugger` above a plain line. Confirm `bun run lint` exits non-zero and names that line.

## 3. Audit in CI

- [x] 3.1 Add the audit step to `.github/workflows/check.yml` per design D7, right after the `bun install` step. Give it a comment in the file's style that says why it sits in CI and not in `check`.

## 4. Update the prose that names the check steps

- [x] 4.1 Add `lint` as the first step wherever prose lists what `bun run check` runs. The sites are `CLAUDE.md` (Verification), `README.md:109`, `README.md:125`, the CI-local entry in `docs/current-state.md` and the `.githooks/pre-push` header comment at line 7. Confirm with `git grep -n 'bun run check' -- CLAUDE.md README.md docs/current-state.md .githooks`.
- [x] 4.2 Mark CQ-1 and DEP-2 in `docs/decisions.md` resolved per design D9. State the measured count of 92 directives. Leave DEP-1 open. Confirm that `git diff` shows no line of the DEP-1 entry.
- [x] 4.3 Name the audit step where prose lists what CI runs: `ROADMAP.md:27` and the CI-hosted entry in `docs/current-state.md`. Confirm with `git grep -n 'audit' -- ROADMAP.md docs/current-state.md`.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer. Record the exit status.
- [x] 5.2 Run `bun run check` in the devcontainer with `DATABASE_URL` set. It runs lint, typecheck, build, the full `bun test` and `test:tz`. Capture the output in a scratchpad file outside `tmp/`. Run `sh scripts/gates/silent-green.sh` on that file. Record its verdict.
- [x] 5.3 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`, and record what each printed.
- [x] 5.4 Run `sh scripts/gates/lockfile.sh` and `sh scripts/gates/machine-paths.sh`. Record what each printed.
- [ ] 5.5 After the push, confirm that the CI `check` job ran the audit step and that the step passed. Read the step log. The job badge covers every step at once.
