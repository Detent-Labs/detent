# Design

## Context

See `proposal.md` for why. The facts below come from runs on 2026-10-11 at
`origin/main` 64c08161, in this worktree's devcontainer and on the host.

`bun test` v1.3.11 prints its summary as indented lines, then one `Ran` line.
A run with one passing, one skipped and one todo test prints this:

```
 1 pass
 1 skip
 1 todo
 0 fail
Ran 3 tests across 1 file. [11.00ms]
```

The total on the `Ran` line equals the sum of the four counts. The gate reads the
skip line alone, so that run passes at a floor of 1. Bun prints no skip line
when nothing skips.

- `bun run check` printed two summaries on a green tree: 5206 pass, 1 skip,
  0 fail, `Ran 5207 tests across 269 files`, then 20 pass in `test:tz`.
- `git diff --check` exits 2 on a whitespace finding. It exits 128 when the
  range names a revision git does not hold. On the host, `whitespace.sh` and
  `prose.sh` both exit 0 on such a range, and `range.sh` prints it unchecked.
- The devcontainer has git 2.56. `/workspace` is not a usable repository there,
  because a linked worktree's `.git` points outside the mount. A test can still
  build its own repository under a temp directory.
- Bun 1.3.11 has `Bun.YAML.parse`, so a test can read the workflow file as data.
- GitHub's Dependabot reference lists `bun` as a supported ecosystem for
  version and security updates, from Bun 1.1.39. The devcontainer pins 1.3.11.
- The tag `v7` of `actions/checkout` resolves to
  3d3c42e5aac5ba805825da76410c181273ba90b1, which is also v7.0.1.
- The tag `v7` of `actions/upload-artifact` resolves to
  cf430e030ddbb5b0abf93d22962f4752f3646cd9, which is also v7.0.2.
- The widened home-path pattern of D6 matches nothing in the tracked tree. The
  audit record holds the regex text for the macOS form. That text has `[` after
  the slash. The pattern needs a name character there, so it does not match.

## Goals / Non-Goals

**Goals:**

- Every gate in the brief refuses the input that used to pass, proved by a test
  that feeds that input.
- No gate gets weaker. Each change adds a reject path or widens a match.

**Non-Goals:**

- `lockfile.sh` keeps reading the worktree. A regenerated but uncommitted
  `bun.lock` still passes the pre-push hook. CI reads the commit, so it now
  catches that case after the push.
- No change to branch protection or to which checks GitHub requires.
- The role `detent_audit_probe` stays in the cluster after a run. Only its
  password changes per run.
- `--no-verify` stays a bypass. The gate table in `CLAUDE.md` already says so.

## Decisions

**D1. The install is the gate (G-1).** The `check` job replaces its plain
`bun install` step with `sh scripts/gates/lockfile.sh`, named `frozen-lockfile`
and placed first. `bun audit`, `bun run check` and `no-silent-green` follow. The
later `frozen-lockfile` step goes, since the first one is the same command.

The gate is a frozen install, so `node_modules` comes from it too. A drift
prints the gate's own rejection and the install output. The `e2e` job has no
gate step, so it runs `bun install --frozen-lockfile` directly.

*Alternative:* swap `bun install` for `bun install --frozen-lockfile` and keep
the later gate step. That runs the same install twice and reports a drift as a
bare Bun message. Rejected.

**D2. A missing remote sha falls back to the range since main (G-2).** The
owner ruled on 2026-10-11. For a real remote sha, `range.sh` checks
`git cat-file -e <sha>^{commit}`. When the sha is missing, `range.sh` prints
`merge-base(local, origin/main)..local`, the same range a new branch gets. It
names the missing sha on stderr. A clone without `origin/main` falls to the
empty tree, as a new branch already does.

The fallback over-checks commits the remote already holds. It never under-checks.
A fallback range inside main is empty, and the gates then say they have nothing
to check. That is correct for a branch main already contains.

*Alternative:* exit 1 and ask for a fetch. Locally that costs one `git fetch`.
In CI a rerun cannot help, because the previous sha stays unreachable. Every
force-push of a PR branch would stay red until the next push. Rejected by the
owner.

**D3. A failed diff stops the gate (G-2).** Both gates stop swallowing git's
exit code. `whitespace.sh` reads the status of `git diff --check`. Status 0, 1
and 2 are normal, and 2 is a finding. Any other status calls `bad_range`. The
`--name-only` diff gets the same check.

`prose.sh` ran its diff inside a pipeline, where a shell reads only the last
command's status. It now writes the diff to a temp file and loops over the file.
`bad_range` lives in `_lib.sh` beside `reject`. It prints the rule, the range and
git's stderr, then exits 1. Both gates share it, so the wording cannot drift.

**D4. Dependabot gets the bun ecosystem (G-6).** The three `npm` entries become
`bun` entries with the same directories and schedule. The `github-actions` entry
stays. A test reads the file and rejects any `npm` entry.

Whether the `bun` ecosystem updates the root `bun.lock` for a workspace member
directory cannot be proven offline. The first Dependabot run after the merge
shows it. If it does not, D1 makes the bump fail CI loudly. The drift no longer
stays green, and that was the harm.

**D5. The silent-green gate reads the whole summary (G-7).** One `awk` pass over
the captured run does four jobs.

- It adds `skip` and `todo` lines into one skip count.
- It tracks the largest `pass` count across summaries. `bun run check` prints
  two, and a hand run prints one.
