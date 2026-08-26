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
- Keep the `name: workflow-engine` literal in
  `.devcontainer/docker-compose.yml`. Compose puts an exported
  `COMPOSE_PROJECT_NAME` above that attribute. A sourced caller therefore
  reaches its own stack, and the literal needs no change.
- The literal is also the fallback. A caller that forgot to source the helper
  reaches the established project. Compose otherwise derives one from the
  directory basename.
- Derive `CORS_ALLOWED_ORIGINS` from the exported Vite port.
- Teach `scripts/dev-up.sh`, `scripts/preflight.sh`, `.githooks/pre-push` and
  `scripts/gates/lockfile.sh` to source the helper. None of them then hardcodes
  a compose invocation or a port number.
- Source the helper in each Docker step of `.github/workflows/check.yml`. CI
  derives the established name either way. Sourcing keeps one rule for every
  Docker caller, instead of a documented exception.
- Feed Vite's `server.hmr.clientPort` from the environment. The hot-reload
  socket then reaches the published host port.
- Keep the main checkout on the project name `workflow-engine` and the ports
  3000, 5173 and 8025. The running stack keeps serving. A CI runner clones, so
  it derives that same name once its steps source the helper.

## Capabilities

### New Capabilities
- `worktree-isolation`: what a checkout derives for itself, and what the main
  checkout keeps unchanged.

### Modified Capabilities
- `development-toolchain`: the dev port assignment gains a per-checkout offset,
  and the package reads its hot-reload port from the environment. The push gate
  runs inside the devcontainer that mounts the checkout it pushes. The manual
  checklist names the bring-up as what publishes its ports.
- `devcontainer-preflight`: a failing check prints the command for the checkout
  it ran in, and check 4 names that checkout's ports.
- `push-gate-checks`: a gate that runs inside the container takes the project
  name from the derivation instead of naming one.

## Impact

- `.devcontainer/docker-compose.yml`, `.gitignore`,
  `scripts/worktree-env.sh` (new), `scripts/dev-up.sh`, `scripts/preflight.sh`,
  `scripts/preflight.ps1`, `scripts/gates/lockfile.sh`, `.githooks/pre-push`,
  `packages/web/vite.config.ts`, `.github/workflows/check.yml`.
- `.devcontainer/docker-compose.ports.yml`, written by the bring-up and ignored
  by git. The override file beside it stays the contributor's.
- `test/worktree-env.test.ts` (new), `packages/web/test/boundaries.test.ts`.
- `CLAUDE.md`, `ROADMAP.md`, `docs/current-state.md`, `docs/browser-checks.md`,
  `.claude/skills/devcontainer-exec/SKILL.md`.
- No engine, schema, runtime or HTTP code changes. The definition contract
  stays as it stands.
- Each active worktree gains three containers and one database volume, and
  installs its own `node_modules`. It also builds its own image, sharing layers
  with the others.
- This change supersedes a local planning doc under `docs/superpowers/specs/`.
  Git ignores that directory, so no commit carries it.
- Two contradictions predate this change and stay out of scope. A live
  `development-toolchain` requirement still forbids a hosted-CI workflow for
  this purpose, and `.github/workflows/check.yml` exists. Tasks 3.8 and 5.5
  touch both sides of it. A follow-up change carries that delta, which runs to
  about 120 lines. The second sits in the manual checklist, whose no-overlap
  rationale the `_test` database preload refuted. The delta carries that
  wording forward unchanged.
