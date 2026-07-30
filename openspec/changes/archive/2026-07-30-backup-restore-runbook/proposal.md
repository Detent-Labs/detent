## Why

Stage 14 shipped health/readiness endpoints (14a) and production Docker images
(14b). Nothing yet documents how to back up or restore the one stateful
component: the Postgres database. A production deployment has no defined
recovery procedure today. The design for this gap is already approved
(`docs/superpowers/specs/2026-07-30-backup-restore-runbook-design.md`).

## What Changes

- Add `docs/runbooks/backup-restore.md`: a runbook covering backup
  (`pg_dump -Fc` against `DATABASE_URL`), restore (stop the engine, `pg_restore
  --clean --if-exists -d <target> <dump-file>`, restart), and verification
  (`GET /readyz`).
- No engine code change, no schema change, no new script. `pg_dump` and
  `pg_restore` are the tools. The runbook documents their use for this schema.
- Closes Stage 14 (a, b, c all DONE) once the file lands.

## Capabilities

### New Capabilities
- `backup-restore-runbook`: documents the backup, restore, and verification
  procedure for the engine's Postgres database.

### Modified Capabilities
(none: no existing spec's requirements change)

## Impact

- Affected: `docs/runbooks/backup-restore.md` (new file), `ROADMAP.md` (stage
  14 status change once implemented).
- No affected code, APIs, or dependencies. Documentation-only.
