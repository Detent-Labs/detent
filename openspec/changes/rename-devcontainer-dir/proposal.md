# Proposal

## Why

VS Code's Dev Containers support reads the `.devcontainer/` name.
`devcontainer-on-podman` removed the two files that tool needed,
`devcontainer.json` and the Compose file. What remains is the image recipe
for the `app` container and the pod's local state. The hidden directory now
names a tool this repository no longer serves. A reader looking for the
container setup does not find it in the root listing.

## What Changes

- **BREAKING** `.devcontainer/` becomes `container/`. It holds the tracked
  `Dockerfile` and three gitignored files: the generated `pod.yaml`, the login
  signing secret `.auth-secret` and the server log `server.log`.
- `scripts/dev-pod.sh` builds the image from `container/` and writes the Pod
  spec there. `scripts/dev-up.sh` reads and writes the secret and the server
  log there.
- `.gitignore` and `.dockerignore` name `container/`. The production images
  still exclude it from their build context.
- Every document and comment that names the path follows: `CLAUDE.md`,
  `README.md`, `docs/browser-checks.md`, `docs/current-state.md`,
  `.claude/skills/devcontainer-exec/SKILL.md`, `docker/engine.Dockerfile`.
- The word "devcontainer" stays where it names the concept, the dev container
  itself. That covers the capabilities `devcontainer-preflight`, the skill
  `devcontainer-exec` and prose such as "inside the devcontainer". Only the
  directory changes.
- Out of scope: the archived changes under `openspec/changes/archive/`, which
  record the path as it was.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `devcontainer-preflight`: the signing-secret repair scenario names
  `container/.auth-secret`.
- `development-toolchain`: the real-database push requirement names
  `container/Dockerfile` as the file that pins `BUN_VERSION`.
- `production-docker-images`: the build-context requirement excludes
  `container` instead of `.devcontainer`.

## Impact

- Moved: `.devcontainer/Dockerfile` to `container/Dockerfile`.
- Scripts: `scripts/dev-pod.sh`, `scripts/dev-up.sh`.
- Config: `.gitignore`, `.dockerignore`.
- Tests: `test/gates.test.ts` (the container-path fixture label) and
  `test/dockerignore.test.ts` (the required entries).
- Docs and comments: `CLAUDE.md`, `README.md`, `docs/browser-checks.md`,
  `docs/current-state.md`, `.claude/skills/devcontainer-exec/SKILL.md`,
  `docker/engine.Dockerfile`, and the Purpose paragraph of
  `openspec/specs/production-docker-images/spec.md`.
- Ordering: this change stacks on `devcontainer-on-podman`. Its deltas
  assume that change's deltas are already synced, so it archives after it.
- This machine: the gitignored files move once, so the login secret stays
  valid. The running pod replays on the next bring-up, because its spec now
  lives at a new path.
