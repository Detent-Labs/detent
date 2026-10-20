# Design

## Context

See proposal.md for the motivation. On 2026-10-20 a `git grep` for the path
outside the archive found it in:

- 12 lines of `production-docker-images`, in four requirements and its
  Purpose;
- 1 line of `deployment-runbook`;
- `docker/frontend.Dockerfile` itself, which copies `docker/nginx.conf`;
- three docs (`README.md`, `docs/runbooks/deployment.md`,
  `docs/current-state.md`), `docs/decisions.md` and `THIRDPARTY.md`;
- four comments (`scripts/enable-hooks.sh`, `packages/web/csp.ts`,
  `packages/web/test/vite-config.test.ts`, `test/enable-hooks.test.ts`);
- one test that reads the file, `test/http-error-path.test.ts`.

CI builds neither production image, and no script runs `docker build`.
`.dockerignore` does not name the directory, and no other directory in the
tree is named `deploy`.

## Goals / Non-Goals

**Goals:**

- One path, `deploy/`, in every tracked file outside the archive and the
  in-flight change artifacts.

**Non-Goals:**

- Renaming the capability `production-docker-images`.
- Changing any Dockerfile instruction other than the `COPY` source of
  `nginx.conf` and the registry host of the `FROM` images.
- Rewording `docker build` in the runbook or the specs.

## Decisions

### D1. `git mv`, so history follows

`git mv docker deploy` keeps `git log --follow` working for each Dockerfile.

### D2. Two kinds of Dockerfile edit, no behavior change

`deploy/frontend.Dockerfile`'s `COPY` line names the new path of
`nginx.conf`. Without it the frontend image does not build.

The three `FROM` lines gain the registry host `docker.io/`. This host has no
system `registries.conf`, and short names resolve here only through a
per-user drop-in added on 2026-10-20 that leaves after the merge. A fresh
Podman host would refuse `oven/bun:1.3.11-slim`. Docker resolves the full
name to the same image, so both images are unchanged.

The edits under `packages/web` change comments only and no UI, so they need
no design-skill pass.

`test/http-error-path.test.ts` reads `../docker/engine.Dockerfile`. It reads
the new path, and the suite proves the read.

### D3. A build check stands in for the missing CI build

No automated check builds either image. A task builds both with
`podman build` on this host and records the result, the way the
`production-docker-images` requirement "Both images build on a working tree
with dependencies installed" describes.

## Risks / Trade-offs

- [An external script or a server's deploy stack names `docker/`] → The old
  machine's untracked `deploy.sh` and `reset.sh` may. The proposal marks the
  change **BREAKING**, and the user is told in the hand-off.
- [Rebase conflict in the production-docker-images Purpose with
  `rename-devcontainer-dir`'s edit of the same paragraph] → Resolve by hand
  during the local rebase. The two edits touch different sentences.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Archive after the four changes below it, rebasing locally in order.
3. Update any deploy script that names `docker/` when the deploy stack
   returns to this machine.
4. Rollback: revert the commits.

## Open Questions

None.
