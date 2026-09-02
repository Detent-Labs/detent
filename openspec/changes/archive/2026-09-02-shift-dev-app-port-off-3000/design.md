## Context

See `proposal.md` - Why. `scripts/worktree-env.sh:16` sets
`_WTENV_BASE_APP=3000`. `dev-up.sh`, `preflight.sh`, and the pre-push hook
all source this one file. Each reads the port and project-name identity a
checkout uses, per `worktree-isolation`. A linked worktree adds an offset
of `10 * (1 + sum % 200)`, i.e. `+10` through `+2000`. The offset applies
to every base port alike, so `PORT_APP` ranges over `_WTENV_BASE_APP + 10`
through `_WTENV_BASE_APP + 2000` across worktrees.

## Goals / Non-Goals

**Goals:**
- Pick a new `_WTENV_BASE_APP` that clears the collision with the
  Excalidraw MCP server on this machine. It must not open a new collision
  between the App and Vite port ranges across worktrees.
- Change every test that pins the main checkout's `PORT_APP` to the old
  literal.

**Non-Goals:**
- Making the base port configurable per machine. Two worktrees on one
  machine would then derive different identities for the same path. That
  breaks a `worktree-isolation` rule: the same worktree must always return
  the same values.
- Detecting a bound port and picking around it at runtime. The Decisions
  section below explains why the derivation stays a pure function of the
  checkout path instead.

## Decisions

**Pick 3100, not the next round number (3001, 4000).** `PORT_VITE`'s base
is 5173. `PORT_APP`'s range is `base + 10` through `base + 2000`. At
`3100`, that range tops out at `5100`, comfortably under `5173`. At `3200`
or higher, a worktree near the top of the offset range could derive a
`PORT_APP` at or past `5173`. It could then land on another worktree's
`PORT_VITE`, or the reverse. `3100` is the lowest round number clear of
that overlap. It keeps the two ranges disjoint the same way `3000`/`5173`
were.

**Keep the derivation pure.** An alternative is to probe for a free port
and pick the next one open. `worktree-isolation`'s spec already requires
the opposite. It states: "The same worktree therefore returns the same
values on every run." It adds that a bookmarked address stays valid as a
result.

A probe-and-pick strategy breaks that rule. It fails the moment a second
process holds the port only sometimes. It also lets `dev-up.sh`,
`preflight.sh`, and the pre-push hook disagree about which port a
worktree uses. Each sources the script at a different moment. A fixed
constant, chosen once, stays consistent everywhere.

**Leave `scripts/dev-up.sh`'s `OLD_OVERRIDE` fingerprint untouched.** That
heredoc matches one historical file byte-for-byte, to detect and remove it.
The fingerprint's port numbers name the file's old contents, from when the
base was `3000`. Changing them to `3100` would make the match fail against
the actual stale file it exists to find.

## Risks / Trade-offs

- **A contributor's mental model of port 3000** → no docs or specs name
  it as the derived value. `dev-up.sh`'s own printed output now prints
  `3100`.
- **A base-port bump above `3173`** → reopens the App/Vite overlap
  window. Stay comfortably under `5183` to avoid it. `3173` (`5173` minus
  `2000`) rounds that down to a round number. The offset's own span is
  `1990` (`2000` minus its own floor of `10`), not the full `2000`.

## Migration Plan

No data or running state migrates. A contributor who re-runs `dev-up.sh`
after pulling this change gets a new
`.devcontainer/docker-compose.ports.yml`. It publishes `3100` instead of
`3000`. Any already-running container on the old port stops answering
there until the contributor brings the stack up again. Rollback is
reverting the commit. The old base was never broken on its own; it was
only collision-prone with an unrelated host process.

## Open Questions

None.
