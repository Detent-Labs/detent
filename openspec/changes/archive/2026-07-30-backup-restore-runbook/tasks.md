## 1. Runbook

- [x] 1.1 Create `docs/runbooks/` directory if it does not exist.
- [x] 1.2 Write `docs/runbooks/backup-restore.md`: the `pg_dump -Fc` backup
      command against `DATABASE_URL`.
- [x] 1.3 Add the restore steps: stop the engine, run `pg_restore --clean
      --if-exists -d <target> <dump-file>`, restart the engine.
- [x] 1.4 Add the verification step: call `GET /readyz` after restart and
      confirm a 200 response.
- [x] 1.5 Run the antislop linter on the new file and fix any findings.

## 2. Roadmap

- [x] 2.1 Update `ROADMAP.md` stage 14 from IN PROGRESS to DONE, noting
      sub-projects a, b, and c are all DONE.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` in the devcontainer.
- [x] 3.2 Run the full `bun test` suite in the devcontainer with
      `DATABASE_URL` set. Confirm no named test fails. A docs-only change
      should not affect any test outcome.
