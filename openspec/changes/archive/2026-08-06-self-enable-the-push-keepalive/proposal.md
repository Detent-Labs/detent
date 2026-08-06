## Why

On 2026-08-06 four pushes in a row ended at exit 141. No gate printed a
rejection. The hook ran every check and exited 0 each time. The line that
named the cause appeared only in the fourth log:

```
Connection to github.com closed by remote host.
```

The order of events is the cause. Git opens the connection to the remote
before it runs `pre-push`. The hook's standard input carries a remote object
name for each ref. Only the remote supplies that name. So the connection is
already open when the hook starts.

The hook then runs four host gates, `preflight.sh core` and the lockfile
gate. Last it runs `bun run check`: the typecheck, the full suite, and a
second timezone-pinned run. That takes minutes. No byte crosses the
connection in that time. GitHub closes it.

The hook exits 0, and git writes the pack into a dead socket. It takes
SIGPIPE and stops at 141, which is 128 + 13.

The repair is an SSH keepalive. A push run as
`GIT_SSH_COMMAND='ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30'`
went through at the first try. `git config core.sshCommand` now carries the
same options in this clone. That covers this clone and nothing else. A fresh
clone on another machine meets the same four failures.

**The first diagnosis was wrong, and the wrong answer looks right.** Exit 141
reads as a broken pipe inside the hook. Two commits repaired the hook on that
reading. The hook was not at fault, and it stands where it stood. The number
to read is not 141. It is the `closed by remote host` line above it, and that
line appeared in one log of four.

## What Changes

- `scripts/enable-hooks.sh` sets `core.sshCommand` beside the
  `core.hooksPath` it already sets. Every contributor runs `bun install`, and
  that run now arms the keepalive.
- The script never overwrites a `core.sshCommand` a contributor already set.
  A value there may carry an identity file, a proxy command or a different
  `ssh` binary. The script prints the two options to add, then exits 0.
- `test/enable-hooks.test.ts` gains a case per branch. That includes the
  violating input: a repository holding a foreign `core.sshCommand` keeps it.
- `development-toolchain` gains one requirement for the push connection. It
  is a new requirement, not a change to the requirement that owns the hook.
  The two have different subjects. One says which checks a push runs. This
  one says the connection survives them.

Out of scope, and named so the reason survives. This change sets no
`http.keepAlive*` value. `design.md` carries the evidence. The remote is SSH,
and the HTTPS transport holds no connection across the hook.

## Capabilities

### Modified Capabilities

- `development-toolchain`: a clone gains the push keepalive from its first
  install, the way it already gains the hook.

## Impact

- `scripts/enable-hooks.sh`: one branch after the `core.hooksPath` line.
- `test/enable-hooks.test.ts`: four cases added (no-value write, foreign-value
  keep, GIT_SSH keep-out, idempotent equal-value).
- `openspec/specs/development-toolchain/spec.md`: one requirement, at archive.
- No source file changes. `package.json` stays as it is, because `prepare`
  already runs the script.

A contributor who set `GIT_SSH_COMMAND` in the environment keeps it. That
variable wins over `core.sshCommand`. The script cannot reach such a
contributor, and it does not try.
