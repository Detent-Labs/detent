## Why

Five git worktrees share one Docker Compose project. The tracked file
`.devcontainer/docker-compose.yml` names that project with the literal
`name: workflow-engine`. Every worktree checks out that same file, so every
worktree resolves the same project. One container serves all five, and it
bind-mounts whichever tree started it.

Three collisions follow. The push gate typechecks and tests that one tree,
never the branch a developer pushes. Two worktrees running `bun test` truncate
the same tables. The second worktree to publish its dev ports loses the bind.

## What Changes

- Add `scripts/worktree-env.sh`. Every caller that drives Docker sources it.
  It exports `COMPOSE_PROJECT_NAME`, `PORT_APP`, `PORT_VITE` and
  `PORT_MAILPIT`, derived from the checkout it runs in.
- Remove the `name:` literal from `.devcontainer/docker-compose.yml`. The
  exported project name then decides which stack a command reaches.
- Pin the `app` service's image name, so the projects share one built image.
- Derive `CORS_ALLOWED_ORIGINS` from the exported Vite port.
- Teach `scripts/dev-up.sh`, `scripts/preflight.sh`, `.githooks/pre-push` and
  `scripts/gates/lockfile.sh` to source the helper. None of them then hardcodes
  a compose invocation or a port number.
- Feed Vite's `server.hmr.clientPort` from the environment. The hot-reload
  socket then reaches the published host port.
- Keep the main checkout on the project name `workflow-engine` and the ports
  3000, 5173 and 8025. The running stack and the CI workflow see no change.

## Capabilities

### New Capabilities
- `worktree-isolation`: how a checkout derives its own Compose project name and
  host ports, what stays shared, and what the main checkout keeps.

### Modified Capabilities
- `development-toolchain`: the dev port assignment gains a per-checkout offset,
  and the package reads its hot-reload port from the environment. The push gate
  runs inside the devcontainer that mounts the checkout it pushes.
- `devcontainer-preflight`: a failing check prints the command for the checkout
  it ran in, and check 4 names that checkout's ports.

## Impact

- `.devcontainer/docker-compose.yml`, `scripts/worktree-env.sh` (new),
  `scripts/dev-up.sh`, `scripts/preflight.sh`, `scripts/gates/lockfile.sh`,
  `.githooks/pre-push`, `packages/web/vite.config.ts`.
- `test/worktree-env.test.ts` (new).
- `CLAUDE.md`, `docs/current-state.md`, `docs/browser-checks.md`,
  `.claude/skills/devcontainer-exec/SKILL.md`.
- No engine, schema, runtime or HTTP code changes. The definition contract
  stays as it stands.
- Each active worktree gains three containers and one database volume, and
  installs its own `node_modules`.
