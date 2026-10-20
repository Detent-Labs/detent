# Tasks

## 1. Move the directory and its readers

- [x] 1.1 Run `git mv .devcontainer/Dockerfile container/Dockerfile` per design D2. On this machine, move `.devcontainer/.auth-secret` and `.devcontainer/server.log` into `container/` with `mv`, then delete the leftover `.devcontainer/` directory. Verify with `git status --short` showing the rename and `ls -A .devcontainer` failing.
- [x] 1.2 Point `scripts/dev-pod.sh` (build context, `-f`, `POD_YAML`, header comment) and `scripts/dev-up.sh` (`SECRET_FILE`, the server-log redirect and its comment) at `container/`. Verify that `bash scripts/dev-up.sh` exits 0, prints `preflight (serve): all checks passed`, and keeps the secret: `container/.auth-secret` is byte-identical before and after.
- [x] 1.3 In `.gitignore`, replace the three `.devcontainer/` entries with `container/pod.yaml`, `container/.auth-secret` and `container/server.log`. Add one line `.devcontainer/` under a comment. The comment says the directory is gone. It also says the entry keeps a stale clone's secret and log out of git (design Risks). In `.dockerignore`, replace `.devcontainer` with `container`. Verify that `git status --short --ignored container` lists the three files as ignored.
- [x] 1.4 Add `container` to `REQUIRED_ENTRIES` in `test/dockerignore.test.ts` per design D4, and set the container-path fixture label in `test/gates.test.ts` to `container/Dockerfile`. Leave the pre-fix fixture at `test/dockerignore.test.ts:103` unchanged. Verify that the dockerignore test fails on a scratch copy whose `.dockerignore` lacks `container`, and passes on the real file.

## 2. Documents and comments

- [x] 2.1 Replace the directory path in `CLAUDE.md` (the layout line and the `.devcontainer/Dockerfile` pin mention), `README.md`, `docs/browser-checks.md`, `docs/current-state.md`, `.claude/skills/devcontainer-exec/SKILL.md` and the comment in `docker/engine.Dockerfile`. Keep the concept word "devcontainer" wherever it names the dev container rather than the directory, per the proposal. Verify with `git grep -n -F '.devcontainer' -- . ':!openspec/changes/archive' ':!openspec/changes/devcontainer-on-podman' ':!openspec/changes/rename-devcontainer-dir' ':!openspec/specs'` printing exactly two hits: the pre-fix fixture at `test/dockerignore.test.ts:103` (design D4) and the retired-directory guard line in `.gitignore` (task 1.3).
- [x] 2.2 Change the Purpose paragraph of `openspec/specs/production-docker-images/spec.md` to name `container/Dockerfile`. A delta cannot change a Purpose, so the main spec takes the new text directly. Verify with `grep -n 'container/Dockerfile' openspec/specs/production-docker-images/spec.md`.
- [x] 2.3 Run the antislop linter on every Markdown file this change touched, if the machine has it. Fix each finding or add a targeted directive with a reason. If it is missing, leave this task open and say so.

## 3. Verification

- [x] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [x] 3.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [x] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [x] 3.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding before apply.
- Archive only after `devcontainer-on-podman` has archived (design D3).
- No push until the user confirms the new machine is ready.
