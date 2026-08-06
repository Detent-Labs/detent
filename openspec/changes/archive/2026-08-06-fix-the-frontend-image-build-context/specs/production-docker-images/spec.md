## MODIFIED Requirements

### Requirement: The build context excludes development-only files

A repo-root `.dockerignore` SHALL exclude development-only paths from every
Docker build context in this repository.

Docker anchors an entry that holds no slash and no `**` to the context root. A
name that occurs below the root as well SHALL therefore carry the `**/` prefix.
This covers `**/node_modules`, `**/dist`, `**/.git`, `**/test` and `**/.env`.
The bare form of any of these is a defect, whatever else the file holds.

The file SHALL also exclude four root-only paths: `.devcontainer`, `docs`,
`openspec`, and the scratch directory `tmp`. It SHALL exclude the two agent
worktree roots, `.claude` and `.worktrees`. Each of those holds a full copy of
the source per running agent. A context that keeps them varies by machine
rather than by commit.

Git ignores `.env`. On a developer machine it holds `AUTH_JWT_SECRET`, and the
engine image's `COPY . .` takes it. The container reads its environment from
the deployment, so the file changes no behavior. Excluding it keeps a secret
out of a published image.

#### Scenario: Building either image

- **WHEN** `docker build` runs for the engine image or the frontend image
- **THEN** the build context holds none of `node_modules`, `dist`, `.git`,
  `test` or `.env` at any depth
- **AND** it holds none of `.devcontainer`, `docs`, `openspec`, `tmp`,
  `.claude` or `.worktrees` at the root

#### Scenario: A nested dependency directory

- **WHEN** `bun install` has written `packages/web/node_modules` and
  `packages/form-ui/node_modules`
- **THEN** the build context holds neither of them, because the entry reads
  `**/node_modules` rather than `node_modules`

#### Scenario: The local environment file stays out of the image

- **WHEN** a reviewer looks for `/app/.env` inside a built engine image
- **THEN** no such file exists, and the container takes `AUTH_JWT_SECRET` from
  its runtime environment as this capability already requires

## ADDED Requirements

### Requirement: Both images build on a working tree with dependencies installed

`docker build -f docker/engine.Dockerfile .` and `docker build -f
docker/frontend.Dockerfile .` SHALL both complete on a working tree where `bun
install` has run. Both SHALL complete when that tree also holds sibling git
worktrees, for example under `.claude/worktrees`.

Neither Dockerfile SHALL need a change to satisfy this. Both copy the whole
context with `COPY . .`, and both read the repo-root `.dockerignore`. The
ignore file alone decides the outcome.

This requirement exists because the previous wording stated only what the
context excludes. A root-anchored `node_modules` entry satisfied that wording
and still made both builds stop during context transfer, before instruction
one. The message named a workspace symlink whose target the filter had removed:

```
invalid file request packages/form-ui/node_modules/@types/react
```

#### Scenario: A developer machine builds the frontend image

- **WHEN** `docker build -f docker/frontend.Dockerfile .` runs on a tree where
  `bun install` has created a `node_modules` directory in each workspace member
- **THEN** the build completes, and the resulting image serves a bundle built
  from `packages/web`

#### Scenario: A developer machine builds the engine image

- **WHEN** `docker build -f docker/engine.Dockerfile .` runs on that same tree
- **THEN** the build completes, and `bun install --production
  --frozen-lockfile` succeeds inside it

#### Scenario: Sibling worktrees are present

- **WHEN** either build runs on a tree that holds git worktrees under `.claude`
  or `.worktrees`, each with its own installed dependencies
- **THEN** the build completes, and the context carries no file from any of
  those worktrees

### Requirement: A test rejects a root-anchored pattern for a recurring name

A `bun test` suite SHALL read `.dockerignore`. It SHALL reject a bare entry
whose name occurs at more than one depth in the working tree. It SHALL also
assert that the file lists `**/node_modules`, `**/.git`, `**/.env`, `.claude`
and `.worktrees`.

The check SHALL be a lint over the pattern text, never a `docker build`. A real
build needs a Docker daemon, which the four host-stage push gates deliberately
do not. The aborted engine build that produced this requirement spent 63
seconds on context transfer before it stopped.

The test SHALL state what it does not cover. It runs no build, so a wrong base
image tag stays invisible to it. It reads pattern shape rather than Docker's
matching semantics. It reports nothing about a name that has no second copy on
the tree it runs against. It learns no new development-only directory that
nobody has listed.

#### Scenario: The committed pre-fix text

- **WHEN** the test feeds the check the `.dockerignore` text as it stood before
  this change, together with the observed path
  `packages/form-ui/node_modules/@types/react`
- **THEN** the check fails and names `node_modules` as the root-anchored entry

#### Scenario: The repaired file

- **WHEN** the test runs the check against the repaired `.dockerignore` and the
  real working tree
- **THEN** the check passes, and it finds all five required entries

#### Scenario: A new bare entry for a recurring name

- **WHEN** somebody adds a bare `coverage` entry and two `coverage` directories
  exist at different depths
- **THEN** the check fails and names that entry, rather than waiting for a
  build to stop
