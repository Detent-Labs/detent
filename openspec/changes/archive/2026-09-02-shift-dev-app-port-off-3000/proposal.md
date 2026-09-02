## Why

`scripts/worktree-env.sh` derives the app port for the devcontainer stack
from `_WTENV_BASE_APP=3000`. On this machine a host-side process,
`mcp-excalidraw-server/dist/server.js`, listens on `127.0.0.1:3000`. Docker
cannot bind the port the MCP server already holds. Every
`bash scripts/dev-up.sh` in the main checkout fails with `ports are not
available: exposing port TCP 127.0.0.1:3000`. Killing that server is not an
option: it serves another tool outside this repository's control.

## What Changes

- `_WTENV_BASE_APP` in `scripts/worktree-env.sh` moves from `3000` to `3100`.
  `PORT_VITE` (base `5173`) and `PORT_MAILPIT` (base `8025`) keep their
  values.
- `3100` keeps the derived app-port range, `3100` through `3100 + 2000 =
  5100` across the worktree offset (`10 * (1 + sum % 200)`, i.e. `+10`
  through `+2000`), below the Vite base port `5173`. A base of `3200` or
  higher would let a busy worktree's app port land on another worktree's
  Vite port; `3100` cannot.
- The four literal `"3000"` expectations in `test/worktree-env.test.ts` for
  a main checkout's `PORT_APP` become `"3100"`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `openspec/specs/worktree-isolation/spec.md` requires the script
return, in a main checkout, "the ports this repository used before the
change." It describes the port set only as "the base ports plus one
offset" and names no specific number. The base value is an implementation
detail the spec leaves open. This change sets `skip_specs: true`.

## Impact

- `scripts/worktree-env.sh`: one constant.
- `test/worktree-env.test.ts`: four literals, lines ~89, 100, 108, 124.
  Three are main-checkout assertions, and one is a linked-worktree
  contrast.
- `scripts/dev-up.sh` keeps its `127.0.0.1:3000:3000` line as it is. That
  line, in its `OLD_OVERRIDE` heredoc, is a fingerprint it matches against an
  existing `.devcontainer/docker-compose.override.yml`. The match finds and
  removes a stale pre-worktree-isolation file; it names no active port
  binding. It stays literal `3000` regardless of `_WTENV_BASE_APP`. The file
  it matches against predates this change.
- No change to the container-internal port (`src/http/server.ts`'s default,
  the Dockerfile's `EXPOSE`), which stays `3000` inside every container
  regardless of the host-side mapping.
- No change to `docs/`, `README.md`, or any spec: none names `3000` as the
  derived base value.
- A contributor with an already-running stack on `127.0.0.1:3000`, or a
  hand-written `.devcontainer/docker-compose.override.yml` pinned to 3000,
  sees their next `dev-up.sh` publish `3100` instead. Nothing in this repo
  hardcodes the old value for a contributor to change by hand.
