# Proposal

## Why

`scripts/deploy-demo.sh` builds the engine image on the operator's machine. It
then ships the whole image to the server with `podman save | ssh podman load`.
Every deploy moves the full image, and that upload made the host's network
drop port 22 during the first deploy. The operator also needs Podman locally.

The earlier Docker stack built on the server. The owner prefers that again. The
repository is public, so the server can clone it over HTTPS with no key.

## What Changes

- The server keeps a checkout of the repository at `~/detent/repo`. The first
  deploy clones it.
- `scripts/deploy-demo.sh` deploys the commit the operator has checked out. It
  refuses a commit that no remote branch contains.
- Over SSH, the script moves the server's checkout to that commit and runs
  `podman build` there. No image crosses the network.
- The units, the `Caddyfile` and the two scripts come from the same checkout.
- `docs/runbooks/demo.md` describes the new flow and records the build time
  the test deploy measured.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `demo-deployment`: removes "The engine image builds off the server" and adds
  "The server builds the engine image from a pushed commit".

## Impact

- `scripts/deploy-demo.sh`, `test/demo-deployment.test.ts`,
  `docs/runbooks/demo.md`.
- The server needs outbound HTTPS to GitHub and to the npm registry during a
  deploy. `ufw` allows outbound traffic by default.
- No engine, image or unit change.
