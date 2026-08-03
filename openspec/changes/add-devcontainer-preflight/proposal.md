## Why

The devcontainer has six preconditions that fail one at a time, each with its
own confusing symptom. Each of these has cost a session:

- a stopped Docker daemon
- a down container
- a server started without `AUTH_JWT_SECRET`
- an unpublished port
- an unseeded database
- a locked codebase-memory WAL file

The developer meets a connection reset, a login 404 or an empty screen. They
then work backwards to the cause.

`scripts/dev-up.sh` and `scripts/dev-up.ps1` already bring the stack up. They
do not state which precondition failed, so a partial bring-up looks like a
working one.

## What Changes

- Both dev-up scripts gain an ordered preflight that checks the six
  preconditions and names the failing one.
- Every failed check prints the exact command that repairs it.
- The preflight splits into two profiles. The `core` profile checks the Docker
  daemon, the containers, database reachability and the WAL lock. The `serve`
  profile adds the signing secret, the published ports and the seed, and it is
  the one `dev-up` runs.
- `.githooks/pre-push` runs the `core` profile before `bun run check`, and
  replaces its own inline container check with it.
- **The push gate SHALL NOT run the `serve` profile.** That profile restarts
  `bun run serve`, whose outbox poller corrupts the test run. The
  `development-toolchain` spec already records the measurement: 3 red runs of
  20 with a dev server up, 0 of 20 with none.
- `.devcontainer/docker-compose.yml` gains a healthcheck per service, so
  "container healthy" becomes a state the preflight can read.

## Capabilities

### New Capabilities

- `devcontainer-preflight`: the ordered precondition checks, the two profiles,
  the fix-command rule, and which failures block and which only warn.

### Modified Capabilities

- `development-toolchain`: the requirement "Every push runs the toolchain's
  checks against a real database" gains the preflight as its precondition. Its
  "A stopped devcontainer blocks the push" scenario is today satisfied by an
  inline check inside the hook. That check moves into the preflight `core`
  profile, so the requirement now names the preflight instead.

## Impact

- `scripts/dev-up.sh`, `scripts/dev-up.ps1`: two parallel implementations of
  one flow. Both carry the preflight, or the design states why one of them
  stops being an equal.
- `.githooks/pre-push`: gains the preflight call, loses its inline container
  check.
- `.devcontainer/docker-compose.yml`: gains a healthcheck per service. This is
  the tracked compose file, so the change reaches every clone.
- `docs/current-state.md` and `README.md`: both describe the bring-up today.
- The codebase-memory WAL sits at `~/.cache/codebase-memory-mcp/<slug>.db-wal`,
  outside the repository. The slug carries the username, so no script can
  hardcode the path. `CLAUDE.md` already records this index as per-machine
  local state.
- `.githooks/pre-push` currently holds an uncommitted ponytail-ledger staleness
  check in the working tree. The preflight call has to sit beside it, not
  replace it.
