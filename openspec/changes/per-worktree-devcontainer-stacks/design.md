## Context

See `proposal.md` for motivation. The state that shapes the approach, measured
rather than assumed:

- `docker inspect workflow-engine-app-1` reports one bind mount, the checkout
  that started the project. `com.docker.compose.project.working_dir` names that
  checkout's `.devcontainer` directory.
- The project name is a literal, `name: workflow-engine`, in the tracked
  compose file. Every worktree checks out that same literal, so every worktree
  resolves the same project.
- `scripts/dev-up.sh` writes `.devcontainer/docker-compose.override.yml`, which
  is gitignored, and that file carries the host port bindings. It is already
  per-checkout state, so it is the right place for derived ports.
- `scripts/preflight.sh` check 4 probes 3000 and 8025 as literals.
- Nothing that runs inside the container needs the checkout's git directory. A
  linked worktree's `.git` is a file pointing at a host path that would not
  resolve on Linux, and `test/enable-hooks.test.ts`, the one suite that shells
  out to git, builds its own temporary repositories.

## Goals / Non-Goals

**Goals:**

- One derivation, in one file, that every Docker-driving caller reads.
- The main checkout and a hosted CI clone keep today's names and ports.
- The test-database isolation already specified stays as written. The container
  boundary makes it hold between checkouts too.

**Non-Goals:**

- Sharing a database server between checkouts. That was the alternative, and it
  was rejected below.
- A registry, a lock file or an allocator for ports. The derivation is a pure
  function of the directory name.
- Any change to the engine, the schema, the runtime API or the HTTP wrapper.

## Decisions

### One Compose project per checkout, rather than one container with many mounts

The alternative was a single container bind-mounting every worktree under a
common parent, isolated by a database name per mount. It costs less memory: one
Postgres rather than one per checkout.

It was rejected on where the friction lands. Adding a worktree means
regenerating the override and recreating the shared container, which interrupts
whatever every other checkout is running at that moment. The host ports also
stay a single set under that design, so a second browser session is still
impossible. The memory saving is paid once; the interruption is paid on the
daily path.

The project-per-checkout design also lets the existing test-database rule stand
untouched. Under the shared-container design, `DATABASE_URL` is a container-wide
value, so each command would have to override it per invocation, and every
caller that forgot would silently drive the wrong database.

### The derivation reads the directory name, not the branch

A branch is renamed and checked out elsewhere; a worktree directory is created
once and keeps its name. Deriving from the branch would change a worktree's
project name under it, orphaning its containers and its database volume on every
branch switch.

### The main checkout keeps the established identity

The derivation returns today's project name and today's ports whenever `.git` is
a directory. This is what keeps the running stack undisturbed and what keeps
`.github/workflows/check.yml` working with no change: a CI runner clones, so it
takes that branch.

It also bounds the blast radius of the change. If the derivation is wrong, it is
wrong only in worktrees.

### The offset is a hash of the name, and a collision is loud

The offset is a small function of the directory name, applied identically to all
three published ports, so one worktree's addresses stay easy to read together.

A hash admits collisions. The alternative, an allocator that scans what is
already bound and records its choice, removes them at the cost of a state file
to keep in sync, a first-run ordering dependence, and a stale entry when a
worktree is deleted. With a handful of worktrees the collision is unlikely, and
it cannot be silent: Docker refuses the second bind and names the port. The
script carries a `ponytail:` comment naming that ceiling and the allocator as
the upgrade path.

### The image is named, so the projects share one build

Compose otherwise builds and tags an image per project. Naming the image in the
service definition makes the first build populate it and the rest reuse it.

## Risks / Trade-offs

- The published host port differs from Vite's listening port, so the hot-reload
  client opens its socket on the wrong number → the package takes the client
  port from the environment. This is the only place the change reaches past
  infrastructure into application config, and the delta spec states it as
  observable behavior rather than as a config detail.
- Two worktrees hash to one offset → the second bring-up fails with a
  port-binding error naming the port. Loud, immediate, and repaired by renaming
  the worktree.
- Each checkout installs its own `node_modules` and carries its own database
  volume → disk cost, and a slow first bring-up per worktree. The trees are
  already separate on the host, so no shared copy exists to reuse.
- A caller that forgets to source the derivation reaches an unnamed project →
  removing the `name:` literal makes that failure visible, because the command
  then finds no containers at all rather than someone else's.
- Documentation naming a fixed address goes stale in a worktree →
  `docs/browser-checks.md` and the devcontainer skill state the address as
  derived, and the bring-up prints what it bound.

## Migration Plan

1. The main checkout needs nothing. Its derived identity equals its current one,
   so its running containers keep serving it.
2. Each worktree runs the bring-up once. It creates that worktree's project,
   installs dependencies, seeds, and prints the addresses it bound.
3. Rollback is restoring the `name:` literal in the compose file. The
   worktrees' projects then sit unused until removed with
   `docker compose down -v` under their own project names.
