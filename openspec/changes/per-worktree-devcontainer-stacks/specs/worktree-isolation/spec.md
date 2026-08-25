## Purpose

Keeps concurrent work in several git worktrees from colliding. Each checkout
gets its own devcontainer stack rather than a share of one. Names what a
checkout derives, what the main checkout keeps, and how a collision surfaces.

## ADDED Requirements

### Requirement: A checkout derives its own devcontainer identity

The repository SHALL carry one script. It derives two values from the checkout
it runs in. Those are the Compose project name and the host ports. Every
caller that drives Docker SHALL read those values from that script. No caller
SHALL name a project or a port itself. A caller sources the script and reads
the values as environment variables.

The script SHALL ask git which kind of checkout it runs in. It SHALL NOT test
the filesystem for a `.git` directory. A linked worktree holds a `.git` file
rather than a directory, so that test answers false inside a real repository.

In a main checkout the script SHALL return the project name and the ports this
repository used before the change. A clone then behaves as it always has. A
hosted CI runner clones rather than adding a worktree, so it needs no knowledge
of this capability.

In a linked worktree the script SHALL return a project name and a port set of
its own. The worktree's directory name alone determines both. The same worktree
therefore returns the same values on every run, and a bookmarked address stays
valid.

#### Scenario: A main checkout keeps the established identity

- **WHEN** a caller sources the script in a checkout whose `.git` is a
  directory
- **THEN** the script exports the project name and the base ports the
  repository used before the change

#### Scenario: A linked worktree derives its own identity

- **WHEN** a caller sources the script in a checkout whose `.git` is a file
  holding a `gitdir:` pointer
- **THEN** the script exports a project name and a port set distinct from the
  main checkout's

#### Scenario: The derivation holds across a recreate

- **WHEN** a caller sources the script twice in one worktree, with a container
  recreate in between
- **THEN** both runs export the same project name and the same ports

#### Scenario: Two worktrees differ

- **WHEN** a caller sources the script in two worktrees with different
  directory names
- **THEN** the two exported port sets differ

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

Two worktrees MAY derive one port set. The derivation reads the directory name
alone and keeps no shared registry. That case SHALL surface as a refused port
binding when the second stack starts. It SHALL NOT surface as two stacks
quietly sharing an address. A developer meeting it renames one worktree, or
assigns its ports by hand.

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
