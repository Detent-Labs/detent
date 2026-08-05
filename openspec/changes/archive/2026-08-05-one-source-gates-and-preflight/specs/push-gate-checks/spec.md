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
  `sh scripts/gates/whitespace.sh < /dev/null`
- **THEN** that gate finds the shared library through a path relative to its
  own location
- **AND** it runs as it does under the hook
