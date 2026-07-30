## Context

The devcontainer image (`.devcontainer/Dockerfile`) is the only image this
repo has today. It mounts the workspace and runs `sleep infinity`. A
developer runs commands inside it by hand. No image starts the engine or
serves a frontend on its own.

Four artifacts need a real image. One is the engine
(`src/http/server.ts`, started today by `bun run serve`). Three are Vite
SPAs: `packages/app`, `packages/admin`, `packages/studio`. `packages/form-ui`
ships no image. It is a source-only library the three SPAs bundle at their
own build time.

Two prior decisions constrain this design directly:

- `#14a` (`add-health-readiness-endpoints`) added `GET /livez` and
  `GET /readyz` for exactly this purpose. Its own design doc names the
  frontend file-server health check as this change's job, not its own.
- `frontend-security-headers` already bakes a Content-Security-Policy into
  each SPA's built `index.html`. It lands there as a `<meta>` tag, at Vite
  build time. That policy travels with the built files. It needs no
  server-side header from whatever serves them.

## Goals / Non-Goals

**Goals:**

- One Dockerfile builds a runnable production engine image.
- One parameterized Dockerfile builds a runnable production image for each
  of the three frontend SPAs.
- Each image reports its own health. A `HEALTHCHECK` or an orchestrator
  probe then has something to call.
- Each image runs as a non-root user by default.
- Configuration reaches each image the way its runtime already expects it.
  The engine reads environment variables. The frontends read build
  arguments instead, since Vite inlines its env at build time. A runtime
  env var would arrive too late to matter.

**Non-Goals:**

- A production `docker-compose` file, or any other orchestration wiring.
  Nothing here decides how these images get scheduled or networked in a
  real deployment.
- A CI workflow that builds or publishes an image. This repo runs no
  hosted CI today. `development-toolchain`'s pre-push hook is the only
  gate. Adding a hosted workflow is a separate decision.
- TLS termination, a reverse proxy, or multi-architecture builds. Out of
  scope until a concrete deployment target asks for them.
- Any change to `/livez`, `/readyz`, or the CSP meta tag. Both already
  exist. This change only consumes them.

## Decisions

### One `docker/` directory, not Dockerfiles at the repo root

`docker/engine.Dockerfile`, `docker/frontend.Dockerfile`, and
`docker/nginx.conf` live under a new `docker/` directory. The repo root
already holds `.devcontainer/`. Grouping the production build artifacts the
same way keeps the root itself uncluttered. `.dockerignore` stays at the
repo root. Docker only reads it from the build context root, so it has no
other valid location.

### The engine image is single-stage

Bun runs TypeScript directly. Nothing compiles the engine before it runs.
This differs from a typical Node project with a `tsc` or bundler build
step. A multi-stage split would only trim which files land in the final
layer. No build tool needs removing, because none is present in the first
place. `docker/engine.Dockerfile` therefore has one stage:

- **Base image**: `FROM oven/bun:1.3.11-slim`. This pins the same version
  as `.devcontainer/Dockerfile`'s `BUN_VERSION`. Bump both together,
  deliberately, the way the devcontainer's own comment already instructs.
  The `-slim` variant ships the same non-root `bun` user, UID 1000, as the
  default tag, at a fraction of the size. The plain tag pulls in a full
  Debian userland this image never needs.
- **Copy**: copy the full build context, after `.dockerignore` trims it.
- **Install**: `bun install --production --frozen-lockfile`. This installs
  no `devDependencies` anywhere in the workspace, so tools like Vite and
  TypeScript never enter the image. The `packages/*` directories stay on
  disk anyway, so `bun install`'s workspace resolution still finds their
  manifests and `file:` links.
- **User**: `USER bun`. The official `oven/bun` image already ships this
  user. This Dockerfile adds no user of its own.
- **Health and start**: `HEALTHCHECK` and `CMD` (see below).

Copying the whole context, rather than hand-picking `src/` plus manifests,
is the simpler of two working options. The alternative saves some image
size. It also adds a second stage and a maintained include-list that drifts
every time a new top-level directory appears. Revisit this only if image
size becomes a measured problem.

### The frontend image is genuinely multi-stage

The frontend's build and run environments are different runtimes
entirely. Bun and Vite build the assets. Nginx serves them instead. Nginx
cannot run Bun or Vite. Two stages are the minimum here, not a premature
split:

- **Build stage** (`FROM oven/bun:1.3.11-slim AS build`). It copies the full
  context and runs `bun install --frozen-lockfile`. This is the full
  install, not `--production`, because the build stage needs Vite and
  `@vitejs/plugin-react`, both dev dependencies. It then runs `bun run
  --filter "./packages/${PACKAGE}" build`, where the build arg `PACKAGE`
  selects `app`, `admin`, or `studio`. A second build arg, `VITE_API_URL`,
  becomes an env var so `vite build` inlines it into the bundle. Build
  args do not cross a `FROM` boundary automatically, so each stage that
  reads `PACKAGE` redeclares it.
- **Serve stage** (`FROM nginxinc/nginx-unprivileged:alpine`). It copies
  `packages/${PACKAGE}/dist` from the build stage into the image's web
  root, plus the shared `docker/nginx.conf`. This image variant listens
  on 8080 and runs as a non-root user out of the box. That matches the
  engine image's `USER bun`, with no custom user setup needed in this
  Dockerfile. The stock `nginx:alpine` image would need a manual
  non-root reconfiguration to match. The unprivileged variant gets there
  with a base-image swap instead.

This is one parameterized Dockerfile, not three near-duplicate files. The
only difference between the three builds is which package's `dist`
directory lands in the serve stage.

### `docker/nginx.conf` does SPA fallback and nothing else

