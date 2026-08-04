## Purpose

Defines the mechanical detectors the push gate runs beside the typecheck and the
suite. Each detector covers a defect class this repository produced more than
once. Without them, a person has to remember to check.

## Requirements

### Requirement: A gate names the rule it enforces

A gate that rejects a push SHALL print three things. It prints the rule name, the
files that broke the rule, and the command that repairs them. A contributor SHALL
NOT have to read the gate's source to learn what it wants.

The reason is the repair loop. A gate that prints only a non-zero exit sends the
contributor to the script. A gate that names its rule sends them to the file.

#### Scenario: A rejected push names its rule

- **WHEN** a gate rejects a push
- **THEN** its output carries the rule name, every file that broke the rule, and
  the repair command

#### Scenario: A passing gate stays quiet

- **WHEN** every gate passes
- **THEN** the push proceeds, and no gate prints a finding

### Requirement: A gate arrives green

Every gate SHALL pass on the tree of the change that adds it. A gate that lands
red reports a backlog rather than a regression.

The consequence follows from measurement. The hook has one bypass, `--no-verify`.
That flag disables every gate at once. A gate a contributor cannot pass therefore
costs every other gate.

Some classes already have violations in the tree. There the gate SHALL narrow its
scope until it passes. The change SHALL record what the narrowing leaves out.

#### Scenario: A new gate passes on the tree that adds it

- **WHEN** a change adds a gate
- **THEN** that gate passes at that commit, with no violation to repair first

#### Scenario: A pre-existing violation narrows the scope

- **WHEN** a defect class already has violations in tracked files
- **THEN** the gate reads a narrower scope that passes
- **AND** the change records what that scope leaves out

### Requirement: A gate that needs no container runs on the host

A gate that needs only git and a shell SHALL run on the host. It runs before the
hook starts the container checks. A gate that needs Bun SHALL run inside the
devcontainer, through the `docker compose exec` the hook already uses.

Host placement buys two things. A contributor with a stopped container still gets
those findings. The checks that cost milliseconds run before the ones that cost
minutes.

A gate SHALL NOT fall back to the host when it needs the container. The push-gate
requirement in `development-toolchain` already forbids that fallback, for the
typecheck and the suite, for this reason.

#### Scenario: A stopped container still reports the host gates

- **WHEN** a contributor pushes while the devcontainer is down
- **THEN** the host gates run and report their findings
- **AND** the preflight then refuses the push for the container checks

#### Scenario: A container gate does not degrade to the host

- **WHEN** a gate needs Bun and the container is unavailable
- **THEN** the push stops
- **AND** that gate does not run against a host Bun

### Requirement: The lockfile matches the manifests

A gate SHALL run `bun install --frozen-lockfile` in the devcontainer. A manifest
change without a matching committed lockfile SHALL block the push.

`add-ci-and-dependency-hygiene` made this the first CI step. A stale lockfile is a
red build. Commit 4ff4382 replaced that workflow with the pre-push hook. It
carried the step over nowhere. This requirement restores it at the placement that
now gates pushes.

The check also covers the declaration rule `development-toolchain` states. A
runtime import belongs in its own package's manifest. A frozen install proves the
committed lockfile agrees with every manifest.

#### Scenario: An uncommitted manifest change blocks the push

- **WHEN** a contributor changes a `package.json` dependency
- **AND** pushes without regenerating `bun.lock`
- **THEN** the frozen install fails, and the gate names the lockfile rule

#### Scenario: A matching lockfile passes

- **WHEN** the committed `bun.lock` agrees with every manifest
- **THEN** the frozen install succeeds and the push proceeds

### Requirement: The suite cannot report a silent green

A gate SHALL refuse a suite run that names no database. It SHALL also read the
run's skip count. A count above the floor the repository records SHALL block the
push.

The pass count alone is not evidence. The DB-backed suites are `test.skipIf(!DB)`
at hundreds of sites. They are most of the suite. A run without `DATABASE_URL`
skips all of them. It then prints a green that looks genuine. `CLAUDE.md` states
this twice, in bold, which measures how easily it recurs.

The floor SHALL live in a tracked file beside the gate. A change that legitimately
adds a skipped test SHALL raise the floor in the same commit. The increase is then
a reviewable line rather than a silent drift.

#### Scenario: A run without a database blocks the push

- **WHEN** the suite runs with `DATABASE_URL` unset
- **THEN** the gate rejects the push and names the silent-green rule
- **AND** it does not read the pass count as evidence

#### Scenario: A rising skip count blocks the push

- **WHEN** a run skips more tests than the recorded floor allows
- **THEN** the gate rejects the push and names both counts

#### Scenario: A legitimate new skip raises the floor

- **WHEN** a change adds a test that skips by design
- **THEN** that change raises the recorded floor in the same commit

### Requirement: Pushed text carries no CR byte and no stray whitespace

A gate SHALL read the commit range the push sends. It SHALL reject three things in
each text file that range adds or changes. Those are a CR byte, a trailing space,
and a blank line at end of file.

The range scope is load-bearing. 1312 tracked files carry CRLF today. A tree-wide
check would land red and cost the other gates. The range scope holds new work to
the rule. It demands no repair of the tree first.

`git diff --check` covers the trailing space and the blank line at end of file. It
does not report CRLF in this repository. `.gitattributes` sets `* text=auto
eol=lf`, so git normalizes the worktree file on `git add`. The gate therefore
SHALL read the worktree bytes for the CR check. It SHALL NOT rely on the diff
alone. `CLAUDE.md` records this trap.

#### Scenario: A new CRLF file blocks the push

- **WHEN** the pushed range adds a text file with CRLF line endings
- **THEN** the gate rejects the push and names the file
- **AND** it names the whitespace rule

