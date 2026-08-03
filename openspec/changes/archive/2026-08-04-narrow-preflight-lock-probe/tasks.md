## 1. Narrow the trigger in the PowerShell script

- [x] 1.1 In `scripts/preflight.ps1` check 6, skip a `.db-wal` of zero length
      before the `[System.IO.File]::Open` probe, using the `Length` the
      `Get-ChildItem` pipeline already carries
- [x] 1.2 Update the check 6 comment block to state what a zero-length WAL
      means (checkpointed, no unrecovered write) and why that is not the stale
      artifact the check looks for; leave the `ponytail:` line on the
      advisory-lock ceiling as it stands

## 2. Narrow the trigger in the shell script

- [x] 2.1 In `scripts/preflight.sh` check 6, `continue` the loop for a WAL that
      fails `[ -s "$wal" ]`, before either probe branch, so neither the
      MSYS/Cygwin `powershell.exe` call nor the POSIX `exec 3<>` runs for it
- [x] 2.2 Mirror the comment wording from task 1.2, so the two scripts read the
      same

## 3. Sync the spec and the state doc

- [x] 3.1 Apply the delta in
      `openspec/changes/narrow-preflight-lock-probe/specs/devcontainer-preflight/spec.md`
      to `openspec/specs/devcontainer-preflight/spec.md`: the reworded
      requirement body plus the two locked-WAL scenarios
- [x] 3.2 Extend the check 6 paragraph in `docs/current-state.md` (the
      "Devcontainer preflight" entry, the part that describes the
      `FileShare.None` probe) with the length condition. Leave the ordered list
      of six checks as it stands: it already says "no stale codebase-memory WAL
      file holds a lock"

## 4. Manual verification

- [x] 4.1 Run `pwsh scripts/preflight.ps1 serve` with Claude Code up (so
      `codebase-memory-mcp.exe` holds the index and its WAL is zero length),
      and confirm the run prints no check 6 warning
- [x] 4.2 Run `bash scripts/preflight.sh serve` under Git Bash in the same
      state, and confirm it agrees
- [x] 4.3 Confirm the warning still fires for a WAL that carries content. Copy
      check 6's loop into the scratchpad with the cache path replaced by a
      fabricated directory, put a non-empty `.db-wal` beside a database file
      held open there, and read the warning back. Do this for both loops.
      Write nothing into `~/.cache/codebase-memory-mcp`: the MCP server reads
      that directory as its project list, so a scratch file there can surface
      as a phantom project

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer
- [x] 5.2 Run the full `bun test` suite in the devcontainer with `DATABASE_URL`
      set, and read the skip count as well as the pass count
- [x] 5.3 Run the antislop linter over `proposal.md`, `design.md`, `tasks.md`,
      the delta spec, `openspec/specs/devcontainer-preflight/spec.md` and
      `docs/current-state.md`
- [x] 5.4 Run `git diff --check`
