# Design

## Context

See proposal.md. Facts this design rests on:

- The server runs Debian 13 with Podman 5.4 from the distribution. The
  developer machine runs Podman 6.1. Quadlet `.pod` units exist from Podman
  5.0, so the units use 5.4's key set.
- The operator already prepared the server. The admin account `debian` keeps
  sudo. The account `detent` has no sudo, holds the SSH key and lingers.
  The setting `net.ipv4.ip_unprivileged_port_start=80` lets a rootless
  container bind 80 and 443. `ufw` admits 22, 80 and 443. Root login and password login
  are off.
- `detent.org` resolves to the server over A and AAAA. `www.detent.org` has no
  record.
- The engine serves the browser bundle from `WEB_ROOT` (`src/http/static.ts`)
  and sends the four security headers itself. The bundle calls the API on its
  own origin when `VITE_API_URL` is unset.
- `deploy/engine.Dockerfile` installs production dependencies only and builds
  no bundle. `deploy/frontend.Dockerfile` builds the bundle behind nginx.
- The server creates its schema at start (`initSchema` in
  `src/http/server.ts`). `scripts/seed.ts` runs only with `SEED_ALLOW=1` and
  creates the known demo accounts.
- The dev pod mounts Postgres at `/var/lib/postgresql`, the parent of the
  versioned data directory, and runs Postgres 18.
- Caddy's `reverse_proxy` ignores incoming `X-Forwarded-*` values unless the
  sender is a trusted proxy (Caddy docs, `reverse_proxy`, "Defaults").
- A cold rootless build of the frontend image took about 11 minutes on the
  developer machine.

## Goals / Non-Goals

**Goals:**

- One command deploys the demo from a checked-out commit.
- The repository holds everything except the generated secrets.
- The demo forgets every visitor change overnight.
- A visitor cannot make the demo reach another host or fill the disk fast.

**Non-Goals:**

- Mail delivery. The template leaves SMTP unset.
- A registry or a CI deploy job. Both can follow once the manual path works.
- Backups. The nightly reset discards the data by design.
- Removing the backfill scripts. A follow-up change retires them with their
  two spec requirements.
- `www.detent.org` and HTTP/3. Neither has a DNS record or a firewall rule.

## Decisions

### D1. The engine image builds and carries the bundle

`deploy/engine.Dockerfile` becomes two stages. The `build` stage copies the
context, runs `bun install --frozen-lockfile` and
`bun run --filter "./packages/web" build`. The final stage keeps today's
steps and adds `COPY --from=build /app/packages/web/dist /app/packages/web/dist`
and `ENV WEB_ROOT=/app/packages/web/dist`, before `USER bun`. The final
`bun install --production --frozen-lockfile` stays. `ENV NODE_ENV=production`
stays before `USER bun`; `test/http-error-path.test.ts` checks that order on
the first match, so the build stage must not set either.

The alternative ran nginx beside the engine on a second origin. It needs
`VITE_API_URL`, CORS and one more container on 2 GB of RAM. The product
targets one origin, so the demo uses it.

### D2. One Quadlet pod with three containers

`deploy/demo/` holds these Quadlet units for `~/.config/containers/systemd/`:

| File | Content |
|---|---|
| `detent-demo.pod` | `PublishPort=80:80` and `PublishPort=443:443` |
| `detent-db.container` | `docker.io/library/postgres:18`, `Pod=detent-demo.pod`, volume `detent-pgdata.volume` at `/var/lib/postgresql`, `EnvironmentFile=%h/.config/detent/db.env`, `POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256` |
| `detent-engine.container` | `localhost/detent-engine:demo`, `Pod=detent-demo.pod`, `EnvironmentFile=%h/.config/detent/engine.env`, `Wants=` and `After=detent-db.service` |
| `detent-caddy.container` | `docker.io/library/caddy:2`, `Pod=detent-demo.pod`, volumes `detent-caddy-data.volume` and `detent-caddy-config.volume`, the `Caddyfile` mounted read-only from `%h/detent/Caddyfile` |
| `*.volume` | one unit per named volume |

Each `.container` unit sets `ContainerName=` to `detent-db`, `detent-engine`
or `detent-caddy`. Quadlet would otherwise name it `systemd-<unit>`, and the
reset script addresses the containers by name.

Each `.container` unit sets `Restart=on-failure` and `RestartSec=5` in its
`[Service]` section. On a first boot the engine can start before Postgres
accepts connections, and `initSchema` then fails. The restart retries it, and
the five-second delay keeps the retries under systemd's start limit. Each
container unit and the pod unit carry `[Install]` with
`WantedBy=default.target`. Starting the pod service starts no container, so
the containers need their own entry to start at boot.

The reset service and timer are plain systemd units. Quadlet does not read
them. They sit in `deploy/demo/systemd/` and go to `~/.config/systemd/user/`.

The engine reaches Postgres at `localhost:5432` inside the pod. Caddy proxies
to `localhost:3000`. The units use `%h`, so no absolute home path lands in a
tracked file.

### D3. Secrets live in two files the setup script writes

`deploy/demo/setup.sh` runs once on the server as `detent`. It creates
`~/.config/detent/db.env` and `~/.config/detent/engine.env` with mode 600, and
only when they do not exist. It writes a random Postgres password into both and
a random `AUTH_JWT_SECRET` into `engine.env`. Each secret is 64 hex characters
from `/dev/urandom`, so it is safe inside `DATABASE_URL` as written. It copies every other line from
`deploy/demo/engine.env.example`. It also runs `systemctl --user enable --now detent-demo-reset.timer`, and it
fails when only one of the two files exists.

