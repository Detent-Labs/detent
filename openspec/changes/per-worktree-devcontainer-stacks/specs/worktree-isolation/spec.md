## Purpose

Keeps concurrent work in several git worktrees from colliding, by giving each
checkout its own devcontainer stack rather than a share of one. Names what a
checkout derives for itself, what the main checkout keeps unchanged, and how a
collision surfaces.

## ADDED Requirements

### Requirement: A checkout derives its own devcontainer identity

The repository SHALL carry one script that derives, from the checkout it runs
in, the Compose project name and the host ports that checkout uses. Every
caller that drives Docker SHALL take those values from that script rather than
naming a project or a port itself. The script SHALL be sourced, so a caller
receives the values as environment variables.

The derivation SHALL distinguish a main checkout from a linked worktree by
asking git, not by testing the filesystem for a `.git` directory. In a linked
worktree `.git` is a file holding a pointer, so a directory test answers false
inside a real repository.

A main checkout SHALL derive the project name and ports the repository used
before this capability existed. A clone therefore behaves as it always has, and
a hosted CI runner, which clones rather than adds a worktree, needs no
knowledge of this capability at all.

A linked worktree SHALL derive a project name and a port set of its own, both
determined by the worktree's directory name alone. The same worktree therefore
derives the same values on every run, and a bookmarked address stays valid for
the life of that worktree.

#### Scenario: A main checkout keeps the established identity

- **WHEN** the script is sourced in a checkout whose `.git` is a directory
- **THEN** it exports the project name and the base ports the repository used
  before this capability existed

#### Scenario: A linked worktree derives its own identity

- **WHEN** the script is sourced in a checkout whose `.git` is a file holding
  a `gitdir:` pointer
- **THEN** it exports a project name and a port set distinct from the main
  checkout's

#### Scenario: The derivation is stable

- **WHEN** the script is sourced twice in the same worktree, with a container
  recreated in between
- **THEN** both runs export the same project name and the same ports

#### Scenario: Two worktrees differ

- **WHEN** the script is sourced in two worktrees with different directory
  names
- **THEN** the two exported port sets differ

### Requirement: A worktree's stack is reachable only from that worktree

Each checkout's Compose project SHALL own its application container, its
database server, its mail catcher and its persistent database volume. No two
checkouts SHALL share any of them.

A command run in one checkout SHALL reach that checkout's containers and no
other's. The application container of a checkout's project SHALL bind-mount
that checkout, so a command that compiles, builds or tests reads the files of
the checkout it was started from.

Isolation of the test database follows from this boundary. The test database
keeps the name `development-toolchain` specifies; the server holding it is
private to the checkout, so two checkouts running the suite at once cannot
truncate each other's tables.

#### Scenario: A command reads the checkout it ran in

- **WHEN** a command that compiles or tests is run in a worktree
- **THEN** it reads that worktree's files, and a change present only in that
  worktree is visible to it

#### Scenario: Two suites run at once

- **WHEN** the test suite runs in two worktrees at the same time
- **THEN** each run's writes and truncations land in its own database server,
  and neither run observes the other's

### Requirement: A port collision fails loudly

Two worktrees MAY derive the same port set, because the derivation reads the
directory name alone and carries no shared registry. That case SHALL surface
as a refused port binding when the second stack starts.

It SHALL NOT surface as two stacks quietly sharing an address. A developer
meeting it renames one worktree, or assigns its ports by hand.

#### Scenario: The second stack refuses to start

- **WHEN** a worktree brings its stack up while another worktree already
  publishes the same host ports
- **THEN** the bring-up fails with a port-binding error naming the port, and
  no second stack binds that address

### Requirement: The bring-up states the addresses it bound

A bring-up SHALL print the host addresses it published, at the end of its run.
A developer working in several worktrees cannot infer them, because they
differ per worktree and no fixed number is correct everywhere.

#### Scenario: A bring-up names its addresses

- **WHEN** a developer brings up a worktree's stack
- **THEN** the output names the host address of the engine, of the frontend
  dev server, and of the mail catcher's web interface
