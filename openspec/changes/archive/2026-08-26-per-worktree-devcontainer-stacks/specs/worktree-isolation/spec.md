## Purpose

Keeps concurrent work in several git worktrees from colliding. Each checkout
gets its own devcontainer stack rather than a share of one. Names what a
checkout derives, what the main checkout keeps, and how a collision surfaces.

## ADDED Requirements

### Requirement: A checkout derives its own devcontainer identity

The repository SHALL carry one script. It derives two values from the checkout
it runs in. Those are the Compose project name and the host ports. Every
caller in this repository that invokes `docker compose` SHALL read those
values from that script. No caller SHALL name a project or a port itself. A
caller sources the script and reads the values as environment variables.

One caller is exempt. The file `.devcontainer/devcontainer.json` names a
compose file and cannot source a script. VS Code's Reopen-in-Container path
therefore reaches the fallback project. The supported entry point is
`scripts/dev-up.sh`.

One declared fallback stands beside that rule. The compose file's own `name:`
attribute SHALL name the established project. The file MAY also carry an
established port as the default of a variable the derivation sets. Both serve
the caller that did not source the script. It lands on the established stack
rather than a stray one. Neither is a caller choosing a value for itself.

The script SHALL be sourceable by a POSIX shell. Two of its callers declare
`#!/bin/sh`.

The script SHALL ask git which kind of checkout it runs in. It SHALL NOT test
the filesystem for a `.git` directory. A linked worktree holds a `.git` file
rather than a directory, so that test answers false inside a real repository.

In a main checkout the script SHALL return the project name and the ports this
repository used before the change. A clone then behaves as it always has. A
hosted CI runner clones rather than adding a worktree, so it needs no knowledge
of this capability.

In a linked worktree the script SHALL return a project name and a port set of
its own. The worktree's absolute path alone determines both. The same worktree
therefore returns the same values on every run, and a bookmarked address stays
valid. That port set is the base ports plus one offset. The same offset applies
to all three, so a main checkout is the case where the offset is zero.

The path, rather than its last component, is what the derivation reads. This
repository holds worktrees under two parents. Two worktrees sharing a basename
under different parents SHALL derive different project names.

The project name SHALL satisfy what Compose accepts. Compose takes lowercase
letters, digits, hyphens and underscores. A directory name here routinely
carries capitals, so the script lowercases what it reads and replaces every
other character. The name must also start with a letter or a digit, which the
`detent-` prefix guarantees.

The script SHALL set every value from the checkout alone. A variable of the
same name already in the environment SHALL NOT survive the run.

The script runs under callers that stop on a non-zero exit. Where `git` is
absent, the script SHALL export the established identity. It SHALL do the same
where no repository surrounds the checkout. Neither case SHALL fail the caller.

#### Scenario: A main checkout keeps the established identity

- **WHEN** a caller sources the script in a main checkout
- **THEN** the script exports the project name and the base ports the
  repository used before the change

#### Scenario: A subdirectory of a main checkout

- **WHEN** a caller sources the script from a subdirectory of a main checkout
- **THEN** the script exports that same established identity

#### Scenario: A linked worktree derives its own identity

- **WHEN** a caller sources the script in a linked worktree
- **THEN** the script exports a project name and a port set distinct from the
  main checkout's

#### Scenario: A directory name carrying capitals

- **WHEN** a caller sources the script in a worktree whose directory name
  carries uppercase letters
- **THEN** the exported project name carries none, and Compose accepts it

#### Scenario: No repository answers

- **WHEN** a caller sources the script where `git` cannot report a checkout
- **THEN** the script exports the established identity
- **AND** the caller keeps running

#### Scenario: The derivation holds across a recreate

- **WHEN** a caller sources the script twice in one worktree, with a container
  recreate in between
- **THEN** both runs export the same project name and the same ports

#### Scenario: Two worktrees differ

- **WHEN** a caller sources the script in two worktrees the derivation maps to
  different offsets
- **THEN** the two exported port sets differ

#### Scenario: Two worktrees share a basename

- **WHEN** a caller sources the script in two worktrees carrying the same
  directory name under different parents
- **THEN** the two exported project names differ

### Requirement: A worktree's stack answers only that worktree

Each checkout's Compose project SHALL own its own application container,
database server, mail catcher and database volume. No two checkouts SHALL
share any of them.

A command a developer runs in one checkout SHALL reach that checkout's
containers, and no other checkout's. The application container SHALL bind-mount
the checkout its project belongs to. A command that compiles, builds or tests
therefore reads the files of the checkout the developer started it from.

Test-database isolation follows from that boundary. The test database keeps the
name `development-toolchain` specifies. The server holding it stays private to
the checkout. Two checkouts running the suite at once therefore cannot truncate
each other's tables.

#### Scenario: A command reads the checkout it ran in

- **WHEN** a developer runs a command that compiles or tests in a worktree
- **THEN** it reads that worktree's files, and a change only that worktree
  carries is visible to it

#### Scenario: Two suites run at once

- **WHEN** the test suite runs in two worktrees at the same time
- **THEN** each run's writes and truncations land in its own database server
- **AND** neither run observes the other's

### Requirement: A port collision fails loudly

Two worktrees MAY derive one port set. The derivation reads the checkout's path
alone and keeps no shared registry. That case SHALL surface as a refused port
binding when the second stack starts. It SHALL NOT surface as two stacks
quietly sharing an address. A developer meeting it renames one worktree, or
assigns its ports by hand.

Only the port set may collide. Two checkouts SHALL NOT derive one project name.
The checksum of the full path enters the name in full. Two checkouts under
different paths therefore derive different names, except on a checksum
collision.

Unlike a port collision, that case has no loud signal. The second checkout
reaches the first one's containers and volume, and nothing refuses. That is why
the derivation uses the whole checksum rather than a prefix.

#### Scenario: The second stack refuses to start

- **WHEN** a worktree brings its stack up while another worktree already
  publishes the same host ports
- **THEN** the bring-up fails with a port-binding error naming the port
- **AND** no second stack binds that address

### Requirement: The bring-up states the addresses it bound

A bring-up SHALL print the host addresses it published, at the end of its run.
A developer working in several worktrees cannot infer them. They differ per
worktree, and no fixed number holds everywhere.

#### Scenario: A bring-up names its addresses

- **WHEN** a developer brings up a worktree's stack
- **THEN** the output names three host addresses: the engine, the frontend dev
  server, and the mail catcher

#### Scenario: A contributor's own override survives

- **WHEN** a bring-up runs in a checkout whose override file carries a binding
  a contributor wrote
- **THEN** that file is what the contributor left
- **AND** Compose receives both that binding and the generated ports

#### Scenario: An override the bring-up does not recognize

- **WHEN** a bring-up runs where the override file holds content the old
  bring-up did not write
- **THEN** the bring-up leaves the file unchanged
- **AND** the output says why, and names the derived ports

#### Scenario: A checkout with no override file

- **WHEN** a bring-up runs in a checkout that carries no override file
- **THEN** it writes none
- **AND** Compose receives the base file and the generated ports alone