`engine.env.example` sets these values and no others:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://postgres:<generated>@localhost:5432/workflow_engine` |
| `AUTH_JWT_SECRET` | `<generated>` |
| `TRUST_PROXY` | `1` |
| `MAX_ATTACHMENT_BYTES` | `1048576` |
| `LOG_LEVEL` | `info` |

`HTTP_ACTION_ALLOWED_HOSTS`, every `SMTP_*`, `CORS_ALLOWED_ORIGINS` and
`ALLOW_INSECURE_DEV_AUTH` stay unset.

### D4. The reset drops the database and seeds again

`deploy/demo/reset.sh` runs as `detent`, in this order:

1. Wait for `podman exec detent-db pg_isready -h localhost -U postgres`, for at
   most 120 s. The `-h localhost` flag forces TCP, since the server that `initdb` runs
   at first boot listens on the unix socket only.
2. `systemctl --user stop detent-engine.service`
3. `podman exec detent-db dropdb -U postgres --if-exists --force workflow_engine`,
   then `createdb -U postgres workflow_engine`
4. `systemctl --user start detent-engine.service`, then poll `/readyz` with
   `podman exec detent-engine bun -e` and a `fetch`, for at most 120 s. A plain
   `podman build` writes the OCI format, which drops the image's `HEALTHCHECK`,
   so the reset does not rely on it.
5. `podman exec -e SEED_ALLOW=1 detent-engine bun run scripts/seed.ts`

`detent-demo-reset.service` runs the script. `detent-demo-reset.timer` fires
it at `*-*-* 03:00:00 UTC` with `Persistent=true`. The first deploy runs the
script once, so the demo starts seeded.

### D5. The deploy script builds locally and ships over SSH

`scripts/deploy-demo.sh <ssh-target>` takes the target as its one argument,
for example `detent@detent.org`. It refuses a dirty tree. The guard ignores
`VERSION`, which the post-commit hook leaves modified. Then it runs:

1. `podman build --format docker -t localhost/detent-engine:demo -f deploy/engine.Dockerfile .`.
   The Docker format keeps the image's `HEALTHCHECK`, so `podman ps` shows
   the engine's health.
2. `podman save localhost/detent-engine:demo | ssh <target> podman load`
3. Run `mkdir -p` over SSH for `~/.config/containers/systemd`,
   `~/.config/systemd/user` and `~/detent`. Then copy over `scp`. The Quadlet
   units go to the first directory. The reset service and timer go to the
   second. The `Caddyfile`, the template and the two scripts go to the third.
4. Test over SSH whether `~/.config/detent/engine.env` is missing. Exit 0 means
   a first deploy. Exit 1 means a later one. Any other exit, such as the 255 of
   a failed connection, aborts the script. On a first deploy, run `setup.sh`.
5. On the server: `systemctl --user daemon-reload`, then
   `systemctl --user restart` for `detent-demo-pod.service`, `detent-db.service`,
   `detent-engine.service` and `detent-caddy.service`. The container units bind
   to the pod, but starting the pod starts none of them.
6. On a first deploy only, run `reset.sh`.

### D6. Tests lint the definition

A new `test/demo-deployment.test.ts` reads the files in `deploy/demo/`. Its
rules:

- The template matches the D3 table. Secrets hold placeholders, and the four
  forbidden variables are absent.
- No unit names a `latest` tag.
- Each container unit sets `ContainerName=` and `Restart=on-failure`.
- The pod unit carries `WantedBy=default.target`.
- The database unit mounts `/var/lib/postgresql`.
- The `Caddyfile` names `detent.org` and proxies to `localhost:3000`.
- `reset.sh` sets `SEED_ALLOW=1`, and the timer runs daily.

A second test checks D1 against `deploy/engine.Dockerfile`. The final stage
copies the bundle and sets `WEB_ROOT`. Each rule in both tests gets a fixture
that breaks it.

### D7. The Quadlet generator checks the units

`/usr/lib/podman/quadlet -dryrun -user` runs over `deploy/demo/` on the
developer machine. After the first deploy,
`/usr/libexec/podman/quadlet -dryrun -user` runs on the server too, since the
server's Podman is older.

## Risks / Trade-offs

- [A visitor fills the 20 GB disk with uploads] → Uploads stop at 1 MiB, and
  the nightly reset frees the space. A determined visitor can still upload
  many files in one day. The runbook names `df -h` and a manual `reset.sh` as
  the response.
- [A visitor changes a demo password] → Other visitors lose that login until
  the reset. That is the price of known logins.
- [2 GB of RAM runs short] → The runbook adds a 2 GB swap file during
  preparation. The image builds stay off the server.
- [Podman 5.4 rejects a key Podman 6.1 accepts] → D7 runs the generator on
  the server as well.
- [Caddy's default changes in a later 2.x release] → The image pins major 2,
  and the trust behavior is the documented default.

## Migration Plan

1. Implement and verify on `deploy-demo-on-podman`, sync, archive, merge.
2. Run the first deploy against `detent@detent.org`, with the owner's go.
3. Rollback: `systemctl --user stop detent-demo-pod.service` on the server.

## Open Questions

None.
