## MODIFIED Requirements

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