#### Scenario: An untouched CRLF file does not block the push

- **WHEN** the pushed range touches none of the files that already carry CRLF
- **THEN** those files raise no finding

#### Scenario: A trailing space blocks the push

- **WHEN** the pushed range adds a line with a trailing space
- **THEN** the gate rejects the push and names the line

### Requirement: Changed Markdown passes the prose linter

A gate SHALL run the antislop linter over every Markdown file the pushed range
adds or changes. It SHALL run the linter twice per file. The first run reads the
file's content at the range's base commit. The second reads its content at the
range's tip. A tip count above the base count SHALL block the push.

Both sides SHALL read committed content. A push ships commits, and a worktree
can hold edits the push does not send.

A count that stays level SHALL NOT block the push, whatever its value. A count
that falls SHALL NOT block it either.

A file with no content at the base commit has a base count of zero. A file the
push adds SHALL therefore lint clean. A file the range deleted has no content at
the tip, so the gate SHALL skip it.

A renamed file SHALL keep its baseline. The gate SHALL read the base count at
the file's old path. Reading it at the new path would return zero and make every
pre-existing finding read as new. Archiving a change renames every artifact in
it, so this is a routine case rather than an edge one.

A bad path makes the linter exit 2, which is not a finding. The gate SHALL
distinguish the two. It SHALL NOT read a failed lint as a finding count. A base
of one instead of zero would let a new file carry a finding through.

The gate SHALL print both counts when it blocks a push. It SHALL also print the
findings the linter reports for the pushed version.

`CLAUDE.md` already requires this check on every Markdown file a change touches. A
person runs it today. Commit 78f4964 records a delta that shipped without it.

A whole-file check does not survive contact with this repository. The live specs
under `openspec/specs/` hold 3166 findings across 52 of 80 files. None of them
carries an `allow-file` directive. A whole-file gate makes every one of those
files unpushable until somebody clears its debt in full.

That happened on 2026-08-04. A change synced one requirement into
`development-toolchain/spec.md` and paid a 28-finding prose rewrite. All 28
findings predated it.

The ratchet is the mechanical floor, not the whole rule. Clearing a touched
file's debt stays the norm where it is cheap, and `CLAUDE.md` states it. The
gate blocks a file getting worse. It does not demand that a file get better.

The linter sits outside this repository. Its path differs per machine. The
devcontainer does not carry it. The gate SHALL print a skip when it cannot find
the linter. That skip names the linter and the path the gate looked in. The push
then proceeds.

That skip is deliberate. On a clone without the tool, a gate that rejected the
push would leave `--no-verify` as the only way through. That flag disables every
gate. A named skip costs one check. A bypassed hook costs every check.

#### Scenario: A new finding blocks the push

- **WHEN** the pushed range raises a Markdown file's finding count above its
  count at the base commit
- **THEN** the gate rejects the push and prints both counts
- **AND** it prints the findings the linter reports for the pushed version

#### Scenario: Pre-existing findings do not block the push

- **WHEN** the pushed range changes a Markdown file that already carries
  findings
- **AND** the count does not rise
- **THEN** the gate raises no finding and the push proceeds

#### Scenario: A push of two branches checks each against its own base

- **WHEN** one push sends two refs, so the gate reads two ranges
- **THEN** the gate checks each changed file against the base of its own range
- **AND** a file that rises in either range blocks the push

#### Scenario: A repaired file passes

- **WHEN** the pushed range lowers a Markdown file's finding count
- **THEN** the gate raises no finding and the push proceeds

#### Scenario: A renamed file keeps its baseline

- **WHEN** the pushed range renames a Markdown file that carries findings
- **THEN** the gate reads the base count at the old path
- **AND** the push proceeds, since the count did not rise

#### Scenario: A rename that also adds a finding blocks the push

- **WHEN** the pushed range renames such a file and adds a finding to it
- **THEN** the gate rejects the push, naming both paths

#### Scenario: A newly added file must lint clean

- **WHEN** the pushed range adds a Markdown file that the linter rejects
- **THEN** the gate rejects the push, because the base count is zero

#### Scenario: An absent linter skips loudly

- **WHEN** the gate cannot find the linter
- **THEN** it prints a skip naming the linter and the path it looked in
- **AND** the push proceeds

#### Scenario: A push that touches no Markdown runs no linter

- **WHEN** the pushed range changes no Markdown file
- **THEN** the gate reports nothing to check and the push proceeds
### Requirement: No tracked file carries an absolute home-directory path

A gate SHALL reject a tracked file that holds an absolute path into a user's home
directory, on any platform.

Commit e152f9c removed two such paths. One sat in a skill file and carried the
Windows account name. The other sat in thirteen shell examples in a plan document.
A path of that shape works on one machine and on no other. It also discloses the
account name to everyone who clones the repository.

The gate SHALL read tracked files only. Untracked local state and ignored files
carry machine paths by design.

Some tracked paths describe a container filesystem rather than a contributor's
machine. `.devcontainer/devcontainer.json` mounts a volume at `/home/node/.claude`.
The gate SHALL exclude those paths, and the change SHALL name each exclusion.
Without the exclusion this gate lands red, which the arrives-green requirement
forbids.

#### Scenario: A container filesystem path raises no finding

- **WHEN** a tracked file under an excluded path names a container home directory
- **THEN** the gate raises no finding, and the push proceeds

#### Scenario: A committed machine path blocks the push

- **WHEN** the pushed range adds a tracked file holding a home-directory path
- **THEN** the gate rejects the push and names the file and line
- **AND** it names the machine-path rule

#### Scenario: An ignored file carries a machine path freely

- **WHEN** an untracked or ignored file holds a home-directory path
- **THEN** the gate raises no finding
