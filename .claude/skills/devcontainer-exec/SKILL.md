---
name: devcontainer-exec
description: Run commands (bun, tsc, tests) inside this project's devcontainer via docker compose when the devcontainer CLI isn't available, including the Windows Git Bash path-rewriting fix and how to expose a dev server port to the host browser.
---

Without the `devcontainer` CLI, drive it via `docker compose`: `docker compose
-f .devcontainer/docker-compose.yml up -d` (starts `app` + `db`; `app`'s
default command is `sleep infinity`), then run every command through
`docker compose -f .devcontainer/docker-compose.yml exec -w /workspace app
<cmd>` — the `app` service's default container workdir is `/`, not
`/workspace`, so `-w /workspace` is required every time.

On Windows Git Bash, prefix such commands with `MSYS_NO_PATHCONV=1` — Git
Bash otherwise rewrites the Unix-style `/workspace` path into a Windows path
before Docker sees it, producing `Cwd must be an absolute path` errors.

`DATABASE_URL` is already wired into the `app` service's environment
(pointing at the `db` service by container name), so DB-backed tests need no
extra setup once running through `exec`.

The compose file publishes no ports by default. To view a dev server from
the host browser, add a local-only, gitignored
`.devcontainer/docker-compose.override.yml` publishing the port (e.g.
`5173:5173` under `services.app.ports`), bring services up with both `-f`
flags, and bind the dev server to all interfaces (`bun run dev -- --host
0.0.0.0`). Never add port publishing to the shared `docker-compose.yml` —
that's a personal convenience, not a team-wide default.
