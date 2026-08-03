## MODIFIED Requirements

### Requirement: The WAL check warns rather than blocks

The codebase-memory index is per-machine local state. It sits outside the
repository, under a path that carries the username. It drives no engine
behavior and no test.

Check 6 SHALL print a warning and SHALL NOT fail the preflight. It SHALL
resolve the path at run time rather than carry a hardcoded one. A missing
index directory SHALL pass, not fail.

Check 6 SHALL warn only for a WAL file that carries content. A WAL file of
zero length SHALL pass without a warning and without a lock probe. That holds
whether or not a process holds the database open.

A zero-length WAL means the writer checkpointed it. No unrecovered write is
pending, which is the opposite of the stale WAL this check looks for. The
tooling that reads the index runs beside the preflight on a developer machine.
A held lock alone therefore does not tell a live reader from a dead one.

#### Scenario: A locked WAL file that carries content

- **WHEN** check 6 finds a WAL file of non-zero length that another process
  holds
- **THEN** the preflight warns, names the command that clears the lock, and
  still exits zero on that check alone

#### Scenario: A zero-length WAL file held by a live process

- **WHEN** check 6 finds a WAL file of zero length whose database another
  process holds open
- **THEN** the check passes without a warning

#### Scenario: No index on this machine

- **WHEN** check 6 finds no codebase-memory directory
- **THEN** the check passes without a warning
