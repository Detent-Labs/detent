# Tasks

## 1. Runner

- [x] 1.1 Add `scripts/test-gated.sh` as design.md describes. Verify that `git ls-files --eol scripts/test-gated.sh` reports `i/lf` after staging.
- [x] 1.2 Add the three runner cases design.md names to `test/gates.test.ts`. Verify that the no-database case fails when the runner drops its gate call. Verify that the red case fails when the runner drops the command's exit code.
- [x] 1.3 Run the host call from design.md. Verify three exit codes: 0 for the full suite, 1 with `env -u DATABASE_URL` before `sh`, and 1 for a red test file.
- [x] 1.4 Place the red test file with `docker cp` from the session scratchpad into the container's `/root`. Delete it after the run.
- [x] 1.5 Read the red run's output. Verify that it keeps each failing test's name, its diff and its stack lines.

## 2. Documentation

- [x] 2.1 Replace the hand pipe in the `CLAUDE.md` bullet on `DATABASE_URL` with the two runner calls from design.md. Verify that the host call runs as written and exits 0.
- [x] 2.2 Add the measured values, their date and the rtk version to that bullet. Verify that the text names the meaning of exit 1 with `0 fail` and the three traps from design.md.
- [x] 2.3 Run the antislop linter on each Markdown file this change touches. Verify that it reports no finding the base did not carry.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` and `bun run build` in the devcontainer. Verify that both exit 0.
- [x] 3.2 Run the full `bun test` suite with `DATABASE_URL` set in the devcontainer. Verify 0 fail and a skip count at or below the floor.
- [x] 3.3 Run the prose gate and the whitespace gate on the host, each fed by `range.sh`. Verify that both exit 0.
