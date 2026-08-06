# production-docker-images Specification

## Purpose

The devcontainer image (`.devcontainer/Dockerfile`) is dev-only by
construction: it mounts the workspace and runs `sleep infinity`. Before
this capability, no image existed that a deployment could run.

This spec is the build contract for the four production images this repo
ships. One is for the engine (`docker/engine.Dockerfile`). One is for
each frontend package, `app`/`admin`/`studio`
(`docker/frontend.Dockerfile`, parameterized by a `PACKAGE` build arg
rather than three near-duplicate files).

It covers what each image runs as, what it exposes, and how it reports
health. It also covers how configuration reaches it: runtime environment
variables for the engine, build arguments for the frontends. Vite inlines
its env at build time, so a container runtime env var would arrive too
late to matter.
## Requirements
### Requirement: The engine image runs a production build with no development dependencies

`docker/engine.Dockerfile` SHALL install workspace dependencies with `bun
install --production --frozen-lockfile`. The resulting image SHALL NOT
contain `vite`, `typescript`, or any other package declared only as a
`devDependency` anywhere in the workspace.

#### Scenario: Building the engine image

- **WHEN** `docker build -f docker/engine.Dockerfile .` runs against the
  repository
- **THEN** the build completes, and the image contains no
  `devDependency`-only package from any workspace member

### Requirement: The engine image starts the same entry point `bun run serve` uses

The engine image's `CMD` SHALL start `src/http/server.ts`, the entry point
`bun run serve` already starts locally. It SHALL introduce no separate
production entry point.

#### Scenario: Starting the engine container

- **WHEN** the engine image runs with a valid `DATABASE_URL` and a valid
  authentication configuration
- **THEN** it serves the same HTTP routes `bun run serve` already serves
  locally

### Requirement: The engine image reads all configuration from its runtime environment

The engine image SHALL set no application environment variable itself. It
SHALL read `DATABASE_URL`, `AUTH_JWT_SECRET`/`AUTH_ISSUERS`,
`CORS_ALLOWED_ORIGINS`, and `PORT` from whatever supplies its container
runtime environment. It SHALL NOT set `ALLOW_INSECURE_DEV_AUTH`.

#### Scenario: A required variable is missing

- **WHEN** the engine image starts with neither `AUTH_JWT_SECRET` nor
  `AUTH_ISSUERS` set
- **THEN** the process fails to start and names the missing configuration,
  the same error `resolveAuthResolver` already raises outside a
  container

#### Scenario: The image never enables the insecure dev resolver on its own

- **WHEN** a reviewer inspects the engine image's own file contents
- **THEN** no instruction sets `ALLOW_INSECURE_DEV_AUTH`

### Requirement: The engine image reports its own health

The engine image SHALL declare a Docker `HEALTHCHECK` that calls
`GET /readyz` on its own listening port. It SHALL use a tool already
present in the base image. It SHALL NOT need `curl` or `wget` installed.

#### Scenario: The database is reachable

- **WHEN** the engine container's `HEALTHCHECK` runs and `GET /readyz`
  responds `200`
- **THEN** Docker reports the container healthy

#### Scenario: The database is unreachable

- **WHEN** the engine container's `HEALTHCHECK` runs and `GET /readyz`
  responds `503`, or the request fails outright
- **THEN** Docker reports the container unhealthy

#### Scenario: PORT is overridden

- **WHEN** the engine container starts with `PORT` set to a value other
  than `3000`
- **THEN** the `HEALTHCHECK` still targets that overridden port, not a
  hardcoded `3000`

### Requirement: The engine image runs as a non-root user

The engine image SHALL run its process as the base image's existing
non-root user. It SHALL NOT add a separate user for this purpose.

#### Scenario: Inspecting the running container's user

- **WHEN** a reviewer lists processes inside a running engine container
- **THEN** the server process runs as the non-root `bun` user, not `root`

### Requirement: The frontend image builds exactly one package per invocation

`docker/frontend.Dockerfile` SHALL build the one workspace package that
produces a browser bundle, `packages/web`. It SHALL NOT take a build argument
naming which package to build: exactly one exists, and the four areas it
contains are not separately buildable.

A single build SHALL produce a static bundle covering every area. A separate
area SHALL NOT need a separate Dockerfile or a separate image.

#### Scenario: Building the admin package

- **WHEN** an image is wanted for what used to be `packages/admin`
- **THEN** `docker build -f docker/frontend.Dockerfile .` builds it with no
  build argument, and the resulting image contains the admin area along with
  every other area, because one bundle now covers all of them

#### Scenario: Building the reporting package

- **WHEN** an image is wanted for what used to be `packages/reporting`
- **THEN** the same argument-free build produces it, and
  `docker/frontend.Dockerfile` declares no build argument selecting a package
  or an area

### Requirement: The build args fix the frontend's API origin, never the container runtime

`docker/frontend.Dockerfile` SHALL accept `VITE_API_URL` as a build
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

### Requirement: The frontend image serves the built SPA with a client-side routing fallback

The frontend image SHALL serve the built assets through nginx.
Nginx SHALL fall back to `index.html` for any request path that matches
no built file. This SHALL match the shell's client-side
History API routing, including every area prefix.

The server block SHALL send the four headers `frontend-security-headers`
names, on every response. Each `add_header` SHALL carry the `always`
argument, so an error response carries the header too. The block replaces the
base image's own server block, so it inherits no header from it.

#### Scenario: A deep link loads directly

- **WHEN** a browser requests a path the built assets do not contain
  directly, for example `/studio/processes/abc/edit`
- **THEN** the server responds with `index.html`, and the client-side
  router then renders the matching screen

#### Scenario: An area prefix is not a special case

- **WHEN** a browser requests any of `/app`, `/admin`, `/studio` or
  `/reporting`
- **THEN** the same fallback serves `index.html`, with no per-area nginx
  location block

#### Scenario: Every response carries the four headers

- **WHEN** a browser requests the shell, a hashed asset, or a path that
  produces an error response
- **THEN** the response carries `Content-Security-Policy: frame-ancestors
  'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`

### Requirement: The frontend image reports its own health

The frontend image SHALL declare a Docker `HEALTHCHECK` that requests its
own served root. It SHALL use a tool already present in the base image.

#### Scenario: The static server is serving

- **WHEN** the frontend container's `HEALTHCHECK` requests its served root
  and receives a successful response
- **THEN** Docker reports the container healthy

#### Scenario: The health check targets an address, not a hostname

- **WHEN** the frontend container's own `/etc/hosts` resolves `localhost`
  to an IPv6 address nginx does not listen on
- **THEN** the `HEALTHCHECK` still succeeds, because it targets
  `127.0.0.1` directly rather than `localhost`

### Requirement: The frontend image runs as a non-root user

The frontend image SHALL run nginx as a non-root user by default. It
SHALL need no more Dockerfile instruction than selecting a base image
that already does this.

#### Scenario: Inspecting the running container's user

- **WHEN** a reviewer lists processes inside a running frontend container
- **THEN** the nginx worker process runs as a non-root user

### Requirement: The build context excludes development-only files

A repo-root `.dockerignore` SHALL exclude development-only paths from every
Docker build context in this repository.

Docker anchors an entry that holds no slash and no `**` to the context root. A
name that occurs below the root as well SHALL therefore carry the `**/` prefix.
This covers `**/node_modules`, `**/dist`, `**/.git`, `**/test` and `**/.env`.
The bare form of any of these is an error, whatever else the file holds.

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
