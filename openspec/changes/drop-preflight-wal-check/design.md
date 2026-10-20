# Design

## Context

See proposal.md. Since the early sync of `devcontainer-on-podman`
(2026-10-20), `openspec/specs/devcontainer-preflight/spec.md` holds "The
preflight checks six preconditions in a fixed order", "The preflight carries
two profiles" and "The WAL check warns rather than blocks". On the current
branch, `scripts/preflight.sh` runs check 6 as its last block, after check 5,
and prints its `preflight (<profile>): all checks passed` line after it.

The pending change `drop-windows-host-support` removes "Both bring-up scripts
carry the same preflight contract", which also says "six checks". Its
replacement, "The bring-up and the preflight stay idempotent", names no count,
so this change needs no delta against it.

## Goals / Non-Goals

**Goals:**

- No preflight check that cannot fire on the development host.

**Non-Goals:**

- A Linux replacement for the WAL check. A held lock on Linux does not tell a
  live reader from a dead one, as the removed requirement itself states.
- Changing checks 1 to 5, their numbers or their repair commands.

## Decisions

### D1. Remove the check rather than make it OS-aware

The check exists to catch a Windows sharing violation. Keeping it as a
documented no-op on Linux would leave a block of code and a requirement that
promise a warning nothing can produce. Removing it costs nothing a user sees:
the warning never printed on this host.

### D2. REMOVED plus ADDED for the count requirement

The count is in the requirement's header, and a MODIFIED block cannot change
a header. REMOVED plus ADDED is the plainest form that states the new header
and validates. The five-check requirement keeps the same three scenario
names.

## Risks / Trade-offs

- [A future macOS or Windows contributor loses the warning] → On macOS it
  never fired either. Windows host support is gone with
  `drop-windows-host-support`.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Archive after the six changes below it.
3. Rollback: revert the commits.

## Open Questions

None.
