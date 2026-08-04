## Context

See proposal.md for motivation, and `specs/push-gate-checks/spec.md` for what each
gate rejects.

Four facts about the current tree shape this design.

`.githooks/pre-push` already runs three steps in order. It checks the ponytail
ledger, runs `scripts/preflight.sh core`, then `exec`s `bun run check` through
`docker compose exec`. The last step uses `exec`, so nothing can follow it today.

1312 tracked files carry CRLF. `.gitattributes` sets `* text=auto eol=lf`, so git
normalizes each one on `git add`. The diff therefore stays clean while the
worktree file does not.

The antislop linter lives at a host path outside the repository. The container
mounts `/workspace` alone, so no path inside the container reaches the linter.

`bun install --frozen-lockfile` passes on the current tree. The suite reports its
database name at startup, which `development-toolchain` already requires.

## Goals / Non-Goals

**Goals:**

- One script per defect class, each runnable alone, each naming its own rule.
- Every gate passes on the tree that adds it.
- The git-only gates report even when the container is down.
- No new dependency. The gates use `sh`, `git`, `grep` and the tools already here.

**Non-Goals:**

- Orphaned exports after a refactor. Three commits removed dead exports, so the
  class clears the two-occurrence bar. A grep-level detector does not: it flags 76
  of 786 exported symbols as single-file-only, roughly 10% noise, and it would
  land red. A correct detector needs TypeScript reference analysis through `knip`
  or `ts-morph`. That is a new dependency for a class that has cost nothing yet.
- Stale UI state after a change. CQ-3, ERR-2 and `CLAUDE.md` record three
  instances. Catching it needs a browser. `CLAUDE.md` already requires a real
  browser for any UI change. The rule exists. No script replaces it.
- Stale roadmap status. Three commits repaired it. No reliable mapping runs from
  an archived change name to a `ROADMAP.md` stage line, so any detector guesses.
- Off-by-one bounds. One clear instance, commit 5ba1dfe. Below the bar, and no
  general detector exists.
- Commit-message escaping. The global `CLAUDE.md` records two instances. This
  repository's own log holds none, so the gate would belong in another repository.

## Decisions

### One script per class, not one gate runner

Each class gets `scripts/gates/<name>.sh`. The hook calls them in order.

The alternative was a single `scripts/gates/all.sh` with a case statement. Per-class
scripts win on the repair loop. A contributor who trips the whitespace rule runs
that one script until it passes, without waiting on a frozen install.

The scripts are POSIX `sh`. The hook is already `#!/bin/sh`, and `preflight.sh` is
already `bash`. Matching the hook keeps one interpreter for the gate path.

### The ponytail-ledger check moves into `scripts/gates/`

Commit 22f3284 put that check inline in the hook. It is a gate by every property
this change defines. It needs only git and a shell. It names its own rule. It
prints the command that repairs the tree.

Leaving it inline gives one concept two homes. A contributor looking for the gates
would find five in `scripts/gates/` and one in the hook.

It moves to `scripts/gates/ponytail-ledger.sh` unchanged. The hook then reads as
one list: the host gates, the preflight, the container checks.

The move carries no behavior. The `ponytail:` comment inside it, which records
that the check compares paths and not line numbers, moves with it.

### The pushed range comes from stdin, with two fallbacks

Git feeds a pre-push hook one line per ref on stdin. Each line holds a local ref, a
local sha, a remote ref and a remote sha.

The gates need a commit range, and every case emits it as `A..B`. `git diff`
takes two endpoints. It does not accept rev-list syntax, so a form like
`<sha> --not --remotes` would not survive the consumer.

- The remote sha is a real commit. The range is `<remote sha>..<local sha>`.
- The remote sha is all zeros, meaning a new branch. The base is the merge-base
  with `origin/main`, or the empty-tree hash when they share no commit.
- The local sha is all zeros, meaning a branch deletion. That ref pushes no
  content, so the gates skip it.

A contributor may also run a gate by hand, with no stdin. The scripts then fall
back to `origin/main..HEAD`.

The helper separates two questions that look like one. A push that only deletes
branches gives lines but no range, and it stays empty. Falling back there would
check commits the push does not send.

The alternative was to read the worktree instead of a range. That fails the
arrives-green rule at once, on 1312 CRLF files.

### The whitespace gate reads worktree bytes, not the diff

`git diff --check` reports a trailing space and a blank line at end of file. It
does not report CRLF here, for the `.gitattributes` reason above. `CLAUDE.md`
records this trap and names `grep -lI $'\r'` as the worktree probe.

That named probe does not work on this machine. MSYS grep opens a file in text
mode and strips the CR before matching. It reports nothing on a file `file(1)`
calls CRLF. Measured while building this gate.

The gate asks git instead, through `git ls-files --eol`. That reports `w/lf`,
`w/crlf` or `w/mixed` per tracked file. It needs no shell-level byte probe, and
it catches a mixed-ending file too. `CLAUDE.md`'s probe line changes with this
change.

The gate runs both checks. `git diff --check` over the range covers the two
whitespace rules. The `--eol` listing covers the CR rule.

A file the range changed and then deleted is absent from the `--eol` listing.
That is the wanted behavior: it has no worktree bytes left to judge.

### The skip floor is a tracked number, not a computed one

`scripts/gates/skip-floor.txt` holds one integer. The gate compares the run's skip
count against it and rejects a higher count.

