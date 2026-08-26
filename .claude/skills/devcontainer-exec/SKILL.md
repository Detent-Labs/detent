---
name: devcontainer-exec
description: Run commands (bun, tsc, tests) inside this project's devcontainer via docker compose when the devcontainer CLI isn't available, including the Windows Git Bash path-rewriting fix and how to expose a dev server port to the host browser.
---

Source `scripts/worktree-env.sh` first, in the same shell as the compose
call: `. scripts/worktree-env.sh`. It derives this checkout's own
`COMPOSE_PROJECT_NAME`, `PORT_APP`, `PORT_VITE` and `PORT_MAILPIT` from the
worktree's path (worktree-isolation). A linked worktree then never reaches
the main checkout's containers or database.

Without the `devcontainer` CLI, drive it via `docker compose`. `bash
scripts/dev-up.sh` starts the stack (`app` + `db` + `mailpit`; `app`'s
default command is `sleep infinity`). It also generates
`.devcontainer/docker-compose.ports.yml`, the last `-f` in every command
below. Add `-f .devcontainer/docker-compose.override.yml` before it only
where this checkout keeps one.

Run every command through:
```
docker compose -f .devcontainer/docker-compose.yml \
  [-f .devcontainer/docker-compose.override.yml] \
  -f .devcontainer/docker-compose.ports.yml exec -w /workspace app <cmd>
```
The `app` service's default container workdir is `/`, not `/workspace`, so
every command needs `-w /workspace`. An `exec`/`ps`/`logs` call needs no
`-f` at all past the base file. The sourced `COMPOSE_PROJECT_NAME` alone
resolves this checkout's own container.

On Windows Git Bash, prefix such commands with `MSYS_NO_PATHCONV=1`. Git
Bash otherwise rewrites the Unix-style `/workspace` path into a Windows path
before Docker sees it, producing `Cwd must be an absolute path` errors.

`DATABASE_URL` is already wired into the `app` service's environment
(pointing at the `db` service by container name). DB-backed tests need no
extra setup once running through `exec`.

`bash scripts/dev-up.sh` publishes this checkout's derived ports
(`PORT_APP`, `PORT_VITE`, `PORT_MAILPIT`) into
`.devcontainer/docker-compose.ports.yml` and prints them. To view a dev
server from the host browser, run it from inside the container:
```
cd packages/web && bun run dev -- --host 0.0.0.0
```
In a linked worktree, point it at that checkout's own engine:
`VITE_API_URL=http://127.0.0.1:$PORT_APP`.

A hand-written `.devcontainer/docker-compose.override.yml` is for an extra
binding of the contributor's own. A literal `5173:5173` there collides with
the main checkout's port. Never add port publishing to the shared
`docker-compose.yml`. That's a personal convenience, not a team-wide
default.
