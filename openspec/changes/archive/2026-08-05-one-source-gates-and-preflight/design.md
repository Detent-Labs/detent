## Context

Six gate scripts sit in `scripts/gates/`. `.githooks/pre-push` runs them.
`scripts/gates/range.sh` is the one helper they already share. Each gate names
its rule in a `RULE` variable. A rejecting gate then prints four things: a
header, its findings, a repair command, and the bypass note.

Two of those four prints are the same text in every gate. The header appears 9
times and the bypass note 8 times. The findings and the repair command differ
per gate, as they must.

`scripts/preflight.sh` holds six checks under two profiles. A second file,
`preflight.ps1`, holds the same six in PowerShell. `.githooks/pre-push` runs
`bash scripts/preflight.sh core`. `scripts/dev-up.sh` runs the `serve` profile
through the same file. `scripts/dev-up.ps1` runs `preflight.ps1 serve`.

`dev-up.ps1`'s own happy path needs no host bash today. Its one `bash -c` call
runs inside the container, through `docker compose exec`.

## Goals / Non-Goals

**Goals:**

- The rejection header and the bypass note exist once.
- One implementation of the six preflight checks.
- No change to any gate's rule, scope, exit code, findings or repair command.
- No change to any preflight check, its order, its SQL or its repair command.

**Non-Goals:**

- No shared changed-file collector. See the rejected sub-claim below.
- No new gate, and no gate removed.
- No change to `.githooks/pre-push`, to `scripts/dev-up.sh`, or to
  `scripts/dev-up.ps1`.
- No change to `scripts/gates/range.sh`. It is already the shared helper the
  audit holds up as the pattern.

## Decisions

### `_lib.sh` holds two primitives, not one combined `fail_rule`

```sh
reject() {          # reject <rule>
  echo "pre-push: rule '$1' rejected this push." >&2
}
no_verify_note() {
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
}
```

A single `fail_rule <rule> <message>` that printed both lines and exited
would not fit. `whitespace.sh` sets `fail=1` and keeps checking. It prints the
header once and exits later, and `prose.sh` does the same across ranges.
`silent-green.sh` rejects at three separate points. Two primitives cover all
of those. One combined helper covers none of them.

Each gate sources the library by a path relative to its own location. A gate
therefore still runs alone during repair:

```sh
. "$(dirname "$0")/_lib.sh"
```

The leading underscore marks the file as not a gate. Nothing enumerates the
directory, since `.githooks/pre-push` names each gate it runs. The name still
tells a reader.

### The audit's shared-collector sub-claim is wrong, and this change drops it

The audit says the two gates hand-roll an identical changed-file loop,
differing only by a `-- '*.md'` pathspec. The two loops differ in
substance.

`prose.sh` runs `git diff --name-status -M --diff-filter=d`. It needs `-M`.
It emits a (range, base path, tip path) triple, because it reads a renamed
file's baseline at the old path. Its own comment records the measurement.
Without `-M`, renaming `timers/spec.md` reported 0 findings at the base and
220 at the tip.

`whitespace.sh` runs `git diff --name-only --diff-filter=d`. It needs one path
column and no rename tracking, because it judges worktree bytes rather than a
per-range baseline.

A shared collector would give `whitespace.sh` rename machinery it never reads,
or take `-M` away from `prose.sh` and break archiving. Neither is an
improvement.

### `preflight.ps1` becomes a delegator

```powershell
param([Parameter(Position = 0)][string]$Profile)
$bash = (Get-Command bash -ErrorAction SilentlyContinue).Source
if (-not $bash) { <named failure, naming Git Bash and dev-up.sh> ; exit 1 }
& $bash (Join-Path $PSScriptRoot "preflight.sh") $Profile
exit $LASTEXITCODE
```

The six checks then have one source. One `devcontainer-preflight` requirement
says both entry points run the same checks, in the same order, under the same
profiles. It becomes true by construction rather than by hand.

Two alternatives lost. A shared step list keeps two runners for six checks.
Those check bodies are `docker compose` calls and SQL, so the list would carry
most of each check as data. Deleting `preflight.ps1` outright breaks
`dev-up.ps1`, which calls it by name.

### The assumption this change makes, stated plainly

The delegator needs bash on the host. `dev-up.ps1` did not, before this
change. The assumption is that every contributor has Git Bash. Three facts
support it:

- `.githooks/pre-push` is a POSIX `sh` script, and it runs
  `bash scripts/preflight.sh core`. Anyone who pushes already needs bash.
- `preflight.ps1`'s own check 3 and check 4 print `bash scripts/dev-up.sh` as
  their repair. A reader who hits either already needs bash.
- Git for Windows ships Git Bash, and a contributor cannot clone without git.

`README.md` says `pwsh scripts/dev-up.ps1` serves "Windows without Git Bash".
This change makes that sentence false, so the change rewrites it.

## Risks / Trade-offs

- **A bash-less Windows contributor loses the `dev-up.ps1` happy path.** The
  three facts above say no such contributor exists here. If one appears, the
  delegator fails with a named message rather than a crash. Restoring the
  native PowerShell implementation is then one `git revert`.
- **A gate could source the library wrongly and die at push time.** Each gate
  runs standalone during repair. That is the check: run all six by hand before
  landing.
- **The bypass note's wording is now in one place.** Changing it changes every
  gate at once. That is the point, and it is also the whole blast radius.
- **`_lib.sh` could grow.** It holds two `echo` wrappers today. A third
  primitive belongs there only when two gates want the same one. The
  changed-file collector is the worked example of what does not.

## Migration Plan

None. No stored data, no schema, no HTTP contract. The change touches
developer tooling only.

Rollback is `git revert` of the single commit. The gates keep working at
every intermediate state, because each one changes independently of the
others.

## Open Questions

One, and it is the user's to answer rather than a blocker. Should the repo
keep a native PowerShell preflight for a Windows host with no Git Bash? This
change assumes no, on the evidence above. Reversing that assumption costs one
`git revert` and restores 133 lines of hand-synced checks.
