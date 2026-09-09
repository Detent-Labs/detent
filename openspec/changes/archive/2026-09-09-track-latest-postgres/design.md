## Context

See proposal.md for motivation. What shapes the approach is one measured fact
about the official image, which the proposal does not carry.

The `db` service mounts its named volume at a literal path:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```

That path is `PGDATA` on `postgres:16`. It stops being `PGDATA` on
`postgres:18`, which `postgres:latest` resolves to today. Read from the image
metadata on Docker Hub:

| Tag | `PGDATA` | Declared `VOLUME` |
| --- | --- | --- |
| `postgres:16` | `/var/lib/postgresql/data` | `/var/lib/postgresql/data` |
| `postgres:17` | `/var/lib/postgresql/data` | `/var/lib/postgresql/data` |
| `postgres:18` | `/var/lib/postgresql/18/docker` | `/var/lib/postgresql` |

So the tag on its own stops the container. The 18 entrypoint checks whether
`/var/lib/postgresql/data` is a mount, and exits 1 when it is. The message
names this exact fix: "place a single mount at `/var/lib/postgresql`".

The data survives. It sits in the named volume, unread, while the stack refuses
to start. The tag alone is therefore not the whole change. The mount path is
the other half.

Corrected after archiving. This section first claimed the tag alone loses the
database in silence. That reading came from the image's `PGDATA` and `VOLUME`
metadata rather than a run. Running it gives exit 1 in all three cases tried.
Those are an empty volume, one written by 16, and 16 opening a volume written
by 18.

## Goals / Non-Goals

**Goals:**

- The devcontainer and CI both run the latest released PostgreSQL.
- The volume mount survives the next major untouched, because a floating tag
  gives no warning before it moves.
- The four comments dated to 16.15 say something true about the server that is
  running.

**Non-Goals:**

- Preserving any local database contents across the jump. Nothing here is
  authoritative, and `scripts/seed.ts` rebuilds what a demo needs.
- Reproducible builds. The proposal records that trade as accepted.
- An upgrade path for a populated cluster. No deployment exists, so `pg_upgrade`
  and dump-and-restore have nothing to carry.

## Decisions

### The mount moves to the parent directory

`- pgdata:/var/lib/postgresql` replaces `- pgdata:/var/lib/postgresql/data`.

The image declares that parent as its volume on 18. A cluster therefore lands
beneath it whatever subdirectory a major picks, and 18 picks `18/docker`. One
mount holds 16, 18 and whatever path 19 chooses, with none of it written into
the compose file.

We measured 18 alone. The mount therefore rests on the declared volume rather
than on that subdirectory scheme. The next major is then safe to meet unread.

Alternatives:

- Mount `/var/lib/postgresql/18/docker` directly. This encodes the major in a
  path, under a tag chosen precisely so the major can move. The next release
  breaks it the way the current mount breaks now.
- Set `PGDATA=/var/lib/postgresql/data` in the service environment and keep the
  mount. This works, and it fights the image rather than following it. It also
  leaves the repository carrying a workaround whose reason lives two majors back.

### Every 16.15 claim gets executed against the new server

Four comments assert server behavior and date the assertion:

| Site | Claim |
| --- | --- |
| `src/engine/store.ts` | `(body->>'startedAt')::timestamptz` raises in a generated column |
| `src/engine/store.ts` | SET does not come with membership alone, and the creator already holds admin option |
| `src/runtime/api.ts` | A value past int4 raises on the `::int` cast |
| `test/runtime-api.test.ts` | The same cast, asserted as a test |

All four look likely to hold on 18. That is a prediction, and the comments record
measurements. Each one gets its statement run against the live server, and the
result written down. The full suite is the gate, and it covers the third and
fourth claims directly.

### The comments keep a version stamp

A floating tag makes the stamp worth more. It tells a later reader which server
produced the claim. They can then see whether the server has moved past it. Each
stamp becomes the version the new server reports.

## Risks / Trade-offs

**The tag flips to 19 unannounced.** Accepted in proposal.md. The parent mount
above means the flip costs a reseed rather than a broken compose file.

**Dropping `pgdata` destroys local demo state.** Unavoidable, since the jump
crosses two majors either way. `bun run seed` rebuilds it. Anyone mid-demo
finishes first.

**A claim may not survive 18.** Then the suite goes red on a named test, which is
the signal we want. A behavioral difference becomes its own finding. A fix that
reaches past a comment becomes its own change rather than riding along here.

**Other checkouts break until each drops its volume.** Every worktree runs its
own devcontainer, so every one carries a stale `pgdata`. The tasks say so, and
the mount move makes each one loud.

## Migration Plan

Per checkout, in order:

1. `docker compose -f .devcontainer/docker-compose.yml down`
2. Remove the stale volume. It is `${COMPOSE_PROJECT_NAME}_pgdata`, and
   `scripts/worktree-env.sh` establishes that variable per checkout. A machine
   with worktrees lists one such volume each, so deriving the name beats
   picking one from `docker volume ls`.
3. Apply the tag and the mount path.
4. `bash scripts/dev-up.sh`, which brings the stack up, installs, seeds with
   `SEED_ALLOW=1`, creates the demo superuser and runs the preflight.
5. Stop the server that script started, since a live poller claims outbox rows
   the suite drives.
6. The full `bun test` with `DATABASE_URL` set.

CI does not need any of this. It brings the stack up from nothing on every run
and keeps no volume.

Rollback is the same list with `postgres:16` and the old mount path restored,
plus one more volume removal. Skipping that removal fails loudly. Postgres 16
finds the volume root holding 18's own `18/` subdirectory. Initdb then stops
with "directory ... exists but is not empty", and the container exits 1.

## Open Questions

None. The tag is the owner's decision, and the mount path follows from the image
metadata above.
