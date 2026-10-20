# Spec Delta

## MODIFIED Requirements

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
this as a bold rule of its own, because it recurs.

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
