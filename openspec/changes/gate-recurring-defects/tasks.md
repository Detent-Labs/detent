## 1. Shared range helper

- [x] 1.1 Add `scripts/gates/range.sh`. It reads pre-push stdin lines and prints one
  commit range per pushed ref
- [x] 1.2 Handle a real remote sha: print `<remote>..<local>`
- [x] 1.3 Handle an all-zero remote sha (new branch): print the merge-base with
  `origin/main`, or the empty-tree hash when they share no commit. Emit `A..B`
  in every case, since `git diff` takes endpoints and not rev-list syntax
- [x] 1.4 Skip an all-zero local sha (branch deletion), printing nothing
- [x] 1.5 Fall back to `origin/main..HEAD` when stdin is empty, for a by-hand run
- [x] 1.6 Exit non-zero on a line that parses as none of those, rather than printing
  an empty range

## 2. Gate scripts

- [x] 2.1 Add `scripts/gates/lockfile.sh`. Run `bun install --frozen-lockfile` in the
  devcontainer and name the lockfile rule when it fails
- [x] 2.2 Add `scripts/gates/silent-green.sh`. Take a captured `bun run check` output
  path as its argument
- [x] 2.3 In `silent-green.sh`, reject a run whose output carries
  `[test] DATABASE_URL unset`, or which carries no `[test] database:` line
- [x] 2.4 In `silent-green.sh`, parse ` N skip` from the summary and compare it
  against `scripts/gates/skip-floor.txt`, printing both counts when it rejects
- [x] 2.4a Read an absent skip line as zero. `bun test` prints no skip line when
  nothing skips. A bare grep then yields an empty string and misreports
- [x] 2.5 Add `scripts/gates/skip-floor.txt` holding the measured floor, with a
  comment naming what that floor covers
- [x] 2.6 Add `scripts/gates/whitespace.sh`. Run `git diff --check` over the range
- [x] 2.7 In `whitespace.sh`, read the CR rule from `git ls-files --eol` rather than a
  grep. MSYS grep opens a file in text mode and strips the CR, so `grep -lI 
- [x] 2.8 Add `scripts/gates/prose.sh`. Run the antislop linter over the Markdown
  files the range changed
- [x] 2.9 In `prose.sh`, resolve the linter from `ANTISLOP` first, then a
  `$HOME`-relative default. Print a named skip when it finds neither
- [x] 2.10 Add `scripts/gates/machine-paths.sh`. Reject a tracked file holding an
  absolute home-directory path
- [x] 2.10a Rewrite the container users `node` and `root` out of each matched line
  before re-applying the pattern, so a document quoting `/home/node/.claude` passes
  while a real machine path beside it still fails. Exclude `.gitignore` by path
- [x] 2.10b Confirm the scan reports zero matches, and that a replayed
  `C:/Users/<name>/...` path still trips it
- [x] 2.11 Give every gate the same rejection shape: the rule name, the offending
  files, and the repair command
- [x] 2.12 Confirm each script passes on the current tree, run alone

## 3. Hook wiring

- [x] 3.0 Move the ponytail-ledger gate from `.githooks/pre-push` into
  `scripts/gates/ponytail-ledger.sh`, unchanged, keeping its `ponytail:` comment
- [x] 3.1 Read stdin once in `.githooks/pre-push` and pass the range to the gates that
  need it
- [x] 3.2 Run the four host gates (ponytail ledger, whitespace, prose, machine paths)
  before the preflight, ledger first
- [x] 3.3 Drop the `exec` on the container step, so the suite gate can follow it
- [x] 3.4 Capture the `bun run check` output to a file with `> "$OUT" 2>&1` inside an
  `if`, then `cat` it. Use no pipe, so the gate needs no `pipefail`
- [x] 3.5 Run the lockfile gate before `bun run check`, and the silent-green gate after
  it against the captured output
- [x] 3.6 Keep the `preflight.sh core` step unchanged, and keep the ledger check
  first among the gates, as it runs today

## 4. Proof each gate rejects its defect

- [x] 4.1 Create a scratch branch for the proof runs, so the shared worktree keeps no
  mutation
- [x] 4.2 Prove the whitespace gate: commit a CRLF file, show the rejection, revert
- [x] 4.3 Prove the whitespace gate again with a trailing space, show it, revert
- [x] 4.4 Prove the machine-path gate: commit a file holding a home-directory path,
  show the rejection, revert
- [x] 4.5 Prove the prose gate: commit Markdown the linter rejects, show it, revert
- [x] 4.6 Prove the prose gate's skip: run it with `ANTISLOP` pointing nowhere, show
  the named skip and the zero exit
- [x] 4.7 Prove the lockfile gate: change a manifest dependency without regenerating
  `bun.lock`, show the rejection, revert
- [x] 4.8 Prove the silent-green gate: feed it a captured run that names no database,
  show the rejection
- [x] 4.9 Prove the silent-green gate again with a skip count above the floor, show
  both counts in the rejection
- [x] 4.10 Prove the moved ledger gate still rejects: drop a `ponytail:` marker file
  from the ledger, show the rejection, revert
- [x] 4.11 Delete the scratch branch and confirm the working tree is clean

## 5. Documentation

- [x] 5.1 Add a section to `CLAUDE.md` listing what the gates enforce mechanically
- [x] 5.2 State in that section that these rules need no re-litigation, and name the
  script that owns each one
- [x] 5.3 Record that `--no-verify` disables every gate at once
- [x] 5.4 Change the verification-gate list in `CLAUDE.md`, so the antislop and
  `git diff --check` items name their gates rather than reading as manual steps

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer and report what it printed
- [x] 6.2 Run the full `bun test` in the devcontainer with `DATABASE_URL` set, and
  report the pass, fail and skip counts
- [x] 6.3 Run the antislop linter over every Markdown file this change touched
- [x] 6.4 Run `git diff --check` and the worktree CR probe over the change
- [x] 6.5 Run the whole hook end to end on the scratch branch, and report each gate's
  line
\r'`
  reports nothing in Git Bash. A path the range deleted is absent from the listing
