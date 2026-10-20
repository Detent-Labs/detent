# Proposal

## Why

The development machine now runs Arch Linux with rootless Podman and no Docker
daemon. The devcontainer stack targets Docker Compose. Podman's own
Compose provider, `podman-compose`, drops the `-d` from `exec -d`, so
`scripts/dev-up.sh` hangs at the server start. Keeping Compose would mean a
second tool on every machine, installed only to translate one YAML file for
Podman. Podman already describes a multi-container stack natively, as a
Kubernetes Pod that `podman kube play` runs.

The bring-up also has a race. On a fresh database volume, the seed runs
while Postgres still runs its init server. The seed then fails with
`Connection closed`. A second run passes. Two runs on 2026-10-20 showed the
race, once under `podman-compose` and once under Docker Compose. It is not
Podman's, and this change fixes it too.

## What Changes

- **BREAKING** Podman replaces Docker Compose as the only container path.
  This covers the devcontainer stack locally, in the pre-push hook, and in
  CI. `.devcontainer/docker-compose.yml` goes away.
- A tracked generator prints this checkout's Pod spec. It holds `app`, `db`
  and `mailpit` in one pod, with this checkout's path, ports and pod name
  filled in. The bring-up writes the spec to a gitignored file and runs it with
  `podman kube play`.
- The containers of one pod share `localhost`. `DATABASE_URL` and `SMTP_HOST`
  name `localhost` instead of the Compose service names `db` and `mailpit`.
- One exec helper runs a command in this checkout's `app` container. The
  pre-push hook, the container gates, the preflight's repair commands, CI,
  the `devcontainer-exec` skill and `CLAUDE.md` all call it. None spells out
  a `docker compose exec` line.
- `scripts/worktree-env.sh` exports a pod name in place of
  `COMPOSE_PROJECT_NAME`. The main checkout keeps `workflow-engine`. A linked
  worktree keeps its derived name and port offset.
- The bring-up waits until Postgres accepts a TCP connection before it
  installs or seeds. Each container declares a liveness probe, and the
  database probe connects over TCP. The init server listens on the Unix
  socket only, so the probe ignores it.
- **BREAKING** The personal `docker-compose.override.yml` and the generated
  `docker-compose.ports.yml` go away. The generated Pod spec carries the
  ports.
- **BREAKING** `.devcontainer/devcontainer.json` goes away. It names a
  Compose file, and VS Code's Dev Containers support has no form for a Pod
  spec. The supported entry point was already `scripts/dev-up.sh`.
- Out of scope: the production images under `docker/` and their spec, which
  build single images and name no Compose file. Also out of scope: the
  Windows-host scripts (`scripts/*.ps1`), which delegate to the shell scripts
  unchanged. Retiring them is a separate change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worktree-isolation`: the derived identity names a Podman pod instead of a
  Compose project. The change drops the `devcontainer.json` exemption and the compose-file
  `name:` fallback. The bring-up no longer reads a contributor's
  override file.
- `devcontainer-preflight`: check 1 asks Podman instead of the Docker daemon.
  Check 2 reads each pod container's health. Repair commands reach the pod.
  The healthcheck requirement moves from Compose services to the Pod spec's
  liveness probes. A new requirement makes the bring-up wait for the database
  before it seeds.
- `development-toolchain`: the push-gate and manual-checklist requirements
  name the pod and the generated Pod spec. They no longer name the Compose
  project or the ports and override files. The change removes the
  SMTP-catcher and webhook-sink requirements.

  Three pod-based requirements replace them:

  - "The devcontainer pod provides an SMTP catcher"
  - "The mail test round-trips through the catcher"
  - "The devcontainer pod runs a webhook sink"

  The HTTP-target requirement now names the sink requirement it points to.
  It no longer says "the previous requirement".
- `push-gate-checks`: the container gates exec through the pod. The
  machine-path exclusion stops citing `devcontainer.json`.

## Impact

- Scripts: `scripts/dev-up.sh`, `scripts/preflight.sh`,
  `scripts/worktree-env.sh`, `scripts/gates/lockfile.sh`,
  `.githooks/pre-push`, plus the new generator and exec helper.
- Files removed: `.devcontainer/docker-compose.yml`,
  `.devcontainer/devcontainer.json`.
- CI: `.github/workflows/check.yml` brings the pod up on `ubuntu-latest`,
  which ships Podman, and execs through the helper.
- Tests: `test/worktree-env.test.ts` reads the generated spec instead of the
  compose file. `test/gates.test.ts` updates its install fixture and its
  container-path fixture.
- Docs and comments: `README.md`, `CLAUDE.md`, `docs/browser-checks.md`,
  `THIRDPARTY.md`, `docs/decisions.md`, `docs/current-state.md`,
  `ROADMAP.md`, `.env.example`, `openspec/config.yaml`,
  `scripts/dev-webhook-sink.ts`, `.claude/skills/devcontainer-exec/SKILL.md`,
  `.gitignore`.
- Contributor machines: contributors need Podman and stop using Docker
  Compose. Old Compose containers and the `workflow-engine_pgdata` volume
  stay behind as orphans. Development data is reseedable, so the README
  names the cleanup command.
