# Design

## Context

See proposal.md, section Why. Claude Code runs on the Windows host. The
suite runs in the devcontainer through `docker compose exec`. `rtk` runs on
the host and filters the output that `docker compose` passes back.

All measurements below come from 2026-09-30, with rtk 0.50.0 and 4997 tests.
They used the stack `scripts/dev-up.sh` starts, with a prototype of the runner
copied into the container.

| Run | Lines | Characters | Exit |
|---|---|---|---|
| `bun test`, raw | 5581 | 523110 | 0 |
| `rtk test`, direct | 6 | 87 | 0 |
| `rtk test` with the runner, green | 6 | 87 | 0 |
| `rtk test` with the runner, `DATABASE_URL` unset | 7 | 155 | 1 |
| `rtk test` with the runner, red test file | 30 | 585 | 1 |

## Goals / Non-Goals

**Goals:**

- One host call runs the suite, applies the silent-green check and prints a
  short result.
- A red run keeps each failing test's name, its diff and its stack lines.

**Non-Goals:**

- The push hook and `bun run check` stay as they are. They already capture
  the full output.
- No change to the global rtk settings.
- The runner does not need rtk. Without rtk it prints the full output.

## Decisions

**The host call sources the worktree variables first.** It reads:

```sh
. scripts/worktree-env.sh && MSYS_NO_PATHCONV=1 rtk test docker compose -f .devcontainer/docker-compose.yml exec -T -w /workspace app sh scripts/test-gated.sh bun test
```

The first part stops a linked worktree from reaching the main checkout's
container. The second part stops Git Bash from turning `/workspace` into a
Windows path. Inside the devcontainer the call is only
`sh scripts/test-gated.sh bun test`.

**Three test cases cover the runner.** They live in `test/gates.test.ts`.
Each case gives the runner a fake `sh -c` command. That command prints a
database line or the unset line, then exits with a set code. No rtk and no database take part. The cases
match the three spec scenarios.

**The runner takes the command as arguments.** It runs `"$@"`. The
alternative was a quoted `sh -c` script. `rtk test` splits that
script at its spaces: `rtk test sh -c 'exit 3'` printed nothing and exited 0.
`rtk proxy` passed the same call through intact and exited 3. The arguments
form contains no quoted script, so the split cannot occur. Passing the script
on stdin fails too, because `rtk test` does not forward stdin.

**The call keeps the words `bun test`.** `rtk test` selects its filter from
the words in the call. A call without those words printed only the last 5
lines. A red run then lost every test name, diff and stack line. A call with
`bun test` at its end kept all of them.

**The runner lives in `scripts/`.** It rejects no push and prints no rule
name. So it is not a gate, and `scripts/gates/` does not hold it. It finds the gate through
a path relative to its own location. Each gate finds `_lib.sh` the same way.

**The log goes to `mktemp`, in the container's own `/tmp`.** The repository's
`tmp/` is shared across worktrees. The container's `/tmp` is not, because each
worktree runs its own container.

**This change does not set `tee_on_success = true`.** That setting would make
rtk write a full log on a green run too. But it is global and changes every
other repository on the machine. Nobody measured yet whether rtk then prints
the log path on a green run.

**This change does not use `rtk err`.** It cuts object diffs short.

## Risks / Trade-offs

- [Risk] The filter hides the gate's rejection text. With `DATABASE_URL`
  unset, the output shows `0 fail`, `1669 skip` and exit 1. It shows no rule
  name. → The last line names the full log under `rtk/tee/`. The rejection
  stands in that log. `CLAUDE.md` states what exit 1 with `0 fail` means.
- [Risk] A red run lists all failing test names first and the errors after
  them. The output shows no name next to an error. → The order is the same in both
  lists. For many failures, read the full log.
- [Risk] A later rtk version can change how it selects the filter. → The
  `CLAUDE.md` text carries the measurement date and the rtk version. A
  deviating run shows at once as a long output or a missing diff.
- [Risk] rtk caps a full log at 1 MB (`tee_max_file_size`). A raw run is
  523110 characters today. → Below the cap. The runner does not depend on
  the full log.

## Migration Plan

No migration. To revert, delete `scripts/test-gated.sh` and restore the
`CLAUDE.md` bullet.

## Open Questions

None.
