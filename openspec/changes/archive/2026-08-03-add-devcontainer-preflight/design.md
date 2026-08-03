## Context

See proposal.md for motivation, and
`specs/devcontainer-preflight/spec.md` for the contract.

Three facts in the tree shape the approach.

The preflight runs on the host. Check 1 asks whether the Docker daemon
answers. No container can answer that. `dev-up.sh` and `dev-up.ps1` already
run on the host for the same reason.

`ALLOW_INSECURE_DEV_AUTH: "1"` sits in `.devcontainer/docker-compose.yml:27`
on purpose, with a comment. The bare container and the test suite start
without auth configuration because of it. `dev-up.sh`'s `bun run serve` line
injects `AUTH_JWT_SECRET` into that process alone.

`.devcontainer/docker-compose.yml` declares no healthcheck for `db` or `app`,
so `docker compose ps` reports only `running` or `exited` for them.
`mailpit`'s upstream image ships its own (`CMD /mailpit readyz`), so it
already reports `healthy` today.

## Goals / Non-Goals

**Goals:**

- One preflight contract, two host implementations, called by both `dev-up`
  and the push gate.
- The push gate reaches the preflight without starting a server.

**Non-Goals:**

- No preflight for the frontend dev ports 5173 to 5175. `dev-up` starts no
  Vite server, so those ports answer only during frontend work.
- No repair action. The preflight reports and names a command. It does not run
  the command.
- No change to what the codebase-memory index holds. Check 6 reads a lock and
  nothing else.

## Decisions

### A third pair of scripts, not inline checks

`scripts/preflight.sh` and `scripts/preflight.ps1` hold the checks and take a
profile argument. `dev-up` calls the `serve` profile. `.githooks/pre-push`
calls `bash scripts/preflight.sh core`.

The alternative was inline checks in each `dev-up` script. The push gate would
then have to call `dev-up`, which restarts the HTTP server. That is the
failure the spec forbids.

A single implementation in TypeScript was the other alternative. It fails
check 1: `bun` lives inside the container, and the container is what check 1
questions.

### `dev-up` calls the `serve` profile last, not first

`dev-up.sh` and `dev-up.ps1` call the `serve` profile after their existing
bring-up steps. The call sits right after restarting the HTTP server, as a
closing confirmation rather than a precondition.

A fresh clone starts with no containers, no secret file, no seed and no
server. The `serve` profile checks all of those. Calling it before the
script's own bring-up work would fail check 2 immediately. The script would
stop before it ever ran `compose up -d`, which defeats the one-command
premise `dev-up` exists for.

The push gate faces the opposite case. It runs against an environment the
developer already brought up. There, the `core` profile is a genuine
precondition, checked first.

### Two host implementations stay

Bash and PowerShell 7 both stay, as `dev-up` has them today. The spec binds
them to one contract, so a scenario tests both rather than one.

Merging them needs a host runtime this project does not need elsewhere. Node
lives on the host here, but nothing in the repo declares that. The push gate
must work on a clone that carries only Git and Docker.

### The signing-secret check reads `/proc`

Check 3 finds the server process inside the container, then reads its
environment:

```
docker compose exec -T app sh -c 'pgrep -f src/http/server.ts'
docker compose exec -T app sh -c 'tr "\0" "\n" < /proc/<pid>/environ'
```

It looks for `AUTH_JWT_SECRET` there. The container environment is the wrong
place to look, per Context above.

### Healthchecks per service

- `db`: `pg_isready -U postgres`. This is the readiness the engine needs.
- `app`: `bun --version`. The devcontainer runs no service of its own, so this
  proves the runtime answers and nothing more.
- `mailpit`: its `/readyz` endpoint on port 8025.

The alternative was to skip healthchecks and probe from the preflight. That
puts the readiness definition in two host scripts instead of one tracked
compose file.

### The seed check counts rows

Check 5 asks the database two questions through `docker compose exec db
psql`:

- does the `definitions` table exist (schema)
- does it hold at least one row, and does `auth_users` hold the demo
  superuser (seed)

`src/engine/store.ts` creates the schema at startup, so a missing table means
the server never started against this database.

### Check 6 probes the lock by opening the file

The WAL sits at `~/.cache/codebase-memory-mcp/<slug>.db-wal`. The preflight
globs the directory rather than building the slug.

Windows holds mandatory file locks, so opening the `.db` for write fails while
another process holds it. That failure is the signal.

`scripts/preflight.sh` runs under Git Bash's MSYS/Cygwin layer. That layer's
own `<>` redirection does not surface the Windows sharing violation.
Measured against a real lock held by the running codebase-memory-mcp
indexer. MSYS's own open succeeds there, where a native Win32 open fails.
The bash script's check 6 therefore shells out to `powershell.exe` on
Windows. It opens the file with .NET's `FileStream` and `FileShare.None`,
which does see the violation.

This detects nothing on Linux and macOS, where locks are advisory. Check 6
warns rather than blocks, so a silent pass there costs nothing. The
implementation carries a `ponytail:` comment naming that ceiling.

### The push gate keeps its ponytail-ledger check

`.githooks/pre-push` currently holds an uncommitted ledger staleness check.
The preflight call goes after it. The ledger check needs no Docker and costs
milliseconds, so it stays first and the cheapest check still reports first.

## Risks / Trade-offs

- Two implementations drift → one spec binds both. A task walks the same
  broken precondition past each script.
- A healthcheck reaches every clone → each probe is a command the image
  already carries. No image gains a dependency.
- `pgrep -f src/http/server.ts` also matches the `exec` wrapper → the check
  reads every match. It passes when any one carries the secret.
- Check 6 passes silently on Linux and macOS → it warns rather than blocks. A
  missed lock costs a confusing MCP failure, not a broken stack.

## Migration Plan

Each clone already runs `git config core.hooksPath .githooks`. The new hook
step needs no further setup.

The healthchecks reach a running stack only after `docker compose up -d`
recreates the containers. The preflight's check 2 fails with `up -d` as its
repair command, which is the same command. A developer with an old container
therefore meets one failure and one command.

## Open Questions

None. This design carried one open question: whether `docker compose ps`'s
text output stays parseable, or check 2 needs a per-container
`docker inspect` fallback. Implementation settled it. `ps --format '{{.Health}}'` alone was enough.
It saw a healthy stack, a stopped `mailpit`, and a from-scratch fresh
clone. It never failed to parse.
