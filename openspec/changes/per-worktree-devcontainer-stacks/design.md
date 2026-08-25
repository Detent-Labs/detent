## Context

See `proposal.md` for motivation. What shapes the approach, measured rather
than assumed:

- The command `docker inspect workflow-engine-app-1` reports one bind mount.
  That mount is the checkout which started the project. The label
  `com.docker.compose.project.working_dir` names the same checkout.
- The project name is a literal in the tracked compose file. Every worktree
  checks out that literal, so every worktree resolves one project.
- The script `scripts/dev-up.sh` writes
  `.devcontainer/docker-compose.override.yml`, and git ignores that file. It
  already holds the host port bindings, and it is already per-checkout state.
  That makes it the right place for derived ports.
- The preflight's check 4 probes 3000 and 8025 as literals.
- Nothing inside the container needs the checkout's git directory. A linked
  worktree's `.git` file points at a host path that would not resolve on
  Linux. The one suite shelling out to git, `test/enable-hooks.test.ts`,
  builds its own temporary repositories.

## Goals / Non-Goals

**Goals:**

- One derivation, in one file, that every Docker-driving caller reads.
- The main checkout and a hosted CI clone keep today's names and ports.
- The test-database rule stays as `development-toolchain` already words it.
  The container boundary makes it hold between checkouts too.

**Non-Goals:**

- Sharing a database server between checkouts. The decision below rejects it.
- A registry, a lock file or an allocator for ports. The derivation stays a
  pure function of the directory name.
- Any change to the engine, the schema, the runtime API or the HTTP wrapper.

## Decisions

### One Compose project per checkout, not one container with many mounts

The alternative mounts every worktree into a single container under a common
parent, and isolates them by a database name per mount. It costs less memory:
one Postgres rather than one per checkout.

This design rejects it on where the friction lands. Adding a worktree means
regenerating the override and recreating the shared container. That interrupts
whatever every other checkout runs at that moment. The host ports also stay a
single set under that design, so a second browser session stays impossible.
The memory saving arrives once. The interruption arrives on the daily path.

The project-per-checkout design also leaves the existing test-database rule
alone. Under the shared-container design `DATABASE_URL` is one container-wide
value. Every command would have to override it per invocation, and a caller
that forgot would drive the wrong database without saying so.

### The derivation reads the directory name, not the branch

A developer renames a branch and checks it out elsewhere. A worktree directory
keeps the name it got when it was created. Deriving from the branch would
change a worktree's project name under it. Every branch switch would then
orphan that worktree's containers and its database volume.

### The main checkout keeps the established identity

The derivation returns today's project name and today's ports wherever `.git`
is a directory. That keeps the running stack undisturbed. It also keeps
`.github/workflows/check.yml` working with no change, because a CI runner
clones and therefore takes that branch.

It bounds the blast radius too. A wrong derivation is wrong only in worktrees.

### The offset hashes the name, and a collision stays loud

The offset is a small function of the directory name. It applies identically
to all three published ports, so one worktree's addresses stay easy to read
together.

A hash admits collisions. The alternative allocator scans what is already
bound and records its choice. It removes collisions, and it costs a state file
to keep in sync, a first-run ordering dependence, and a stale entry whenever
somebody deletes a worktree. With a handful of worktrees a collision is
unlikely, and it cannot hide: Docker refuses the second bind and names the
port. The script carries a `ponytail:` comment naming that ceiling and the
allocator as the upgrade path.

### The image carries a name, so the projects share one build

Compose otherwise builds and tags an image per project. Naming the image in
the service definition lets the first build populate it and the rest reuse it.

## Risks / Trade-offs

- The host address differs from Vite's listening port, so the hot-reload
  client opens its socket on the wrong number → the package reads the client
  port from the environment. This is the only place the change reaches past
  infrastructure into application config. The delta spec words it as
  observable behavior rather than as a config detail.
- Two worktrees hash to one offset → the second bring-up fails with a
  port-binding error naming the port. Loud, immediate, and repaired by
  renaming the worktree.
- Each checkout installs its own `node_modules` and carries its own database
  volume → disk cost, and a slow first bring-up per worktree. The trees
  already sit apart on the host, so no shared copy exists to reuse.
- A caller that forgets to source the derivation reaches an unnamed project →
  dropping the `name:` literal makes that visible. The command then finds no
  containers at all, rather than somebody else's.
- Documentation naming a fixed address goes stale in a worktree →
  `docs/browser-checks.md` and the devcontainer skill word the address as
  derived, and the bring-up prints what it bound.

## Migration Plan

1. The main checkout needs nothing. Its derived identity equals its current
   one, so its running containers keep serving it.
2. Each worktree runs the bring-up once. That creates the worktree's project,
   installs dependencies, seeds, and prints the addresses it bound.
3. Rollback restores the `name:` literal in the compose file. The worktrees'
   projects then sit unused. A `docker compose down -v` under each project
   name removes them.
