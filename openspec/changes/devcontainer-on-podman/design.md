# Design

## Context

See proposal.md for the motivation. The facts below were measured on
2026-10-20 on the development host: Arch Linux, rootless Podman 6.1.4, crun,
netavark, and the overlay storage driver.

Today `.devcontainer/docker-compose.yml` defines three services, `app`, `db`
and `mailpit`. `scripts/dev-up.sh` adds a generated
`docker-compose.ports.yml`, plus an optional hand-written
`docker-compose.override.yml`. About twenty tracked files spell a
`docker compose ... exec -T -w /workspace app` line: the hook, two gates,
the preflight, CI, a skill, README and CLAUDE.md.

A prototype pod built with `podman kube play` showed the following:

- The containers of one pod share one network namespace. `/etc/hosts` maps
  `<pod>-<container>` to `127.0.0.1`, and maps no bare service name such as
  `db`. Every inter-container address becomes `localhost`.
- `hostPort` with `hostIP: 127.0.0.1` publishes on the loopback address only.
- A `hostPath` volume bind-mounts the checkout. In rootless mode, container
  root maps to the host user, so files the container writes belong to the
  host user. No `userns` setting is needed.
- A `persistentVolumeClaim` creates a named Podman volume of the claim's name.
- `podman exec -d` detaches, which `podman-compose` failed to do.
- A `startupProbe` turns into a placeholder healthcheck, `exit 0`. A
  `livenessProbe` becomes the real healthcheck.
- A failing `livenessProbe` restarts the container. The on-failure action is
  `restart`, and kube play sets `restartPolicy: always`.
- With `pg_isready -h 127.0.0.1` as the probe, `podman wait
  --condition=healthy` returned after the final server came up. The earlier
  init server listens on its Unix socket alone, so the probe ignored it.

## Goals / Non-Goals

**Goals:**

- One container tool: Podman, with no Compose provider of any kind.
- No tracked file names a pod, a container or a host port. Callers source the
  derivation, as they do today.
- A bring-up on a fresh volume passes on its first run.
- A second bring-up against a running pod leaves the pod in place.

**Non-Goals:**

- Running under Docker. A contributor needs Podman.
- An extra port binding of a contributor's own. Nobody uses the override file
  today, and a generated spec has no merge point for one.
- The production images under `docker/`, and the Windows `.ps1` delegators.

## Decisions

### D1. `podman kube play` over the alternatives

The user chose `podman kube play` on 2026-10-20. Three alternatives were
considered:

- **Quadlets.** systemd units manage long-lived services well. They fit
  short-lived per-worktree stacks and a CI runner poorly, and they need
  systemd on the host.
- **Docker Compose v2 over the Podman socket.** This works, and it was the
  stop-gap on 2026-10-20. It keeps a second tool and the Compose file.
- **`podman-compose`.** Its `exec -d` hangs the bring-up, and its semantics
  drift from Compose's in ways nobody tracks.

### D2. A generator prints the Pod spec; the bring-up writes it to a gitignored file

`scripts/dev-pod.sh spec` prints the Pod YAML to stdout. It is POSIX sh, it
sources `scripts/worktree-env.sh`, and it reads `git rev-parse --show-toplevel`
for the `hostPath`. `scripts/dev-pod.sh up` writes that output to
`.devcontainer/pod.yaml` (gitignored) and plays it. `down` tears it down.

A static tracked YAML cannot work here. The `hostPath` must be absolute, and
the `no-machine-paths` gate rejects a home path in a tracked file. The
`PORT_VITE` and `CORS_ALLOWED_ORIGINS` env values differ per worktree too.
`kube play --publish` overrides ports but not env or volumes.

`spec` calls no `podman`. The tests run inside the container, where no Podman
exists, and they read `spec`'s output in place of the Compose file.

Every image name carries its registry host: `docker.io/library/postgres:latest`,
`docker.io/axllent/mailpit:v1.27`, `localhost/$DEV_POD-app:latest`. Podman
resolves a short name only through `unqualified-search-registries`. This host
has no `/etc/containers/registries.conf` at all. Compose's short names worked
here only through a per-user drop-in added on 2026-10-20, which a fresh
machine or a CI runner need not carry.

Every string scalar in the spec is double-quoted, with `"` and `\` escaped. A
checkout path may hold a space, a `:` or a `#`, and each of those breaks a
plain YAML scalar.

### D3. Names

`worktree-env.sh` exports `DEV_POD` in place of `COMPOSE_PROJECT_NAME`. The
derivation is unchanged: `workflow-engine` in a main checkout, and
`detent-<base>-<cksum>` in a linked worktree. kube play names a container
`<pod>-<container>`, so the containers are `$DEV_POD-app`, `$DEV_POD-db` and
`$DEV_POD-mailpit`. The claim is `$DEV_POD-pgdata`, which gives the volume
that name. The established volume becomes `workflow-engine-pgdata`, with a
hyphen. It cannot collide with Compose's old `workflow-engine_pgdata`.