The alternative was to reject any skip at all. That fails the arrives-green rule:
the suite skips by design when `SMTP_HOST` is unset, and `development-toolchain`
specifies that skip.

A tracked floor makes an increase a reviewable line in a diff. A computed
threshold, or a percentage, hides the same increase inside a formula.

The floor is a ratchet in one direction only. Nothing lowers it automatically. A
change that removes skipped tests may lower it by hand.

### The lockfile gate catches drift, not every manifest change

Measured: `bun install --frozen-lockfile` fails on a dependency the lockfile has
no entry for. It passes on a widened range the locked version still satisfies,
such as `jose` moving from `^6.2.4` to `^6.0.0`.

That is the correct scope. The lockfile and the manifest still agree in the
second case, so nothing drifted. The gate guards agreement, not manifest text.

### The suite gate reuses the run the hook already does

`bun run check` runs the suite once. Running it again for the skip count would
double the slowest step.

The hook therefore captures that run's output to a file and reads the counts from
it. The gate parses the summary line for the skip count. It also reads the
database line the suite already prints.

Two literals carry the database signal, both from `test/preload-db.ts`. Line 56
prints `[test] database: <name>`. Line 58 prints `[test] DATABASE_URL unset` and
names the skip that follows. The gate matches those strings rather than inferring
a database from silence. Both reach stdout and survive a `2>/dev/null` redirect.

`bun test` prints no skip line at all when nothing skips. A run with skips prints
` 35 skip` between the pass line and the fail line. A run without them prints the
pass and fail lines alone. The gate SHALL therefore read an absent skip line as
zero. A gate that greps for a line that is not there gets an empty string. An
integer comparison against empty misreports rather than rejecting.

The hook captures the run without a pipe:

```sh
if $COMPOSE exec -T -w /workspace app bun run check > "$OUT" 2>&1; then st=0; else st=$?; fi
cat "$OUT"
```

`cmd | tee` would return `tee`'s status, so it needs `set -o pipefail`. That
option is not POSIX, and the hook is `#!/bin/sh`. It works on this machine, where
the container runs dash 0.5.12 and the host runs Git Bash. It would pass every
push on an older dash. The capture form above needs no option and no shell
feature beyond POSIX.

The trade-off is that this gate cannot run standalone before the suite runs. It
takes the output path as its argument, so a contributor can point it at any
captured run.

### The antislop gate skips loudly rather than failing

The gate looks for the linter at `ANTISLOP` in the environment first, then at a
`$HOME`-relative default. It prints a named skip when it finds neither.

The default is `$HOME`-relative rather than absolute because gate 4 would
otherwise trip gate 5. A literal `C:/Users/<account>/AI/AntiSlop/antislop.py` in
a tracked script is exactly the machine path the no-machine-paths gate rejects.

The alternative was to fail. On a clone without the tool that leaves `--no-verify`
as the only way to push. That flag disables every gate. One check lost beats all
of them.

The gate runs on the host, before the container steps, because the linter is not
in the container.

### The machine-path gate reads tracked files, not the range

This gate scans every tracked file rather than the pushed range. The scan costs
one `git grep`.

Whole-tree scope catches a path that arrives through a merge or a rebase, which a
range scope would miss.

The pattern covers a Windows user directory and a Unix home directory. Some
tracked paths name a container filesystem rather than a contributor's machine.
`.devcontainer/devcontainer.json` mounts a volume at `/home/node/.claude`. The
documents explaining that mount quote the same path.

A directory exclusion list would not reach those documents. The gate uses a
denylist of container users instead, `node` and `root`. It rewrites those users
out of each matched line, then re-applies the pattern. A line carrying a real
machine path beside a container path therefore still fails. Only `.gitignore`
stays excluded by path, since it names such a path by design.

Without this the gate lands red on its first run. The arrives-green rule then
fails, and a gate nobody can pass costs every other gate to `--no-verify`.

The measurement: zero matches across tracked files. A replayed
`C:/Users/<name>/AI/AntiSlop/antislop.py` still trips the pattern, and neither
`.claude/skills/` nor `docs/superpowers/plans/` sits behind an exclusion. Those
two directories held the paths commit e152f9c removed.

The denylist is two users. A base image running as a third needs a row. The
script carries a `ponytail:` marker naming that ceiling.

## Risks / Trade-offs

- The skip floor becomes a number people raise without reading it. Mitigation: the
  file carries a comment naming what the current floor covers. The gate also
  prints both counts when it rejects a push.
- Reading stdin changes the hook's behavior. A hook that consumes stdin and then
  mis-parses it could pass an empty range and check nothing. Mitigation: the range
  helper fails loudly on an unparsable line rather than defaulting to empty.
- The gates add host-side runtime to every push. Measured cost is the git-only
  gates, which read one commit range and one `git grep`. The frozen install and
  the suite dominate the total.
- The 1312 CRLF files stay as they are. New work meets the rule. The tree does not.
  Repairing it is a separate change, and a large diff with no behavior in it.
- `--no-verify` still bypasses everything. This change alters nothing there, and
  `development-toolchain` already records the property.

## Migration Plan

No migration. The hook is already wired through `git config core.hooksPath
.githooks`, which each clone runs once. A clone that already ran it picks up the
gates with the next pull.

Rollback is a revert of the hook change. The gate scripts are inert without the
hook calling them.

## Open Questions

None. The spec settles each gate's scope, its placement, and what it does when its
tool is absent.