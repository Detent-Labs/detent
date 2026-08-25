## Why

Five git worktrees share one Docker Compose project, because
`.devcontainer/docker-compose.yml` names it with the literal
`name: workflow-engine` and every worktree checks out that same file. One
container therefore serves all of them, and it bind-mounts whichever tree
started it. The push gate consequently typechecks and tests that tree rather
than the branch being pushed, `bun test` runs from two worktrees truncate the
same tables, and the second worktree to publish its dev ports loses the bind.

## What Changes

- Add `scripts/worktree-env.sh`, sourced by every caller that drives Docker. It
  exports `COMPOSE_PROJECT_NAME`, `PORT_APP`, `PORT_VITE` and `PORT_MAILPIT`,
  derived from the checkout it is sourced in.
- Remove the `name:` literal from `.devcontainer/docker-compose.yml`, so the
  exported project name decides which stack a command reaches. Pin the `app`
  service's image name so the projects share one built image.
- Derive `CORS_ALLOWED_ORIGINS` from the exported Vite port.
- Teach `scripts/dev-up.sh`, `scripts/preflight.sh`, `.githooks/pre-push` and
  `scripts/gates/lockfile.sh` to source the helper instead of hardcoding the
  compose invocation or the port numbers.
- Feed Vite's `server.hmr.clientPort` from the environment, so the HMR socket
  reaches the published host port rather than the container-internal one.
- Keep the main checkout on the project name `workflow-engine` and the ports
  3000 / 5173 / 8025. The running stack and the CI workflow see no change.

## Capabilities

### New Capabilities
- `worktree-isolation`: how a linked worktree derives its own Compose project
  name and host ports, what stays shared, and what the main checkout keeps.

### Modified Capabilities
- `development-toolchain`: the test database is isolated by the container
  boundary rather than by the `_test` suffix alone; the dev port assignment
  becomes one base port per package plus a per-worktree offset; the CORS
  allowlist follows the derived port; the push gate runs inside the
  devcontainer that mounts the pushing worktree.
- `devcontainer-preflight`: check 4 probes the derived ports rather than the
  literals 3000 and 8025, and a failing check prints the command for the
  worktree it ran in.

## Impact

- `.devcontainer/docker-compose.yml`, `scripts/worktree-env.sh` (new),
  `scripts/dev-up.sh`, `scripts/preflight.sh`, `scripts/gates/lockfile.sh`,
  `.githooks/pre-push`, `packages/web/vite.config.ts`.
- `test/worktree-env.test.ts` (new).
- `CLAUDE.md`, `docs/current-state.md`, `docs/browser-checks.md`,
  `.claude/skills/devcontainer-exec/SKILL.md`.
- No engine, schema, runtime or HTTP code is touched. The definition contract
  is untouched.
- Each active worktree gains three containers and a `pgdata` volume, and
  installs its own `node_modules`.
