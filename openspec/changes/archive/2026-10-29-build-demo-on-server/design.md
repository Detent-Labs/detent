# Design

## Context

See proposal.md. Today `scripts/deploy-demo.sh` builds the image locally with
`podman build --format docker`. It ships it with `podman save | ssh podman
load` and runs `podman image prune -f` on the server. It copies the units, the
`Caddyfile`, `engine.env.example`, `setup.sh` and `reset.sh` with `scp`. All `ssh` and `scp` calls share one
ControlMaster connection.

The server runs Debian 13 with Podman 5.4 and `git`, as the account `detent`.
It has 1 vCPU, 2 GB RAM, 2 GB swap and 20 GB disk. The repository
`Detent-Labs/detent` is public. `test/demo-deployment.test.ts` lints the deploy
script with `checkDeploy`, one rule per behavior, each with a breaking fixture.

## Goals / Non-Goals

**Goals:**

- A deploy moves no image over the network.
- The server builds exactly the commit the operator deploys.
- The units and scripts on the server match that commit.

**Non-Goals:**

- A CI build or a registry.
- Building any image other than the engine.
- Keeping the operator-side build as an option.

## Decisions

### D1. The deploy pins a pushed commit

The script reads `git rev-parse HEAD`. It runs `git fetch --quiet` and then
`git branch -r --contains <sha>`. An empty answer stops the script with a
message, before any `ssh` call. The dirty-tree guard stays.

### D2. The server keeps one checkout

On the server, `~/detent/repo` holds a clone of
`https://github.com/Detent-Labs/detent.git`. The script clones it when the
directory is missing. Each deploy then runs `git -C ~/detent/repo fetch
--quiet origin` and `git -C ~/detent/repo checkout --quiet --detach <sha>`.

### D3. The server builds and prunes

The script runs `podman build --format docker -t localhost/detent-engine:demo
-f ~/detent/repo/deploy/engine.Dockerfile ~/detent/repo` over SSH. The SSH
command runs in the home directory, so the file path is absolute. It prints the build's
duration from two `date +%s` readings, since `time` is no builtin in every
shell and `/usr/bin/time` is not installed. Then it runs `podman image prune
-f`. The prune also drops the cached build stage, so each
build installs dependencies again. That trades build time for disk on a 20 GB
server. The test deploy measures both a cold build and a warm one.

### D4. Files come from the checkout

The script copies the units, the `Caddyfile`, `engine.env.example`, `setup.sh`
and `reset.sh` from `~/detent/repo/deploy/demo/` with `cp` on the server. No
`scp` remains. The rest of the flow stays as it is. Setup runs on a missing
`engine.env`. The Quadlet dry-run, the image pulls and the restart follow. The
reset runs on a missing `seeded` marker.

### D5. The lint test follows

`checkDeploy` gains three rules, each with a breaking fixture:

- the script refuses a commit no remote branch contains
- it builds with `podman build` on the server, from `~/detent/repo`
- it contains no `podman save` and no `podman load`

The existing prune rule now reads "after the build".

## Risks / Trade-offs

- [The build slows the running demo] → The test deploy measures the build
  time and the memory peak. The runbook records both.
- [The npm registry or GitHub is down] → The deploy fails before the restart.
  The running demo stays as it was.
- [A force-push removes the deployed commit] → The next deploy names a commit
  the remote holds, so the checkout moves on.

## Migration Plan

1. Implement and verify on `build-demo-on-server`, sync, archive, push, open
   the PR.
2. Test deploy from the pushed branch: one cold build, one warm build. Record
   the numbers in the runbook and the PR.
3. Merge on the owner's go.
4. Rollback: revert the merge. The previous script builds locally again.

## Open Questions

None.
