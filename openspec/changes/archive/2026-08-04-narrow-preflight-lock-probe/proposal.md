## Why

Preflight check 6 warns on almost every run. The warning names the session's
own tooling. Claude Code starts `codebase-memory-mcp.exe` as a child process.
That process holds an open SQLite connection to the index.

The check's probe opens the database file with no sharing, `FileShare.None` on
Windows. Any live connection refuses that open. The check therefore reports a
lock whenever the editor runs.

The check exists to find a stale WAL file left by a dead process. A live, idle
connection checkpoints its WAL to zero bytes. That is the opposite signal. A
warning that prints on every run stops carrying information.

## What Changes

- Check 6 skips a `.db-wal` file of zero length in both preflight scripts. A
  zero-length WAL means the writer checkpointed it. No unrecovered write is
  pending, so the file is not the stale artifact the check looks for.
- A `.db-wal` with content keeps the current probe and the current warning.
- The two scripts stay one flow: `scripts/preflight.ps1` and
  `scripts/preflight.sh` take the same rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `devcontainer-preflight`: the requirement "The WAL check warns rather than
  blocks" gains the length condition on its trigger. A held lock alone no
  longer warrants a warning. The WAL file must also carry content.

## Impact

- `scripts/preflight.ps1` (check 6, the `Get-ChildItem` filter loop).
- `scripts/preflight.sh` (check 6, the `for wal in ...` loop, both the
  MSYS/Cygwin branch and the POSIX branch).
- `openspec/specs/devcontainer-preflight/spec.md`.
- `docs/current-state.md`, the check 6 paragraph of the "Devcontainer
  preflight" entry. It describes the `FileShare.None` probe, so it states the
  trigger this change narrows.
- `.githooks/pre-push` calls `bash scripts/preflight.sh core`, and the `core`
  profile covers check 6. The change therefore also quiets every push on a
  machine that runs the index. The hook itself stays as it is.
- No engine, schema, HTTP or UI code. No test suite change. The preflight
  scripts carry no automated test today, and this change adds no reason to
  build one.