- [x] 2.8 Add `scripts/gates/prose.sh`. Run the antislop linter over the Markdown
  files the range changed
- [x] 2.9 In `prose.sh`, resolve the linter from `ANTISLOP` first, then a
  `$HOME`-relative default. Print a named skip when it finds neither
- [x] 2.10 Add `scripts/gates/machine-paths.sh`. Reject a tracked file holding an
  absolute home-directory path
- [x] 2.10a Exclude `.devcontainer/`, `docker/` and `.gitignore` from that scan.
  Each names a container filesystem or an ignored path by design
- [x] 2.10b Confirm the scan reports zero matches, and that a replayed
  `C:/Users/<name>/...` path still trips it
- [x] 2.11 Give every gate the same rejection shape: the rule name, the offending
  files, and the repair command
- [x] 2.12 Confirm each script passes on the current tree, run alone

## 3. Hook wiring

- [x] 3.0 Move the ponytail-ledger gate from `.githooks/pre-push` into
  `scripts/gates/ponytail-ledger.sh`, unchanged, keeping its `ponytail:` comment
- [x] 3.1 Read stdin once in `.githooks/pre-push` and pass the range to the gates that
  need it
- [x] 3.2 Run the four host gates (ponytail ledger, whitespace, prose, machine paths)
  before the preflight, ledger first
- [x] 3.3 Drop the `exec` on the container step, so the suite gate can follow it
- [x] 3.4 Capture the `bun run check` output to a file with `> "$OUT" 2>&1` inside an
  `if`, then `cat` it. Use no pipe, so the gate needs no `pipefail`
- [x] 3.5 Run the lockfile gate before `bun run check`, and the silent-green gate after
  it against the captured output
- [x] 3.6 Keep the `preflight.sh core` step unchanged, and keep the ledger check
  first among the gates, as it runs today

## 4. Proof each gate rejects its defect

- [x] 4.1 Create a scratch branch for the proof runs, so the shared worktree keeps no
  mutation
- [x] 4.2 Prove the whitespace gate: commit a CRLF file, show the rejection, revert
- [x] 4.3 Prove the whitespace gate again with a trailing space, show it, revert
- [x] 4.4 Prove the machine-path gate: commit a file holding a home-directory path,
  show the rejection, revert
- [x] 4.5 Prove the prose gate: commit Markdown the linter rejects, show it, revert
- [x] 4.6 Prove the prose gate's skip: run it with `ANTISLOP` pointing nowhere, show
  the named skip and the zero exit
- [x] 4.7 Prove the lockfile gate: change a manifest dependency without regenerating
  `bun.lock`, show the rejection, revert
- [x] 4.8 Prove the silent-green gate: feed it a captured run that names no database,
  show the rejection
- [x] 4.9 Prove the silent-green gate again with a skip count above the floor, show
  both counts in the rejection
- [x] 4.10 Prove the moved ledger gate still rejects: drop a `ponytail:` marker file
  from the ledger, show the rejection, revert
- [x] 4.11 Delete the scratch branch and confirm the working tree is clean

## 5. Documentation

- [x] 5.1 Add a section to `CLAUDE.md` listing what the gates enforce mechanically
- [x] 5.2 State in that section that these rules need no re-litigation, and name the
  script that owns each one
- [x] 5.3 Record that `--no-verify` disables every gate at once
- [x] 5.4 Change the verification-gate list in `CLAUDE.md`, so the antislop and
  `git diff --check` items name their gates rather than reading as manual steps

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer and report what it printed
- [x] 6.2 Run the full `bun test` in the devcontainer with `DATABASE_URL` set, and
  report the pass, fail and skip counts
- [x] 6.3 Run the antislop linter over every Markdown file this change touched
- [x] 6.4 Run `git diff --check` and the worktree CR probe over the change
- [x] 6.5 Run the whole hook end to end on the scratch branch, and report each gate's
  line