The three frontends route client-side, through a hand-written History API
hook (`routing.ts` in each package). A direct load of a deep URL is a
request nginx sees no matching file for, for example
`/processes/abc/edit`. The shared config, `docker/nginx.conf`, replaces
the base image's own default server block entirely. It must declare the
full block itself, not just the fallback line:

```
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;
    gzip on;

    location / {
        try_files $uri /index.html;
    }
}
```

`listen 8080` matches `nginxinc/nginx-unprivileged`'s own convention (see
below). A bare `listen 80` would fail outright, since the image's
non-root user cannot bind a port under 1024. This config also declares
`root` and `index` explicitly. Neither is an implied default once this
file replaces the stock config, and omitting them would serve nothing.
`gzip on;` rides along. It costs one line, and nginx ships the module
already.

No CSP header belongs in this file. No other security header belongs
here either, and neither does any cache-control tuning.
`frontend-security-headers` already delivers CSP as a build-time `<meta>`
tag. That tag travels with the static files, regardless of which server
hosts them. A duplicate server-side header here would leave two sources
of truth for one policy.

### Health checks use what each base image already has

The engine's `HEALTHCHECK` calls `GET /readyz` using Bun's own `fetch`:

```
bun -e "const p = process.env.PORT || 3000; fetch('http://localhost:' + p + '/readyz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
```

The port comes from `process.env.PORT`, read inside the `bun -e` script
itself, not a literal `3000`. `startHttpServer` already reads `PORT` the
same way. It falls back to `3000` only when the variable is unset. A
hardcoded literal would break the moment a deployment overrides `PORT`.
The check would then keep polling the wrong port, and report the
container unhealthy.

The command uses no `curl` or `wget`. Neither tool ships in the base
`oven/bun` image. Installing one would add a package purely to run a
health check the runtime can already perform itself. This matches the
repo's existing convention for dependency-free HTTP. `http.request` speaks
REST directly. The `notification.email` design (roadmap #16) speaks SMTP
directly over `Bun.connect`. Both choices avoid an added library for the
same reason.

The frontend's `HEALTHCHECK` runs
`wget --spider -q http://127.0.0.1:8080/`. It targets `127.0.0.1`, not
`localhost`. This base image's `/etc/hosts` resolves `localhost` to `::1`
first. `nginx`'s `listen 8080;` binds IPv4 only.

BusyBox `wget` does not retry a second resolved address on connection
refused. It fails outright against `::1` instead, confirmed empirically
while building this image. `nginx:alpine`-family images ship BusyBox
`wget` already. This needs no added package either.

### Configuration: env vars for the engine, build args for the frontends

The engine image sets no environment variable itself. It reads four
variables from its runtime environment: `DATABASE_URL`,
`AUTH_JWT_SECRET`/`AUTH_ISSUERS`, `CORS_ALLOWED_ORIGINS`, `PORT`. `bun run
serve` already reads the same ones locally. The image never sets
`ALLOW_INSECURE_DEV_AUTH`.

A deployment that forgets `AUTH_JWT_SECRET` fails to start immediately. It
names the missing variable, exactly as `bun run serve` already does
locally. It never falls back to an insecure default silently.

The frontend image accepts `VITE_API_URL` only as a build argument. Vite
inlines `import.meta.env.VITE_API_URL` into the built JavaScript at
`vite build` time. A container runtime env var set on `docker run` would
have no effect on it. The value has to be correct at `docker build` time.
This is a hard constraint of how Vite builds, not a choice this design
makes.

## Risks / Trade-offs

- Baking `VITE_API_URL` into the build means one image per target API
  origin. A staging build and a production build are two separate
  `docker build` invocations, with different `--build-arg VITE_API_URL`
  values. Neither is one image promoted between environments. Mitigation:
  the README's new "Deploy" section documents this. Roadmap stage 18,
  environment promotion, would revisit it if it becomes a real
  bottleneck. It stays out of scope here.
- `nginxinc/nginx-unprivileged` is a community-maintained image. It is not
  the official `nginx` image. Mitigation: the nginx organization's own
  GitHub account maintains it, and many teams already use it.
  Hand-rolling non-root on stock `nginx:alpine` instead would add
  Dockerfile complexity for the same outcome.
- Copying the whole build context into the engine image makes it larger
  than a hand-pruned file list would. Mitigation: accepted for now.
  `.dockerignore` still drops the directories that do not belong in an
  image, `node_modules`, `.git`, `docs`, `.devcontainer`. Revisit only if
  a measured size or attack-surface problem shows up.

## Migration Plan

There is no running deployment to migrate. This change only adds new
files: `docker/engine.Dockerfile`, `docker/frontend.Dockerfile`,
`docker/nginx.conf`, `.dockerignore`, and a README section. Landing it
changes no runtime behavior for the devcontainer or the test suite.

Validation is a manual smoke test, not a schema or data migration.

Build and run the engine image:

```
docker build -f docker/engine.Dockerfile -t workflow-engine:local .
```

Run the result against a real `DATABASE_URL`. Confirm `GET /readyz`
returns `200`.

Build and run each frontend image, once per package:

```
docker build -f docker/frontend.Dockerfile \
  --build-arg PACKAGE=<name> \
  --build-arg VITE_API_URL=http://localhost:3000 \
  -t <name>:local .
```

Repeat this for `app`, `admin`, and `studio`. Run each result. Confirm the
built page loads. Confirm a deep route does not 404.

## Open Questions

- Whether to add a `docker-compose.prod.yml` convenience file, wiring all
  four images together. Deliberately deferred: the proposal scopes this
  change to standalone images. A compose file implies orchestration
  decisions this change does not make: networking, secrets, restart
  policy.
- Whether a later change should add multi-architecture builds, `linux/amd64`
  plus `linux/arm64`. No concrete deployment target has asked for it yet.
