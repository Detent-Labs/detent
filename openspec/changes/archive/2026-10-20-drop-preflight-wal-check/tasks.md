# Tasks

## 1. Delete check 6

- [x] 1.1 In `scripts/preflight.sh`, delete check 6. That is the comment block that opens "Check 6", the `shopt -s nullglob` line it needs, and the WAL loop with its Windows branch. Change the header's usage line `core:  checks 1, 2, 6` to `core:  checks 1, 2`. Keep checks 1 to 5 and the final `preflight (<profile>): all checks passed` line as they are. Verify with these four checks:
  - `grep -n -E 'WAL|check 6|FileShare|powershell|cygpath' scripts/preflight.sh` printing nothing
  - `grep -n 'checks 1, 2,' scripts/preflight.sh` printing nothing
  - `bash scripts/preflight.sh core` and `bash scripts/preflight.sh serve` both passing
  - `bash -n scripts/preflight.sh` clean
- [x] 1.2 In `ROADMAP.md`, change "six ordered devcontainer preconditions" to "five ordered devcontainer preconditions". Verify with `grep -n 'five ordered' ROADMAP.md`.
- [x] 1.3 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason. If the linter is absent, leave this task open and say so.

## 2. Verification

- [x] 2.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [x] 2.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [x] 2.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [x] 2.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`; then start apply without asking (owner's rule).
- Archive last, after the six stacked changes below it.
- No push until the user confirms the new machine is ready.
