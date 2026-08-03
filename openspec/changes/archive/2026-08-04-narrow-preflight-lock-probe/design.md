## Context

See proposal.md, section Why. What matters for the approach is the shape of
the two loops that implement check 6 today.

`scripts/preflight.ps1` enumerates `*.db-wal` under the resolved cache
directory. It derives the database path from the WAL name. It then opens that
path with `[System.IO.File]::Open($dbPath, 'Open', 'ReadWrite', 'None')`. The
`None` share mode is the probe. A sharing violation means somebody holds the
file.

`scripts/preflight.sh` runs the same loop with two probe branches. Under
MSYS/Cygwin it calls `powershell.exe` for the same .NET open, because the
shell's own `<>` redirection raises no Win32 sharing violation. Elsewhere it
uses `exec 3<>"$db"`. That succeeds against an advisory-lock system, so the
check warns on Windows alone. `scripts/preflight.sh:78` already carries a
`ponytail:` comment on that ceiling.

Both loops probe every WAL file they find. Neither reads the WAL's length.

## Goals / Non-Goals

**Goals:**

- Check 6 stays quiet while the tooling that reads the index runs. On a
  developer machine that is most of the time.
- The two scripts keep one rule between them, per the existing requirement
  "Both bring-up scripts carry the same preflight contract".

**Non-Goals:**

- Naming the process that holds the lock. That needs a handle enumeration,
  either Sysinternals `handle.exe` or a `NtQuerySystemInformation` call. The
  repository ships neither, and both want elevation.
- Closing the detection gap on Linux and macOS. The advisory-lock ceiling
  stays where the `ponytail:` comment records it.
- Any automated test for the preflight scripts. They carry none today.

## Decisions

**Use the WAL's length as the staleness signal.** SQLite truncates or zeroes
the WAL on a checkpoint. A zero-length WAL therefore holds no unrecovered
frame, and the database file behind it is complete. That is a property of the
data. A reader gets it without touching the holding process.

Alternatives considered:

- *Match on a process name.* Look for `codebase-memory-mcp` among the running
  processes, and skip the warning when it runs. This writes the name of one
  tool into a check about file state. It stays wrong for a second reader. It
  also needs two different process enumerations for the two scripts.
- *Drop check 6.* It found a real 64 MB stale WAL on this machine, kept as
  `…SummitBPS.db-wal.bak-20260803`. The check earns its place. Only its
  trigger is too wide.
- *Probe with a shared open instead.* A shared open succeeds against a live
  reader and against a stale WAL alike. It detects nothing. Without a handle
  enumeration, the sharing violation is the only lock signal available.

**Skip the probe for a zero-length WAL.** Do not probe and then suppress the
warning. The probe opens a file that another process writes. Not opening it is
cheaper and free of that interference. In the shell script it also avoids one
`powershell.exe` process per file.

**Test the length before the probe in both scripts.** PowerShell already holds
the `FileInfo` from `Get-ChildItem`, so `$_.Length -eq 0` needs no extra call.
The shell script has no such handle and uses `[ -s "$wal" ]`, the POSIX test
for a file of non-zero size. That test is exact here and needs no `stat`,
whose flags differ between GNU and BSD.

## Risks / Trade-offs

**A stale WAL that a crash left at zero length goes unreported.** → A WAL
reaches zero length through a checkpoint. A checkpoint is what makes the
database file self-sufficient. A zero-length WAL beside an intact database is
no recovery hazard, so the warning has nothing to report.

**A live writer with a busy, non-empty WAL still warns.** → Accepted. The
warning is truthful there. A reader cannot tell that WAL from an abandoned one
without asking the holding process. Check 6 exits zero either way.

**The two scripts drift, since neither has a test.** → The change touches both
in one commit. The existing spec requirement holds them to one contract, and
verification is a manual run of each script.

## Migration Plan

No migration. The preflight scripts hold no state, write nothing, and read
only what they find at run time. A developer's next run takes the new rule.

Rollback is a revert of the commit. Nothing depends on the narrower trigger,
and no data records which rule produced a past warning.

One consumer runs the check beyond the bring-up. `.githooks/pre-push` calls
`bash scripts/preflight.sh core`, and the `core` profile covers check 6. That
call needs no change. It takes the narrower trigger, and it loses it again on
the same revert.

## Open Questions

None. The one deferred item is the advisory-lock ceiling on Linux and macOS.
It predates this change, and the `ponytail:` comment in both scripts keeps
recording it.
