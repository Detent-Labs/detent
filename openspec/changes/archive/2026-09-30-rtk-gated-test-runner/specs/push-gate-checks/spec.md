## ADDED Requirements

### Requirement: A hand run applies the silent-green check in the same call

The repository SHALL ship a runner script for a hand run of the suite. The
runner SHALL run the command it receives and print that command's full output.
It SHALL then apply the silent-green check to that output.

The runner SHALL exit with the command's own exit code when the check passes.
It SHALL exit non-zero when the check rejects the run, even if the command
passed.

The reason is output filters. A filter such as `rtk test` drops the line that
names the database, so the check cannot read the filtered text. The runner
applies the check before any filter sees the output.

#### Scenario: A green run with a database passes

- **WHEN** a contributor runs the runner with the full suite and `DATABASE_URL`
  set, and every test passes
- **THEN** the runner prints the suite output and exits 0

#### Scenario: A run without a database fails

- **WHEN** a contributor runs the runner with the full suite and `DATABASE_URL`
  unset
- **THEN** the runner prints the silent-green rejection
- **AND** it exits non-zero although no test failed

#### Scenario: A red run keeps its own exit code

- **WHEN** the suite reports a failing test and names its database
- **THEN** the runner exits with the suite's non-zero code
