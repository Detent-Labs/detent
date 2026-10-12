# Spec Delta

## MODIFIED Requirements

### Requirement: The lockfile matches the manifests

A gate SHALL run `bun install --frozen-lockfile` in the devcontainer. A manifest
change without a matching committed lockfile SHALL block the push.

The hosted CI workflow SHALL run that gate as the `check` job's first install,
before any step that reads the lockfile. The `e2e` job SHALL install with
`--frozen-lockfile` too. No CI step SHALL run an install that may rewrite
`bun.lock` ahead of the gate. A plain `bun install` re-resolves the manifests
and writes the lockfile it then judges, so the gate passes on drift it
caused to vanish. Dependabot PR #19 and PR #63 each changed a manifest and left
`bun.lock` alone. Both went green and merged, and a later commit repaired the
lockfile.

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

#### Scenario: CI judges the committed lockfile

- **WHEN** a pull request changes a dependency version in a `package.json`
- **AND** leaves `bun.lock` as it was
- **THEN** the `check` job fails at its first install and names the lockfile rule
- **AND** no earlier step has rewritten `bun.lock`

#### Scenario: The audit reads the committed lockfile

- **WHEN** the `check` job reaches `bun audit`
- **THEN** the lockfile it reads is the committed one, because the install before it was frozen

### Requirement: The suite cannot report a silent green

A gate SHALL refuse a suite run that names no database. It SHALL also read the
run's skip count and count a todo test as a skip. A count above the floor the
repository records SHALL block the push.

The gate SHALL refuse a run whose summary it cannot read. Four cases block
the push. The run prints no `pass` line, or no `Ran N tests` line. The counts do
not add up to N. Count lines follow the last `Ran` line. A renamed summary line
would otherwise read as zero skips.

The gate SHALL also refuse a run that passes fewer tests than a second recorded
floor. A run of far fewer tests than the suite holds proves less than it looks.

The pass count alone is not evidence. The DB-backed suites are `test.skipIf(!DB)`
at hundreds of sites. They are most of the suite. A run without `DATABASE_URL`
skips all of them. It then prints a green that looks genuine. `CLAUDE.md` states
this twice, in bold, which measures how easily it recurs.

Both floors SHALL live in tracked files beside the gate. A change that
legitimately adds a skipped test SHALL raise the skip floor in the same commit.
A change that legitimately removes tests SHALL lower the pass floor in the same
commit. The floor then moves in a reviewable line rather than a silent drift.

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

#### Scenario: A todo test counts as a skip

- **WHEN** a run reports one skipped test at the floor and one todo test
- **THEN** the gate rejects the push and names the sum of both

#### Scenario: A summary the gate cannot read blocks the push

- **WHEN** a captured run prints no `pass` line or no `Ran N tests` line
- **OR** its counts do not add up to N
- **OR** count lines follow its last `Ran` line
- **THEN** the gate rejects the push and says it cannot read the summary

#### Scenario: A shrunken run blocks the push

- **WHEN** a run passes fewer tests than the recorded pass floor
- **THEN** the gate rejects the push and names both counts

#### Scenario: A legitimate removal lowers the pass floor

- **WHEN** a change deletes tests on purpose
- **THEN** that change lowers the pass floor in the same commit

### Requirement: No tracked file carries an absolute home-directory path

A gate SHALL reject a tracked file that holds an absolute path into a user's home
directory, on any platform. It SHALL match each of these spellings. The Windows
drive form, in either letter case. That form takes forward slashes, single
backslashes or the doubled backslashes of a JSON string. The Git Bash and WSL
form, where the drive letter stands in a leading path segment. The macOS
`/Users/<name>` form. The Linux `/home/<name>` form.

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

#### Scenario: A Git Bash path blocks the push

- **WHEN** a tracked file holds `/<drive letter>/Users/<name>`
- **THEN** the gate rejects the push and names the file

#### Scenario: A macOS path blocks the push

- **WHEN** a tracked file holds `/Users/<name>` at the start of a path
- **THEN** the gate rejects the push and names the file

#### Scenario: A lowercase drive path blocks the push

- **WHEN** a tracked file holds a drive path whose `users` directory is lowercase
- **THEN** the gate rejects the push and names the file

#### Scenario: A JSON-escaped Windows path blocks the push

- **WHEN** a tracked file holds a Windows home path with each backslash doubled
- **THEN** the gate rejects the push and names the file

## ADDED Requirements

### Requirement: A range git cannot read stops the gates

A gate that reads a pushed range SHALL stop with exit status 1 when git cannot
diff that range. It SHALL print git's own message and name the range. It SHALL
NOT report that nothing needs checking.

#### Scenario: A range git cannot diff stops the whitespace gate

- **WHEN** the whitespace gate reads a range whose base git cannot resolve
- **THEN** it exits 1, names the range and prints git's message
- **AND** it does not print that the push changes no text file

#### Scenario: A range git cannot diff stops the prose gate

- **WHEN** the prose gate reads a range whose base git cannot resolve
- **THEN** it exits 1, names the range and prints git's message
- **AND** it does not print that the push changes no Markdown

### Requirement: The range printer falls back past a missing remote sha

The range printer SHALL check that the remote sha of a pushed ref exists in the
clone. A missing sha SHALL fall back to the range since `origin/main`, as a new
branch does. The printer SHALL name the missing sha on stderr.

The case is routine. A force-push over a remote state the clone never fetched
hits it. So does a push after a history rewrite. In CI every force-push hits
it, because the previous sha is gone.

#### Scenario: A missing remote sha falls back to the range since main

- **WHEN** the range printer reads a pushed ref whose remote sha the clone does not hold
- **THEN** it prints the range from the merge base with `origin/main` to the local sha
- **AND** it names the missing sha on stderr

#### Scenario: A reachable remote sha keeps its own range

- **WHEN** the remote sha of a pushed ref exists in the clone
- **THEN** the printer prints the range from that sha to the local sha
