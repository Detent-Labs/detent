# Proposal

## Why

Preflight check 6 warns when a codebase-memory WAL file carries content and
another process holds it locked. The probe opens the database read-write
(`( exec 3<>"$db" )`). That open fails only where the OS enforces mandatory
file locks, which is Windows. The check's Windows branch shells out to
PowerShell for exactly that reason. On Linux and macOS locks are advisory, so
the open always succeeds and the check never warns. Its own `ponytail:`
comment names that ceiling.

The development host has run Linux since
2026-10-20, and the `drop-windows-host-support` change left this check for a
change of its own.

## What Changes

- `scripts/preflight.sh` loses check 6: the WAL loop, its Windows branch and
  its comment block. The preflight runs five checks.
- The `core` profile covers checks 1 and 2; `serve` adds 3, 4 and 5.
- `ROADMAP.md` names five ordered preconditions instead of six.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `devcontainer-preflight`:
  - removes "The WAL check warns rather than blocks"
  - removes "The preflight checks six preconditions in a fixed order"
  - adds "The preflight checks five preconditions in a fixed order"
  - drops check 6 from `core` in "The preflight carries two profiles"

## Impact

- `scripts/preflight.sh`, `ROADMAP.md`.
- Ordering: stacks on `bump-openspec-cli`; its base is the synced
  `devcontainer-on-podman` text. Archive after the six changes below it.
