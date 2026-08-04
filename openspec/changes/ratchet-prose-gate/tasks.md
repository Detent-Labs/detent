## 1. Count helper

- [x] 1.1 Add a function to `scripts/gates/prose.sh` that prints one path's
  finding count at a given commit. It writes `git show "<commit>:<path>"` to a
  temp file ending in `.md`, then lints that file
- [x] 1.2 Branch the count on the linter's exit code. Exit 0 means zero. Exit 1
  means the number of lines printed
- [x] 1.3 Abort the gate on exit 2, naming the path. A bad path is the gate's own
  error, never a finding count
- [x] 1.4 Return zero when `git show` fails, which is the case for a path the
  range adds. Do not lint an absent file, since that path exits 2
- [x] 1.5 Delete each temp file after the count, through the existing `trap`

## 2. The ratchet

- [x] 2.0 Move the lint loop inside the range loop. The gate today flattens every
  range into one `sort -u` path list, which discards the range a path came from
- [x] 2.1 For each `(range, path)` pair, split the range on `..`. Compute the base
  count at `A` and the pushed count at `B`
- [x] 2.2 Reject the push only when the pushed count is above the base count
- [x] 2.3 Print the path, both counts, and the linter's findings for the pushed
  version, matching how `silent-green.sh` prints both counts
- [x] 2.4 Keep the rule name `changed-markdown-prose` unchanged, so `CLAUDE.md`
  and the hook's output stay accurate
- [x] 2.5 Keep the absent-linter skip and its message exactly as they are
- [x] 2.6 Keep the no-Markdown-changed message exactly as it is
- [x] 2.7 Track the paths that rose across every range, so one push reports every
  offending file rather than the first
- [x] 2.8 Check a path that appears in two ranges against each base. It fails the
  push when it rises in either one

## 3. Proof

- [x] 3.1 Create a scratch branch, so the shared worktree keeps no mutation
- [x] 3.2 Prove the ratchet blocks an increase. Add one over-length sentence to a
  spec that already carries findings. Show the rejection naming both counts,
  then revert
- [x] 3.3 Prove pre-existing findings pass. Change a line in such a spec without
  adding a finding. Show the gate passes, then revert
- [x] 3.4 Prove a repair passes. Delete a finding from such a spec. Show the gate
  passes on the lower count, then revert
- [x] 3.5 Prove a new file must lint clean. Add a Markdown file with one finding.
  Show the rejection against a base count of zero, then revert
- [x] 3.6 Prove the deleted-path case. Delete a Markdown file the range also
  changed. Show the gate skips it, rather than failing
- [x] 3.7 Prove the absent-linter skip still works, with `ANTISLOP` pointing
  nowhere
- [x] 3.7a Prove the gate reads the tip, not the worktree. Commit a clean file,
  then add a finding to it without committing. Show the gate passes
- [x] 3.7b Prove the multi-range case. Feed two ranges with different bases, and
  show the gate checks each file against its own base
- [x] 3.8 Re-prove the case that motivated this change. Replay the
  `development-toolchain` sync shape, a file with pre-existing findings gaining
  new ones. Show the gate reports only the increase
- [x] 3.9 Delete the scratch branch and confirm the working tree is clean

## 4. Documentation

- [x] 4.1 Change the `changed-markdown-prose` row in `CLAUDE.md`'s enforced-rules
  table to say the gate rejects a rising finding count
- [x] 4.2 State the norm in that section: clear a touched file's debt when it is
  cheap. Name it as advisory, and the ratchet as the mechanical floor
- [x] 4.3 Record the current debt: 3166 findings across 52 of 80 live specs. A
  later reader then knows what the ratchet permits, and why
- [x] 4.4 Write the norm against a blanket `allow-file` directive into `CLAUDE.md`.
  No such norm exists in the repository today. Name the targeted form as the
  wanted one. Say that a directive lowers the count, so the gate permits it
- [x] 4.5 Cite `bbf37d1` in that norm. It put a six-rule `allow-file` line at the
  top of `CLAUDE.md`, which reports 0 findings with it and 45 without

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer and report what it printed
- [x] 5.2 Run the full `bun test` in the devcontainer, with `DATABASE_URL` set.
  Report the pass, fail and skip counts
- [x] 5.3 Run the antislop linter over every Markdown file this change touched
- [x] 5.4 Run the whole hook end to end, and report what each stage printed
- [x] 5.5 Measure the added cost on a real push. Record it in `design.md`
