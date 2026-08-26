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
  A contributor may hand-write a binding there too, which the decision below
  turns into two files rather than one.
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
  pure function of the checkout's path.
- Any change to the engine, the schema, the runtime API or the HTTP wrapper.
- One image tag shared across the projects. Each project builds its own. The
  build context and the Dockerfile are the same for every checkout on a branch
  that has not changed them. Docker's layer cache therefore makes every build
  after the first near-instant, and the
  images share their layers on disk. A per-project build keeps the guarantee
  the push gate rests on. A branch that bumps `BUN_VERSION` gates under the Bun
  it names.
- VS Code's Reopen-in-Container path. The file
  `.devcontainer/devcontainer.json` names a compose file. It cannot source a
  shell script. It therefore reaches the fallback project the Risks section
  names. The supported entry point stays `scripts/dev-up.sh`.

## Decisions

### One Compose project per checkout, not one container with many mounts

The alternative mounts every worktree into a single container. One database
name per mount isolates them. It costs less memory: one Postgres rather than
one per checkout.

This design rejects it on where the friction lands. Adding a worktree means
regenerating the override and recreating the shared container. That interrupts
whatever every other checkout runs at that moment. The host ports also stay a
single set under that design, so a second browser session stays impossible.
The memory saving arrives once. The interruption arrives on the daily path.

The project-per-checkout design also leaves the existing test-database rule
alone. Under the shared-container design `DATABASE_URL` is one container-wide
value. Every command would have to override it per invocation. A caller that
forgot would drive the wrong database silently.

### The derivation reads the checkout's path, not the branch

A developer renames a branch and checks it out elsewhere. A worktree directory
keeps the name its creator gave it. Deriving from the branch would change a
worktree's project name under it. Every branch switch would then orphan that
worktree's containers and its database volume.

The input is the absolute path, not the basename. This repository holds
worktrees under two parents, `.claude/worktrees/` and
`orca/workspaces/detent/`. Two worktrees named alike under different parents
would otherwise derive one project.

### The main checkout keeps the established identity

The derivation asks `git rev-parse` for the git directory and the common git
directory. Both calls take `--path-format=absolute`. It returns today's project
name and today's ports wherever the two resolve to the same path. Without the
flag a subdirectory of a main checkout answers `.git` on one side and `../.git`
on the other. It then reads as a worktree.

That keeps the running stack undisturbed. A CI runner clones, so once its steps
source the helper it derives that same name.

It bounds the blast radius too. A wrong derivation is wrong only in worktrees.

### The offset hashes the path, and a collision stays loud

The offset is a small function of the checkout's path. It applies identically
to all three published ports, so one worktree's addresses stay easy to read
together.

The formula is `10 * (1 + cksum(path) % 200)`. It yields a multiple of ten
between 10 and 2000. Added to the three base ports it gives the engine
3010-5000, the dev server 5183-7173, and the mail catcher 8035-10025. No band
reaches into another, so a port number still names the service behind it. The
step of ten also leaves room beside each address for a port a developer binds
by hand.

A hash admits collisions. The alternative allocator scans what is already
bound and records its choice. It removes collisions, and it costs three
things. Those are a state file, a first-run ordering dependence, and a stale
entry after a deleted worktree.

Two hundred buckets put the chance of a shared offset near five percent at
five worktrees. A collision also cannot hide. Docker refuses the second bind
and names the port. The script carries a `ponytail:` comment naming that
ceiling and the allocator as the upgrade path.

### The generated ports take their own compose file

The bring-up writes `.devcontainer/docker-compose.ports.yml` and passes it to
Compose. The override file beside it stays the contributor's. Compose reads the
base file first, then that override where it exists, then the generated ports.
The bring-up no longer writes an override, so the middle `-f` is conditional.

One override file holding both was the first shape, with the generated part
marked off by comments. Docker refuses it. The generated part owns the
top-level `services:` key. A binding a contributor adds beside it declares
`services:` a second time. Compose then rejects the duplicate key. Two `-f`
overrides merge additively instead, and `config` emits `3010:3000` and
`3001:3000` together.

## Risks / Trade-offs

- The host address differs from Vite's listening port → the package reads the
  hot-reload client port from the environment. Without that, the client opens
  its socket on the wrong number. This is the only place the change reaches
  past infrastructure into application config. The delta spec words it as
  observable behavior rather than as a config detail.
- Two worktrees hash to one offset → the second bring-up fails with a
  port-binding error naming the port. Loud, immediate, and repaired by
  renaming the worktree.
- Each checkout installs its own `node_modules` and carries its own database
  volume → disk cost, and a slow first bring-up per worktree. The trees
  already sit apart on the host, so no shared copy exists to reuse.
- A caller that forgets to source the derivation reaches the main checkout's
  stack → the compose file's own `name: workflow-engine` attribute names it.
  Compose reads that attribute ahead of the file's directory basename, so no
  stray project and no stray volume appear. Such a call lands on the
  established project, as it did before this change. In a worktree that is
  still the wrong stack, and the command tests the main checkout's files.
  Tasks 3.9 to 3.11 sweep every literal compose invocation left in a tracked
  file.
- Check 2's repair hint becomes `bash scripts/dev-up.sh`, which restarts the
  HTTP server → a bare compose `up` cannot replace it. The ports file does not
  exist before the first bring-up. This change does not touch the rule keeping
  the hook itself off the `serve` profile. Only the printed hint reaches it,
  and only when a human runs it.
- That restarted server could contend with a suite run → the gate's own run
  stays clear of it. The preload at `test/preload-db.ts` puts every `bun test`
  run on the `_test` database, which the server's poller never touches. The
  checklist's broader no-overlap rule keeps its wording here, and its rationale
  stays out of scope.
- Documentation naming a fixed address goes stale in a worktree →
  `docs/browser-checks.md` and the devcontainer skill word it as derived. The
  bring-up prints what it bound.

## Migration Plan

1. The main checkout keeps its project name and its database volume, so its
   data survives. Its derived identity equals its current one. Task 2.4 adds
   an environment key, so Compose recreates the `app` container once, on the
   next bring-up.
2. Each worktree runs the bring-up once. That creates the worktree's project,
   installs dependencies, seeds, and prints the addresses it bound.
3. A checkout that already ran the old bring-up carries the port bindings the
   old script wrote into `docker-compose.override.yml`. The new bring-up
   recognizes that exact content and removes that file from disk. Without that
   removal a worktree publishes 3000, 5173 and 8025 beside its derived ports,
   and collides with main. An override the bring-up does not recognize it
   leaves alone. The run says why, and names the derived ports.
4. Rollback returns each caller to its unsourced form. Every command then
   resolves `workflow-engine` from the compose file's own `name:` attribute
   again. The worktrees' projects sit unused, and a `docker compose down -v`
   under each project name removes them.

## Open Questions

- Does VS Code's Reopen-in-Container path need support? It cannot source the
  helper, so it would need a generated `devcontainer.json` or a wrapper that
  writes the environment first. Nobody here uses that path today, which is why
  the Non-Goals rule it out. A contributor who wants it files the follow-up.
- When does the allocator become necessary? The hash admits a collision, and
  the answer today is to rename a worktree. Past a dozen concurrent worktrees
  the chance passes a quarter. The `ponytail:` comment names the allocator as
  the upgrade, and no measurement yet says the count is near.
