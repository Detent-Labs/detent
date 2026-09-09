## 1. Devcontainer image and mount

- [x] 1.1 Stop the stack with `docker compose -f .devcontainer/docker-compose.yml down`
- [x] 1.2 Delete `${COMPOSE_PROJECT_NAME}_pgdata`, taking that name from `scripts/worktree-env.sh`
- [x] 1.3 Set the `db` image to `postgres:latest` in `.devcontainer/docker-compose.yml`
- [x] 1.4 Move the mount to `pgdata:/var/lib/postgresql` in that same file
- [x] 1.5 Update the header comment in that file so it names no major
- [x] 1.6 Update the `db` comment in `.devcontainer/devcontainer.json` the same way
- [x] 1.7 Guard the mount and the tag in `test/worktree-env.test.ts`, mutation-tested

## 2. Bring the new server up

- [x] 2.1 Run `bash scripts/dev-up.sh`, which installs, seeds and runs the preflight
- [x] 2.2 Confirm the preflight reported all six of its checks as passed
- [x] 2.3 Print `SHOW data_directory` and confirm the path sits inside the mounted volume
- [x] 2.4 Confirm `docker volume ls` grew no anonymous volume for the `db` service
- [x] 2.5 Restart the stack and confirm the seeded rows are still readable
- [x] 2.6 Record `SELECT version()` output, which the stamps in group 3 will carry

## 3. Re-measure the claims dated to 16.15

- [x] 3.1 Record in `src/engine/store.ts` whether the `startedAt` generated column still raises
- [x] 3.2 Record in `src/engine/store.ts` whether membership alone still withholds SET
- [x] 3.3 Record in `src/engine/store.ts` whether re-requesting admin option still raises `0LP01`
- [x] 3.4 Record whether the `::int` cast raises for 2147483648 and for -2147483649
- [x] 3.5 Write that cast result into `src/runtime/api.ts` and `test/runtime-api.test.ts`
- [x] 3.6 Update the version stamp beside each of the four claims above
- [x] 3.7 Raise a finding for any claim that moved, rather than repairing it here

## 4. Documentation

- [x] 4.1 Update the Postgres line in `openspec/config.yaml` so it names no major
- [x] 4.2 Update both PostgreSQL 16 mentions in `CLAUDE.md`, at lines 223 and 380
- [x] 4.3 Update the `postgres:16` row in `THIRDPARTY.md` to the floating tag
- [x] 4.4 Confirm `docs/CODE_REVIEW-*.md` and the OpenSpec archive stayed untouched

## 5. Verification

- [x] 5.1 Stop the server `dev-up.sh` started, with `pkill -f "src/http/server.ts"`
- [x] 5.2 Run `bun run typecheck` and report what it printed
- [x] 5.3 Run `bun run build` and report what it printed
- [x] 5.4 Run the FULL `bun test` with `DATABASE_URL` set, reporting passes and skips
- [x] 5.5 Pipe that run through `scripts/gates/silent-green.sh` and report its verdict
- [x] 5.6 Run the prose gate over the changed Markdown, as CLAUDE.md specifies
- [x] 5.7 Run the whitespace gate over the same range, as CLAUDE.md specifies
