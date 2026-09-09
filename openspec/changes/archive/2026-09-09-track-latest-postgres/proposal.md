## Why

The devcontainer pins `postgres:16`, and PostgreSQL 16 is now two majors behind.
Nothing runs this engine yet, so no stored data pins that major. The owner wants
the newest server during the development cycle. A specific version gets chosen
later, once there is something to freeze for.

## What Changes

- The `db` service in `.devcontainer/docker-compose.yml` carries the tag
  `postgres:latest` in place of `postgres:16`. That file is the sole pin, and CI
  brings up the same file, so one edit moves both.
- The `db` volume mount moves to `pgdata:/var/lib/postgresql`. That parent is
  the image's declared `VOLUME` on 18, and the old path stops being the data
  directory there. Without this the 18 entrypoint exits 1 at startup.
- **BREAKING** for every existing checkout. The jump crosses two majors, and a
  `pgdata` volume written by 16 will not start under 18. Each worktree drops its
  volume once and reseeds. CI keeps no volume and needs nothing.
- Four source comments date their claims to Postgres 16.15. Each one gets
  re-verified against the new server, and its version stamp updated where the
  behavior still holds.
- Six documentation sites name the version. Each moves to the floating tag.

### The accepted risk

A floating tag is not reproducible. PostgreSQL 19 is due within weeks. On the
next pull after that release, the tag flips, and every `pgdata` volume stops
loading at a moment nobody picked. CI turns red with no commit to blame.

The owner saw that tradeoff against `postgres:18` and chose the floating tag.
This proposal records the risk rather than reopening it. The exit is one line in
one file, whenever the freeze happens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `persistence`: the development-database scenario names PostgreSQL 16 as the
  running service. It stops naming a major and requires the latest release
  instead. A third scenario pins that the database survives a restart.
- `development-toolchain`: the SMTP-catcher requirement pins its image with a
  pronoun that sits beside the Postgres service. It names the catcher instead.

## Impact

Devcontainer and CI:

- `.devcontainer/docker-compose.yml`: the image tag, the volume mount, and the
  header comment.
- `.devcontainer/devcontainer.json`: the comment describing the `db` service.
- `.github/workflows/check.yml`: no edit. It already reads the compose file.
- `test/worktree-env.test.ts`: two asserts guarding the mount and the tag. The
  bring-up is manual, so nothing else catches a revert before it reaches a
  machine.

Source comments that record measured 16.15 behavior:

- `src/engine/store.ts`: a `(body->>'startedAt')::timestamptz` cast that raises,
  and two claims about role membership and the creator's admin option.
- `src/runtime/api.ts`: an int4 out-of-range claim.
- `test/runtime-api.test.ts`: the same cast, asserted.

Documentation:

- `openspec/specs/persistence/spec.md` and
  `openspec/specs/development-toolchain/spec.md`, both through delta specs at
  archive time.
- `openspec/config.yaml`, `CLAUDE.md` (two sites), `THIRDPARTY.md`.

Out of scope, left alone: `docs/CODE_REVIEW-*.md` and
`openspec/changes/archive/**`. Both record what was true on their date.

The gate is a full `bun test` with `DATABASE_URL` set, against the new server.
It is what tells us whether the four measured claims survive the jump.
