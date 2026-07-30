# backup-restore-runbook Specification

## Purpose

Stage 14 shipped health/readiness endpoints (14a) and production Docker
images (14b). Nothing documented how to back up or restore the one stateful
component, the Postgres database referenced by `DATABASE_URL`. A production
deployment had no defined recovery procedure.

This spec is the contract for `docs/runbooks/backup-restore.md`. It covers
the backup command, the restore sequence, and how an operator confirms a
restore succeeded. No engine code, schema, or script backs this capability.
`pg_dump` and `pg_restore` are the tools. The runbook documents their use
against this engine's schema.

## Requirements

### Requirement: Backup procedure documented

The runbook SHALL document a backup command using `pg_dump` in the custom
(`-Fc`) format. The command SHALL dump the entire database referenced by
`DATABASE_URL`.

#### Scenario: Operator follows the backup step

- **WHEN** an operator runs the documented `pg_dump -Fc` command against
  `DATABASE_URL`
- **THEN** the command produces a single custom-format dump file containing
  every table in that database

### Requirement: Restore procedure documented

The runbook SHALL document a restore procedure that stops the engine process
before running `pg_restore`. It SHALL then restart the engine after the
restore completes.

#### Scenario: Operator follows the restore steps in order

- **WHEN** an operator stops the engine, runs `pg_restore --clean --if-exists
  -d <target> <dump-file>`, then restarts the engine
- **THEN** no engine process writes to the target database during the
  `pg_restore` step

### Requirement: Restore verification documented

The runbook SHALL document calling `GET /readyz` after restart as the step
that confirms the restore succeeded.

#### Scenario: Operator verifies a completed restore

- **WHEN** an operator calls `GET /readyz` after restarting the engine
  post-restore
- **THEN** a 200 response confirms the engine reaches the restored database,
  and a 503 response signals the restore needs further investigation
