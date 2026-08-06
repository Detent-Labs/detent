# Backup and Restore

One Postgres database backs an entire environment (see CLAUDE.md's
environment-separation convention). A whole-database dump is the backup unit
for this schema, not a per-table one.

`docs/runbooks/deployment.md` covers what a deployment configures, including
the `DATABASE_URL` this runbook reads.

## Backup

Run `pg_dump` in the custom format against the environment's `DATABASE_URL`:

```sh
pg_dump -Fc "$DATABASE_URL" -f backup.dump
```

The custom format compresses the dump. It also supports `pg_restore`'s
selective and parallel restore, if a future need calls for either.

This runbook does not prescribe a schedule or a retention count. Both are
deployment-specific.

## Restore

Stop the engine process first. The outbox worker and timer scheduler both
write to the database continuously. A running engine could commit a
transaction mid-restore and corrupt the restored state.

1. Stop the engine.
2. Restore into the target database:

   ```sh
   pg_restore --clean --if-exists -d "$DATABASE_URL" backup.dump
   ```
3. Restart the engine.

## Verify

Call `GET /readyz` after restart:

```sh
curl -i "http://localhost:${PORT:-3000}/readyz"
```

A 200 response confirms the engine reaches the restored database. A 503
response means the restore needs further investigation.

## Out of scope

- Automated backup scheduling. Deployment-specific; most managed Postgres
  offerings already provide it, or an operator can add a standard OS-level
  scheduler.
- Point-in-time recovery and WAL archiving. No stated recovery-point
  requirement needs this yet.
- Backup-file encryption and off-host storage. The deployment's own storage
  layer already covers this.
- A backup or restore script. `pg_dump` and `pg_restore` already do this job.