Each pod builds its own image tag, `localhost/$DEV_POD-app:latest`, from its
own checkout's `.devcontainer/Dockerfile`. Compose built `<project>-app` per
project the same way. A shared tag would let a worktree that edits the
Dockerfile retag the image the main checkout's next `up` replays. The layer
cache stays shared, so an unchanged Dockerfile builds in seconds in every
worktree.

### D4. One exec helper

`scripts/dev-exec.sh` runs `podman exec -w /workspace "$DEV_POD-app" "$@"`
after it sources the derivation. A caller that needs an env variable uses
`env NAME=value cmd`. The helper takes no flags of its own, so its argv is the
command and nothing else. `podman exec` allocates no TTY by default, which
suits the hook and CI. It is the one place that knows the container name and
the workdir. The CLAUDE.md host test call becomes:

`rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`

The call still ends in the literal words `bun test`, which `rtk` reads.

### D5. Idempotent `up`

`up` builds the image, generates the spec, and compares the result with what
runs now. It replays with `kube play --replace` in three cases:

- the pod does not exist,
- the new spec differs from `.devcontainer/pod.yaml`,
- the `app` container's image id differs from the freshly built image's.

Otherwise it starts a stopped pod with `podman pod start`, or leaves a running
one alone. That keeps a running dev server and an open exec session alive
across a re-run. `podman build` is cached, so the build costs seconds when
nothing changed.

### D6. Readiness

Each container declares a `livenessProbe`:

- `db`: `pg_isready -h 127.0.0.1 -U postgres`
- `mailpit`: `/mailpit readyz`
- `app`: `bun --version`

All three use `periodSeconds: 5` and `failureThreshold: 24`. A failing probe
restarts the container (Context), so the threshold must exceed any first-boot
init by a wide margin. Two minutes does, since the init measured about two
seconds.

`up` then polls `podman healthcheck run` on each container, once a second,
for up to 120 seconds. Polling `podman healthcheck run` needs neither a
systemd healthcheck timer nor `wait --condition` support, so it behaves alike
on every Podman version and host. The poll runs the probe immediately rather
than waiting for its period. CI calls `up` too, so the wait replaces
`compose up --wait`.

### D7. Preflight mapping

- Check 1: `podman info` answers. On failure it prints `podman info` as the
  command that shows the cause, the way the old check named Docker Desktop.
- Check 2: `podman healthcheck run` exits 0 for each container. It does not
  read `.State.Health.Status`. That field advances only through Podman's
  periodic probes, which run on systemd timers. On a host with no systemd
  user session it stays `starting`, and the check would fail a healthy pod.
- Check 3: `podman exec` on `$DEV_POD-app`.
- Check 5: `podman exec` on `$DEV_POD-db`. The repair command becomes
  `sh scripts/dev-exec.sh env SEED_ALLOW=1 bun run seed`.

### D8. CI

`ubuntu-latest` ships Podman and runs it rootless as the `runner` user. Both
jobs replace `docker compose up -d --wait` with `sh scripts/dev-pod.sh up`.
Every exec step runs `sh scripts/dev-exec.sh ...`. The e2e job's `playwright
install --with-deps` runs apt as container root, which needs no `sudo`, as
before.

### D9. Removed files

`.devcontainer/docker-compose.yml` goes. So does
`.devcontainer/devcontainer.json`: its Compose reference has no Pod
equivalent in the Dev Containers format. The `.gitignore` entries for the
override and ports files are replaced by one for `.devcontainer/pod.yaml`.

## Risks / Trade-offs

- [The Podman on `ubuntu-latest` (4.9 on 24.04) differs from 6.1 on the host]
  → The design uses only long-standing features: `kube play` with
  `hostIP`/PVC/`livenessProbe`/`--replace`, `podman healthcheck run`, and
  `podman build`. A CI run on the change's branch verifies it before archive.
- [apt inside a rootless container on the runner fails for the Playwright
  deps] → Verified by the same CI run. Fallback: run the install step with
  `sudo podman`.
- [The probe restart kills a slow first init] → The threshold is two minutes
  against a measured two-second init.
- [A contributor still on Docker loses the stack] → Proposal marks it
  **BREAKING**. README names Podman as the requirement and the old Compose
  cleanup.
- [`--replace` on a changed spec kills a running dev server] → `up` replays
  only when the spec or the image changed. `dev-up.sh` restarts the server
  anyway.

## Migration Plan

1. Land the change on a branch. Run the bring-up from scratch, run the full
   suite, and let CI run both jobs on the branch.
2. On each contributor machine, remove the old stack once: the Compose-named
   containers (`podman rm -f` or `docker rm -f` on
   `workflow-engine-{app,db,mailpit}-1`), their network, and the
   `workflow-engine_pgdata` volume. README states the commands. Development
   data reseeds.
3. Rollback: revert the merge. The Compose file returns, and the Podman pod
   can be removed with `sh scripts/dev-pod.sh down` before reverting.

## Open Questions

None. The CI Podman behavior is a verification step in tasks, not an open
design choice.
