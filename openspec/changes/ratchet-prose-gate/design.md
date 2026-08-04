## Context

See proposal.md for motivation, and `specs/push-gate-checks/spec.md` for the
changed requirement.

Four facts shape the approach.

`scripts/gates/prose.sh` reads commit ranges on stdin, one per line, as
`scripts/gates/range.sh` prints them. It collects the changed Markdown paths with
`git diff --name-only --diff-filter=d "$range" -- '*.md'` into a temp file, then
runs the linter once per path.

Every range that `range.sh` prints has the form `A..B`. The base is `A`. The
helper already guarantees that form, because `git diff` takes endpoints and
rejects rev-list syntax.

The linter costs 0.16s per file, measured over two of the largest specs. Its
`check` subcommand takes paths only and rejects `-`, so any version that is not
a worktree file needs a temp file.

The push that exposed this ran the exact comparison by hand: 28 findings at
`origin/main`, 33 after the sync, 28 after the repair. The gate now automates it.

## Goals / Non-Goals

**Goals:**

- Block a Markdown file that gets worse. Permit one that stays level or improves.
- Keep the absent-linter skip untouched.
- Add no dependency. The gate keeps to `sh`, `git` and the linter.
- Arrive green on the tree that adds it.

**Non-Goals:**

- Clearing the 3166 findings in the live specs. The ratchet permits them. A
  change that wants to reduce them is its own change.
- Per-line attribution. The gate counts findings per file. It does not decide
  which finding belongs to which diff hunk. Counting is cheap and needs no map
  between two versions of a file whose line numbers moved.
- A budget file like `skip-floor.txt`. The base commit already carries the
  number, so nothing needs tracking by hand.

## Decisions

### The gate evaluates one range and one path at a time

The gate today collects paths from every range into one list, then dedupes it
with `sort -u`. After that a path no longer carries the range it came from.

That structure cannot support a baseline. `range.sh` prints one line per pushed
ref. A push of two branches therefore gives two ranges with two different
bases. The lint loop moves inside the range loop. The gate evaluates each
`(range, path)` pair against that range's own base.

A path that appears in two ranges gets checked against each base. It fails the
push when it rises in any one of them. The gate accumulates offending paths
across every range, so one push reports all of them.

### The baseline is the range's base commit, read through `git show`

For a range `A..B`, the gate reads each changed path at `A` with
`git show "A:<path>"`. It writes that to a temp file and lints the temp file.

`git show` fails when the path does not exist at `A`. The gate treats that exit
as a base count of zero. That is what makes a newly added file lint clean.

The alternative was a tracked budget file, one number per Markdown path, the
shape `skip-floor.txt` uses. This design drops it. The base commit already holds
the answer. A budget file covering every Markdown path would need an entry per
file. It would also need a change every time somebody repairs one.

### The finding count comes from the exit code, not from the line count alone

The linter exits 0 with no output on a clean file. It exits 1 and prints one
line per finding on a file with findings. It exits 2 and prints one line on a
bad path.

Counting output lines alone therefore reads a bad path as one finding. That
corrupts a baseline in the direction that matters. A base of 1 instead of 0
lets a newly added file carry one finding through.

The gate branches on the exit code. Exit 0 means zero findings. Exit 1 means the
line count. Exit 2 aborts the gate and names the path. A bad path is the gate's
own error, never a fact about the document.

The `--json` flag would also give a countable structure. It needs a JSON parser,
and this gate runs host-side in POSIX `sh` with no such tool. The exit-code
branch adds nothing.

### The comparison is a count, not a diff of findings

The gate compares two integers. It does not match individual findings between the
two versions.

Matching would be more precise. It would also need a stable identity for a
finding. The linter reports a line and column, and both move when a paragraph
reflows. A file that gains one finding and loses another would pass under
counting. This design accepts that gap. The count never rose, so the file did
not get worse.

### Both sides read committed content, not the worktree

A push ships commits. A contributor can push while the worktree carries
uncommitted edits. The gate would then judge content the push does not send.
Both sides therefore read through `git show`: the base at `A`, and the pushed
version at `B`.

The whitespace gate reads worktree bytes instead. That is deliberate there.
`.gitattributes` sets `* text=auto eol=lf`, so git normalizes CRLF on `git add`.
Only the worktree still holds the CR. Prose carries no such asymmetry.

### The temp file keeps the extension

The linter reads Markdown. The gate writes each version to a temp path ending
in `.md`. Nothing then depends on the linter guessing a format from content.

An `allow-file` directive at the top of a file travels with the content. The base
version's directives therefore apply to the base count. That keeps the
comparison honest when a change adds or removes a directive.

### A directive change is visible in the count, on purpose

Adding an `allow-file` directive lowers a file's count. The gate permits that,
since the count falls.

That is the correct behavior and worth naming. A contributor can silence findings
rather than fix them, and the gate does not stop it.

No norm against a blanket directive exists in the repository today. This change
adds one to `CLAUDE.md`, in task 4.4. Until then nothing written down discourages
the practice.

A mechanical gate cannot tell a justified silence from a lazy one. The directive
appears in the diff, and a reviewer is the only check on it.

### The rejection output names both counts

The gate prints the path, the base count, the worktree count, and the linter's
findings for the worktree version. The skip-floor gate already prints both
counts when it rejects a push. The two therefore read alike.

The gate does not print which findings are new. It does not know.

## Risks / Trade-offs

- A contributor silences a real finding with a directive instead of fixing it.
  The repository already shows this going unchallenged. Commit `bbf37d1` put a
  six-rule `allow-file` line at the top of `CLAUDE.md`. Measured: that file
  reports 0 findings with the directive and 45 without it. Mitigation: task 4.4
  writes the norm down, and the directive appears in the diff. Neither is a
  gate, and no gate can judge intent.
- A file gains one finding and loses another in the same push. Mitigation: none.
  The count did not rise, so the gate permits it. Accepted above.
- The gate costs one more linter run per changed Markdown file. Measured at
  0.16s per invocation. A five-file change measured 1.625s in total, across ten
  invocations. The suite dominates the push.
- Marking a task box changes a file's finding count. Measured on this change's
  own `tasks.md`: 0 findings with every box as `- [ ]`, and 2 with them as
  `- [x]`. The linter reads the empty box as a sentence boundary. It reads the
  filled one as a word. A long task line therefore passes while open and fails
  once done. Every OpenSpec change meets this at apply time. Mitigation: keep a
  task line short enough to pass in both states. No directive suits it, since
  the finding is real prose length either way.
- The 3166 findings stay. That is the point of the change, and it is a debt the
  repository keeps until somebody spends the time. The norm in `CLAUDE.md` is
  what reduces it, not the gate.
- `git show` on a path with unusual characters could misbehave. The repository
  has no such path today, and the gate quotes its arguments.

## Migration Plan

No migration. This change rewrites one script and one `CLAUDE.md` section. The
hook already calls the gate, and the call site stays as it is.

Rollback is a revert of the script change. The gate returns to the whole-file
check, and the live specs become unpushable again for any change touching them.

## Open Questions

None. The spec settles what blocks a push, what does not, and what the gate does
when the linter is absent.
