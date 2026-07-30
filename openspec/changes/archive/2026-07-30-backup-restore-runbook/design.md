## Context

Roadmap #14c, the last sub-project of Stage 14 (Deployment & operations
readiness). Stage 14a shipped health and readiness endpoints. Stage 14b
shipped production Docker images. Neither documents how to back up or restore
the one stateful component: the Postgres database.

One database backs an entire environment (the existing environment-separation
convention, CLAUDE.md, Roadmap #11). Everything durable lives in that one
Postgres instance: `definitions`, `instances`, `history_entries`,
`instance_events`, `outbox`, `auth_users`, `migration_plans`, `drafts`. A
whole-database dump is the correct backup unit. Backing up a subset of these
tables would leave the rest inconsistent on restore.

This design is already approved; see
`docs/superpowers/specs/2026-07-30-backup-restore-runbook-design.md`. This
document restates it for the OpenSpec change record.

## Goals / Non-Goals

**Goals:**
- Document a backup command against `DATABASE_URL`.
- Document a restore procedure that stops the engine first, so no writer
  commits mid-restore.
- Document a verification step using the existing `/readyz` endpoint.

**Non-Goals:**
- Automated backup scheduling. Deployment-specific; most managed Postgres
  offerings already provide it, or an operator can add a standard OS-level
  scheduler.
- Point-in-time recovery and WAL archiving. No stated recovery-point
  requirement needs this yet.
- Backup-file encryption and off-host storage. The deployment's own storage
  layer already covers this.
- A backup or restore script. `pg_dump` and `pg_restore` already do this job.
  Wrapping them adds indirection with no behavior change.

## Decisions

- **Whole-database `pg_dump -Fc`, not a per-table dump.** The custom format
  compresses the dump. It also supports `pg_restore`'s selective and parallel
  restore if a future need calls for either. A per-table backup would risk an
  inconsistent restore across `instances` and its dependent tables.
- **Restore stops the engine first.** The outbox worker and timer scheduler
  both write to the database continuously. A worker could commit a
  transaction mid-restore and corrupt the restored state. Run `pg_restore
  --clean --if-exists -d <target> <dump-file>`, then restart the engine.
- **Verify with the existing `/readyz` endpoint (Stage 14a), not a new
  check.** It already confirms the engine reaches the database. Reusing it
  needs no new code.
- **Runbook, not a script.** `pg_dump`/`pg_restore` are the standard tools.
  This task documents their use for this schema; it does not wrap them.

## Risks / Trade-offs

- [No automated schedule] → an operator must configure scheduling themselves.
  Documented as a non-goal; the runbook names this explicitly so it is not
  mistaken for automatic coverage.
- [No point-in-time recovery] → a restore only recovers to the last dump.
  Acceptable until a tighter recovery-point requirement exists; documented as
  a non-goal.
- [Manual restore step order] → running `pg_restore` before stopping the
  engine could corrupt the restore. Mitigation: the runbook states the
  stop-before-restore rule as the first restore step, not an aside.

## Migration Plan

No engine or schema migration. Deployment steps:
1. Add `docs/runbooks/backup-restore.md` with the backup, restore, and
   verification procedure.
2. Change `ROADMAP.md` stage 14 to DONE once the file lands.

No rollback needed beyond removing the file; nothing depends on it existing.

## Open Questions

None. The approved design (see Context) resolved the open questions raised
during brainstorming.
