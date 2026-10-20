# Spec Delta

## MODIFIED Requirements

### Requirement: The engine image runs a production build with no development dependencies

`deploy/engine.Dockerfile` SHALL install workspace dependencies with `bun
install --production --frozen-lockfile`. The resulting image SHALL NOT
contain `vite`, `typescript`, or any other package declared only as a
`devDependency` anywhere in the workspace.

#### Scenario: Building the engine image

- **WHEN** `docker build -f deploy/engine.Dockerfile .` runs against the
  repository
- **THEN** the build completes, and the image contains no
  `devDependency`-only package from any workspace member

### Requirement: The frontend image builds exactly one package per invocation

`deploy/frontend.Dockerfile` SHALL build the one workspace package that
produces a browser bundle, `packages/web`. It SHALL NOT take a build argument
naming which package to build: exactly one exists, and the four areas it
contains are not separately buildable.

A single build SHALL produce a static bundle covering every area. A separate
area SHALL NOT need a separate Dockerfile or a separate image.

#### Scenario: Building the admin package

- **WHEN** an image is wanted for what used to be `packages/admin`
- **THEN** `docker build -f deploy/frontend.Dockerfile .` builds it with no
  build argument, and the resulting image contains the admin area along with
  every other area, because one bundle now covers all of them

#### Scenario: Building the reporting package

- **WHEN** an image is wanted for what used to be `packages/reporting`
- **THEN** the same argument-free build produces it, and
  `deploy/frontend.Dockerfile` declares no build argument selecting a package
  or an area

### Requirement: The build args fix the frontend's API origin, never the container runtime

`deploy/frontend.Dockerfile` SHALL accept `VITE_API_URL` as a build
argument only. It SHALL NOT read `VITE_API_URL`, or any equivalent, from
the container's runtime environment. A built image's API origin SHALL NOT
change without rebuilding the image.

#### Scenario: A build argument reaches the built bundle

- **WHEN** the frontend image builds with `--build-arg
  VITE_API_URL=https://api.example.com`
- **THEN** the built JavaScript calls `https://api.example.com`, and the
  built Content-Security-Policy's `connect-src` permits that origin

#### Scenario: A runtime environment variable has no effect

- **WHEN** a built frontend container starts with a `VITE_API_URL`
  environment variable set
- **THEN** the running container behaves exactly as it would with that
  variable unset

### Requirement: Both images build on a working tree with dependencies installed

`docker build -f deploy/engine.Dockerfile .` and `docker build -f
deploy/frontend.Dockerfile .` SHALL both complete on a working tree where `bun
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

- **WHEN** `docker build -f deploy/frontend.Dockerfile .` runs on a tree where
  `bun install` has created a `node_modules` directory in each workspace member
- **THEN** the build completes, and the resulting image serves a bundle built
  from `packages/web`

#### Scenario: A developer machine builds the engine image

- **WHEN** `docker build -f deploy/engine.Dockerfile .` runs on that same tree
- **THEN** the build completes, and `bun install --production
  --frozen-lockfile` succeeds inside it

#### Scenario: Sibling worktrees are present

- **WHEN** either build runs on a tree that holds git worktrees under `.claude`
  or `.worktrees`, each with its own installed dependencies
- **THEN** the build completes, and the context carries no file from any of
  those worktrees
