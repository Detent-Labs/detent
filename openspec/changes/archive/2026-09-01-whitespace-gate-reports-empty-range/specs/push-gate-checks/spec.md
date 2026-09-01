## MODIFIED Requirements

### Requirement: A gate names the rule it enforces

A gate that rejects a push SHALL print three things. It prints the rule name, the
files that broke the rule, and the command that repairs them. A contributor SHALL
NOT have to read the gate's source to learn what it wants.

The reason is the repair loop. A gate that prints only a non-zero exit sends the
contributor to the script. A gate that names its rule sends them to the file.

Two of those lines carry the same wording in every gate. The rejection header
names the rule, and the bypass note names `--no-verify`. Both SHALL come from
one shared library that every gate sources. A gate SHALL NOT write either line
itself.

The reason is drift. Before this rule the header stood in 9 copies and the
bypass note in 8. Both are text a contributor reads, so a copy that fell
behind would teach the wrong thing. The findings and the repair command stay
per gate, because they differ per gate.

A gate that reads ranges on stdin needs a range. Documentation and examples that
show a hand run SHALL pipe `scripts/gates/range.sh` into that gate. They SHALL
NOT hand the gate an empty stdin. The fallback in `range.sh` reaches
`origin/main..HEAD` on a hand run. That fallback holds the hand run to the same
commits the push sends.

#### Scenario: A rejected push names its rule

- **WHEN** a gate rejects a push
- **THEN** its output carries the rule name, every file that broke the rule, and
  the repair command

#### Scenario: A passing gate stays quiet

- **WHEN** every gate passes
- **THEN** the push proceeds, and no gate prints a finding

#### Scenario: The shared wording has one source

- **WHEN** a developer reads any of the gate scripts
- **THEN** it sources the shared library and calls its two helpers for the
  header and the bypass note
- **AND** neither line appears as a literal in the gate itself

#### Scenario: A gate still runs alone

- **WHEN** a contributor runs one gate by hand while repairing it, for example
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`
- **THEN** that gate finds the shared library through a path relative to its
  own location
- **AND** it runs as it does under the hook

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

The gate SHALL print a line naming itself when the range leaves it no file to
check. It SHALL exit 0 there, because a push that sends no text file is
legitimate. A branch deletion is one such push. Silence would read as a pass, and
a contributor who piped nothing in would trust a check that never ran.

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

#### Scenario: A push that touches no text file reports nothing to check

- **WHEN** the gate reads an empty range list, or a range that changes no file
- **THEN** it prints a line naming its rule and saying it checked nothing
- **AND** the push proceeds
