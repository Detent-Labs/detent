## 1. Healthchecks in the compose file

- [ ] 1.1 Add a `healthcheck` to the `db` service in
      `.devcontainer/docker-compose.yml`, running `pg_isready -U postgres`
- [ ] 1.2 Add a `healthcheck` to the `app` service, running `bun --version`
- [ ] 1.3 Add a `healthcheck` to the `mailpit` service, probing `/readyz` on
      port 8025
- [ ] 1.4 Recreate the stack and confirm `docker compose ps` reports a health
      state for all three services

## 2. The bash preflight

- [ ] 2.1 Create `scripts/preflight.sh`, taking a profile argument of `core`
      or `serve`, exiting non-zero on the first blocking failure
- [ ] 2.2 Check 1: the Docker daemon answers. Repair command: start Docker
      Desktop
- [ ] 2.3 Check 2: every required container reports healthy. Repair command:
      `docker compose -f .devcontainer/docker-compose.yml up -d`
- [ ] 2.4 Check 6: glob `~/.cache/codebase-memory-mcp/*.db-wal` and probe the
      lock by opening the `.db` for write. Warn only, never block. Carry a
      `ponytail:` comment naming the Linux and macOS ceiling
- [ ] 2.5 Check 3: read the server process environment for `AUTH_JWT_SECRET`
      via `pgrep` and `/proc/<pid>/environ`. Do NOT read the container
      environment
- [ ] 2.6 Check 4: ports 3000 and 8025 answer on the host
- [ ] 2.7 Check 5: the `definitions` table exists, holds a row, and
      `auth_users` holds the demo superuser
- [ ] 2.8 Gate checks 3, 4 and 5 behind the `serve` profile. Confirm the
      `core` profile starts no process

## 3. The PowerShell preflight

- [ ] 3.1 Create `scripts/preflight.ps1` with the same six checks, the same
      order, the same two profiles
- [ ] 3.2 Confirm it prints the same repair commands as `preflight.sh`, string
      for string

## 4. Wire the callers

- [ ] 4.1 Call the `serve` profile from `scripts/dev-up.sh`, before its
      bring-up steps
- [ ] 4.2 Call the `serve` profile from `scripts/dev-up.ps1`, at the same
      point
- [ ] 4.3 Call `bash scripts/preflight.sh core` from `.githooks/pre-push`,
      after the ponytail-ledger check and before `bun run check`
- [ ] 4.4 Remove the hook's inline container check, now covered by check 2
- [ ] 4.5 Confirm the hook never invokes the `serve` profile

## 5. Verify against the spec's scenarios

- [ ] 5.1 Stop the Docker daemon. Confirm the preflight reports check 1, runs
      no later check, and exits non-zero
- [ ] 5.2 Bring the stack up with no HTTP server. Confirm the `core` profile
      passes and leaves no server running
- [ ] 5.3 Start the server without `AUTH_JWT_SECRET`. Confirm check 3 fails
      while `ALLOW_INSECURE_DEV_AUTH=1` is still set in the container
- [ ] 5.4 Run `dev-up` twice against a prepared stack. Confirm the second run
      changes nothing and passes
- [ ] 5.5 Run the same broken precondition past both scripts. Confirm both
      name the same check and print the same command
- [ ] 5.6 Rename the codebase-memory cache directory away. Confirm check 6
      passes without a warning

## 6. Documentation and the four verification gates

- [ ] 6.1 Update `README.md` and `docs/current-state.md` where they describe
      the bring-up
- [ ] 6.2 Run the antislop linter on every Markdown file this change touched
- [ ] 6.3 Run `bun run typecheck` and the full `bun test` with `DATABASE_URL`
      set, inside the container. Report what each printed
- [ ] 6.4 Run `git diff --check` on the change
- [ ] 6.5 Push once with the hook enabled. Confirm the gate runs the preflight
      first and the suite still passes
