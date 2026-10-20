# Tasks

## 1. Derivation, Pod spec generator and exec helper

- [x] 1.1 Rename `COMPOSE_PROJECT_NAME` to `DEV_POD` in `scripts/worktree-env.sh` per design D3, and update its header comment to name the pod instead of a Compose project. Keep the derivation itself unchanged. `dev-up.sh`, `preflight.sh` and the pre-push hook read the old name until groups 2 and 3 land, so push nothing before group 3 is done. Verify with `git grep -n COMPOSE_PROJECT_NAME -- scripts/worktree-env.sh` printing nothing.
- [x] 1.2 Create `scripts/dev-pod.sh` (POSIX sh) with the `spec` subcommand per design D2, D3 and D6. It prints a `kind: Pod` named `$DEV_POD` with the containers `app`, `db` and `mailpit`, a `hostPath` volume at the checkout's toplevel, and a claim named `$DEV_POD-pgdata` mounted at `/var/lib/postgresql`. The `app` container runs image `localhost/$DEV_POD-app:latest` and carries the env values `.devcontainer/docker-compose.yml` sets today, with `localhost` in place of `db` and `mailpit`. The `db` container runs `docker.io/library/postgres:latest`, sets the three `POSTGRES_*` values the compose file sets, and passes `postgres -c log_timezone=Europe/Zurich -c timezone=Europe/Zurich` as `args`, never as `command`, so the image's entrypoint still runs `initdb`. The `mailpit` container runs `docker.io/axllent/mailpit:v1.27`. Every image name carries its registry host, per design D2. Every string scalar is double-quoted, with `"` and `\` escaped. Ports: `app` 3000→`$PORT_APP` and 5173→`$PORT_VITE`, `mailpit` 8025→`$PORT_MAILPIT`, each with `hostIP: 127.0.0.1`. Each container gets the liveness probe design D6 names. `spec` calls no `podman`. Verify by running `sh scripts/dev-pod.sh spec` on the host and reading the YAML.
- [x] 1.3 Stop the Compose-era stack on this machine first, since it holds the same host ports: `docker compose -f .devcontainer/docker-compose.yml down`. Then add the `up` and `down` subcommands to `scripts/dev-pod.sh` per design D5 and D6. `up` builds `localhost/$DEV_POD-app:latest` from `.devcontainer/Dockerfile`, per design D3, writes `.devcontainer/pod.yaml`, and replays only when the pod is missing, the spec changed, or the image id changed. It then polls `podman healthcheck run` on every container for up to `DEV_POD_WAIT_SECONDS` (default 120) seconds. On timeout it names the container and prints `podman logs <container>`. Verify that a second `up` against a running pod leaves the `app` container id unchanged, and that `DEV_POD_WAIT_SECONDS=0` against a fresh volume fails and names the database container.
- [ ] 1.4 Create `scripts/dev-exec.sh` per design D4. Verify that `sh scripts/dev-exec.sh bun --version` prints the Bun version that `.devcontainer/Dockerfile` pins.
- [ ] 1.5 In `.gitignore`, replace the `docker-compose.override.yml` and `docker-compose.ports.yml` entries with `.devcontainer/pod.yaml`. Verify that `git status --short` shows no `pod.yaml` after an `up`.
- [ ] 1.6 Update `test/worktree-env.test.ts`: rename the variable, and replace the three compose-file tests with tests over `sh scripts/dev-pod.sh spec` output. Cover each scenario the delta specs give for the spec: the main checkout's pod name `workflow-engine`; the `PORT_VITE` value and both `CORS_ALLOWED_ORIGINS` forms; the pgdata mount at the parent of PGDATA; `postgres:latest`; every `image:` carrying a registry host (a dot before its first `/`, or the `localhost/` prefix); the database container passing its server flags as `args`; every `hostPort` beside `hostIP: 127.0.0.1`; no SMTP, Postgres or sink port published; the database probe passing `-h 127.0.0.1`; a linked worktree's spec carrying that worktree's pod name, ports and path, and a `CORS_ALLOWED_ORIGINS` naming its derived `PORT_VITE` under both `localhost` and `127.0.0.1`; a worktree path holding a space producing a spec `Bun.YAML.parse` reads back with that exact path. Verify that each new test fails against a deliberately wrong spec on a scratch copy, and passes on the real one.

## 2. Bring-up and preflight

- [ ] 2.1 Rewrite `scripts/dev-up.sh` per design D5 and the `devcontainer-preflight` delta: run `sh scripts/dev-pod.sh up` (which waits for the database), then run install, seed, superuser setup and the server start through `scripts/dev-exec.sh`, with `podman exec -d` for the server. Drop the override and ports-file logic. Keep the final address printout. Verify that a re-run against a prepared pod passes and leaves the pod's container ids unchanged.
- [ ] 2.2 Rewrite `scripts/preflight.sh` per design D7: check 1 asks `podman info` and prints `podman info` as the command that shows the cause, check 2 runs `podman healthcheck run` on each container, checks 3 and 5 exec through Podman, and the check 5 repair command runs through `scripts/dev-exec.sh`. Keep check 6 unchanged. Verify `bash scripts/preflight.sh serve` passes against the running pod, and that `core` fails at check 2 with the bring-up command after `sh scripts/dev-pod.sh down`.

## 3. Push hook, gates and CI

- [ ] 3.1 Replace the `docker compose` calls in `.githooks/pre-push` and `scripts/gates/lockfile.sh` with `scripts/dev-exec.sh`, including the repair command `lockfile.sh` prints. Update the comments that name Compose or Git Bash path rewriting. Verify with `sh scripts/gates/lockfile.sh` exiting 0 against the running pod.
- [ ] 3.2 Update `.github/workflows/check.yml` per design D8. Both jobs start the stack with `sh scripts/dev-pod.sh up`, and every exec step runs through `sh scripts/dev-exec.sh`. Keep the step names `test/gates.test.ts` reads. Update the comments that name `docker compose` or `docker-compose.yml`. Verify that the workflow tests in `test/gates.test.ts` pass.
- [ ] 3.3 In `test/gates.test.ts`, point `PLAIN_INSTALL` at the new exec form. Replace the `.devcontainer/devcontainer.json` label in the container-path test with a tracked path that survives this change. Update the comment in `scripts/gates/machine-paths.sh` per the `push-gate-checks` delta. Verify that the gates tests pass.

## 4. Remove the Compose files

- [ ] 4.1 Delete `.devcontainer/docker-compose.yml` and `.devcontainer/devcontainer.json`. Move the comments that still apply into `scripts/dev-pod.sh`: the PGDATA-parent reasoning, the webhook sink, `ALLOW_INSECURE_DEV_AUTH`, the egress allowlist and the timezone GUC. Update `THIRDPARTY.md`'s note about where the Postgres and Mailpit images come from. Verify with `git grep -n -i -E 'docker[ -]compose|devcontainer\.json' -- . ':!openspec/changes/archive' ':!openspec/changes/devcontainer-on-podman'` listing no file outside the specs this change's deltas replace.

## 5. Documentation

- [ ] 5.1 Rewrite `.claude/skills/devcontainer-exec/SKILL.md` around `scripts/dev-pod.sh` and `scripts/dev-exec.sh`. Drop the override-file and Git Bash sections, and keep the dev-server instructions with `--host 0.0.0.0`. Verify that every command in it runs as written against the running pod.
- [ ] 5.2 Update `README.md`: Podman as the requirement, the bring-up, the one-time cleanup of a Compose-era stack per design's Migration Plan, and line 107's `DATABASE_URL` host. Update `docs/browser-checks.md`'s operating rules per the `development-toolchain` delta's checklist requirement. Update the two `docs/decisions.md` entries that cite the compose file. Verify that each command the README shows runs as written.
- [ ] 5.3 Update `CLAUDE.md`: the `.devcontainer/` layout line, the host test call per design D4, and every other `docker compose` or compose-file mention. Verify with `git grep -n -i compose CLAUDE.md` printing nothing.
- [ ] 5.4 Update the remaining Compose mentions: `.env.example` (three comments, including the `ALLOW_INSECURE_DEV_AUTH` explanation, which now names the generated Pod spec), `ROADMAP.md`'s tooling paragraph ("derives its own Compose project name"), the header comment of `scripts/dev-webhook-sink.ts`, the devcontainer sentence in `openspec/config.yaml`'s `context:`, and the Tooling entry's paths in `docs/current-state.md` (add `scripts/dev-pod.sh` and `scripts/dev-exec.sh`). Verify with `git grep -n -i compose -- .env.example ROADMAP.md scripts/dev-webhook-sink.ts openspec/config.yaml docs/current-state.md` printing nothing.
- [ ] 5.5 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason.

## 6. Fresh bring-up on the host

- [ ] 6.1 Remove what the Compose-era stack left on this machine: the `workflow-engine_pgdata` volume and any remaining `workflow-engine-*-1` container or `workflow-engine_default` network. Then run `sh scripts/dev-pod.sh down`, remove the `workflow-engine-pgdata` volume, and run `bash scripts/dev-up.sh` once, from no pod and no volume. Verify that the first run exits 0 and that `preflight (serve): all checks passed` prints.
- [ ] 6.2 Verify the published addresses from the host: `curl` on `127.0.0.1:$PORT_APP/livez` and `127.0.0.1:$PORT_MAILPIT/` both answer 200, and `ss -ltn` shows those ports bound on `127.0.0.1` only.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` in the devcontainer. Record the exit status.
- [ ] 7.2 Run `bun run lint` and `bun run build` in the devcontainer. Record both exit statuses.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set, through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 7.4 Run `bun run test:tz` in the devcontainer. Record its summary.
- [ ] 7.5 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Run the same with `whitespace.sh`, then run `sh scripts/gates/machine-paths.sh`. Record what each printed.
- [ ] 7.6 Push the branch and let CI run. Record the `check` and `e2e` job results. A red e2e install step takes design's fallback (`sudo podman`), recorded in design.md.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding before apply.
- After apply: verify, sync the delta specs, archive, then merge.
- After merge, on this machine: remove the Docker Compose stop-gap
  (`~/.local/bin/docker-compose`, `~/.docker/cli-plugins/docker-compose`,
  `~/.config/containers/containers.conf`).
