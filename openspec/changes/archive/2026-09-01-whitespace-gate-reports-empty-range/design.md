## Context

See proposal.md, section Why. Two facts shape the fix.

`scripts/gates/prose.sh` already prints a line when the range changes no
Markdown. It names the rule, says nothing needs checking, and exits 0. That line
is the model to copy.

`scripts/gates/whitespace.sh` collects paths from every range into one temp file.
An empty range list leaves that file empty. So does a range that changes no file.
One test on that file covers both cases.

## Goals / Non-Goals

**Goals:**

- The whitespace gate says so when it checks nothing.
- The two documented call sites pipe a range in.
- One test holds the new line in place.

**Non-Goals:**

- No change to what the gate rejects, or to how it probes for a CR byte.
- No non-zero exit on an empty range. That would break the hook on a branch
  deletion, which pushes no content.
- No change to `.githooks/pre-push` or `.github/workflows/check.yml`. Both pipe a
  range in already.

## Decisions

**The gate reports, and still exits 0.** The alternative is a hard failure on an
empty range. That rejects a legitimate push: `range.sh` prints nothing for a
branch deletion, by design. The gate would then block the one push that carries
no bytes to check.

**One message for both empty cases.** The gate could separate "no range arrived"
from "the range changed no file". It does not. `prose.sh` collapses the same two
cases into one line. The two gates should sound alike. A contributor who piped
nothing in learns the same thing either way: nothing ran.

**The message goes to stdout, not stderr.** `prose.sh` prints its line there,
because the line is not a finding. The whitespace gate follows.

**The test drives the script through `sh`.** A `bun:test` case spawns the gate
with empty stdin and reads stdout. That keeps the test at the level the failure
lives on. A test asserting on the shell source would pass while the script
misbehaves. The suite already spawns a shell script this way, in
`test/enable-hooks.test.ts`. The new test copies its shape.

**The message returns before the `git ls-files` probe.** Inside the devcontainer
`/workspace` is not a usable repository. A linked worktree's `.git` is a file
pointing outside the mount, and `git rev-parse --show-toplevel` there prints
`fatal: not a git repository`. `bun test` runs in that container. Returning
early keeps the empty-range path off git entirely, so the test needs no
repository.

## Risks / Trade-offs

**A test that spawns `sh` needs `sh` on PATH.** → The devcontainer is Debian
based and carries `/bin/sh`. The test spawns `sh` by name. A failed spawn fails
the test, rather than skipping it.

**The new line adds output to every push that changes no file.** → That is the
point. One line per gate is the cost of knowing a gate ran.

## Migration Plan

Nothing to migrate. The gate holds no state, and the change adds one printed
line to a path that printed none. The hook and the CI workflow pipe a range in
already, so their output does not move.

Rollback is one revert. No published body, stored row or pinned instance touches
this code.

## Open Questions

None.