- For each `Ran N tests` line it checks that the counts since the previous
  `Ran` line add up to N. A renamed line breaks the sum, so the gate rejects
  it instead of reading zero skips.
- It counts the `Ran` lines. The gate rejects a run with none, or with no
  `pass` line, as unreadable.

A new tracked file `scripts/gates/pass-floor.txt` holds the pass floor in the
format of `skip-floor.txt`: the last bare integer wins. It starts at 5206, the
count measured at 64c08161. A deletion of tests lowers it in the same commit. A
growing suite leaves it stale-low, which only loosens the margin.

*Alternative:* demand exactly two summaries. A hand run through
`test-gated.sh` has one, so that rule would reject it. The sum check and the
floor cover the same ground.

A subset run through `test-gated.sh` now fails the pass floor. The spec calls
that runner the full-suite check. A subset run uses `bun test <path>` directly.

**D6. The home-path pattern spells out the four forms (G-8).** The pattern
stays case-sensitive. The drive forms spell `Users` as `[Uu][Ss][Ee][Rr][Ss]`.
The macOS form keeps `Users` exact. Lowercase `/users/` appears in routes, so a
case-insensitive macOS match would flag them.

```
[A-Za-z]:[\\/]{1,2}[Uu][Ss][Ee][Rr][Ss][\\/]{1,2}[A-Za-z0-9_]+
/[A-Za-z]/[Uu][Ss][Ee][Rr][Ss]/[A-Za-z0-9_]+
(^|[^A-Za-z0-9_.])/Users/[A-Za-z0-9_]+
/home/[a-z][a-z0-9_-]*/
```

The first covers a drive path in either case, with slashes, backslashes or the
doubled backslashes of JSON. The second covers Git Bash and WSL, where the drive
letter is a path segment. The third covers macOS. The fourth is the existing
Linux form. The container-user denylist stays as it is.

The coordinator's note on `reports/G.md:101` asked for an exemption if the
widened script matched the audit record. It does not match, so the script gets
no exemption. A name character must follow `Users/`, and the record's regex
text has `[` there. A new test pins this: the line from the record raises no
finding.

**D7. The workflow gets least privilege and pinned actions (G-11).**
`permissions: contents: read` goes at workflow level. Every `actions/checkout`
step gets `persist-credentials: false`. No step after a checkout needs the
token, because the host gates run only local git commands. Both actions pin to
the shas above, each with a `# v7.0.x` comment. The `github-actions` entry in
`dependabot.yml` already bumps SHA pins together with that comment.

A test parses the workflow with `Bun.YAML.parse` and rejects a missing
`permissions` block, a checkout without `persist-credentials: false`, a `uses`
reference that is not a 40-character sha, and a plain `bun install`.

**D8. The probe role gets a random password per run (G-12).** The preload
creates the role without a password. It then runs `ALTER ROLE ... LOGIN PASSWORD`
with `crypto.randomUUID()` and stores the value in
`DETENT_AUDIT_PROBE_PASSWORD`. The privileges test reads that variable, and
skips when it is unset. A maintenance role without `CREATEROLE` fails the
`ALTER`, the variable stays unset, and the suite skips as it does today.

*Alternative:* `NOLOGIN` plus `SET ROLE` from the test connection. A superuser
session passes every `SET ROLE` membership check, so test 5.12 would pass
without proving anything. Rejected.

One new test connects with the retired password `probe` and expects the server
to refuse.

**D9. Tests build their own repositories.** `bun test` runs in the devcontainer,
where `/workspace` is not a repository. Each gate test creates a temp
repository with `git init`. It commits with `-c user.name=... -c user.email=...`
and points `origin/main` at a commit with `git update-ref`. The gate runs with
that directory as its working directory.

The home-path fixtures come from parts at run time. The test file then has no
literal path that the gate would reject.

The existing runner tests print a fake run. They gain summary lines that add up
and sit above the pass floor, since the gate now reads them.

**D10. The runner keeps a failing command's exit code.** `test-gated.sh` sets its
exit status to 1 whenever the gate rejects. A crashed Bun that printed no
summary would now hide its own code, such as 132. The runner sets 1 only when the
command itself exited 0.

## Risks / Trade-offs

- [The Dependabot switch may not touch `bun.lock` for a workspace layout] →
  D1 turns the silent drift into a red check. The report says so, and the first
  Dependabot run settles it.
- [A subset run through the runner fails the floor] → The runner's header says
  to run the full suite.
- [Two lanes can conflict on a floor change] → The conflict is one line and
  mechanical. The gate's message names the file.
- [`ALTER ROLE ... PASSWORD` can reach the server log when `log_statement` is on]
  → The compose database does not set it. The value stops working at the next run.
- [A SHA pin ages] → Dependabot bumps it with the comment, as it bumps a tag.
- [A force-push to `main` in CI gets an empty fallback range] → Branch
  protection owns that case. The gate reports that it checked nothing.
- [A frozen install fails the `check` job before `bun audit` runs] → Intended.
  A stale lockfile makes the audit meaningless.

## Migration Plan

No deployment exists, so the change lands in one merge. The work runs in this
order. The gate scripts and their tests come first. The workflow and Dependabot
files follow, then the preload, then the prose that names the gates.

After the push, read the CI log of the `check` job. The `frozen-lockfile` step
must run before `bun audit`. The merge does not need a migration. A revert
restores every file.

## Open Questions

None that change the specs or the tasks. Only a Dependabot run after the merge
can verify the Dependabot behavior. The report records it as unproven until then.
