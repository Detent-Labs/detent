## ADDED Requirements

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
  the same failure `resolveAuthResolver` already raises outside a
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

`docker/frontend.Dockerfile` SHALL accept a build argument, `PACKAGE`,
naming exactly one of `app`, `admin`, or `studio`. A single build SHALL
build a static bundle for that one package only. A separate package SHALL
NOT need a separate Dockerfile.

#### Scenario: Building the admin package

- **WHEN** `docker build -f docker/frontend.Dockerfile --build-arg
  PACKAGE=admin .` runs against the repository
- **THEN** the resulting image contains `packages/admin`'s static assets,
  and no other package's assets

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

The frontend image SHALL serve its package's built assets through nginx.
Nginx SHALL fall back to `index.html` for any request path that matches
no built file. This SHALL match every package's existing client-side
History API routing.

#### Scenario: A deep link loads directly

- **WHEN** a browser requests a path the built assets do not contain
  directly, for example `/processes/abc/edit`
- **THEN** the server responds with `index.html`, and the client-side
  router then renders the matching screen

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

A repo-root `.dockerignore` SHALL exclude `node_modules`, `.git`,
`.devcontainer`, `docs`, and test directories from every Docker build
context in this repository.

#### Scenario: Building either image

- **WHEN** `docker build` runs for the engine image or a frontend image
- **THEN** the build context sent to the Docker daemon contains no
  `node_modules`, `.git`, `.devcontainer`, `docs`, or test directory
