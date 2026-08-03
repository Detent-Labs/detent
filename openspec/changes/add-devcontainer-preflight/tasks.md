## 1. Healthchecks in the compose file

- [x] 1.1 Add a `healthcheck` to the `db` service in
      `.devcontainer/docker-compose.yml`, running `pg_isready -U postgres`
- [x] 1.2 Add a `healthcheck` to the `app` service, running `bun --version`
- [x] 1.3 Add a `healthcheck` to the `mailpit` service, probing `/readyz` on
      port 8025
- [x] 1.4 Recreate the stack and confirm `docker compose ps` reports a health
      state for all three services

## 2. The bash preflight

- [x] 2.1 Create `scripts/preflight.sh`, taking a profile argument of `core`
      or `serve`, exiting non-zero on the first blocking failure
- [x] 2.2 Check 1: the Docker daemon answers. Repair command: start Docker
      Desktop
- [x] 2.3 Check 2: every required container reports healthy. Repair command:
      `docker compose -f .devcontainer/docker-compose.yml up -d`
- [x] 2.4 Check 6: glob `~/.cache/codebase-memory-mcp/*.db-wal` and probe the
      lock by opening the `.db` for write. Warn only, never block. Carry a
      `ponytail:` comment naming the Linux and macOS ceiling.
      Measured during implementation: MSYS/Cygwin bash's own `<>`
      redirection does not surface a Windows sharing violation, so on
      Windows the probe shells out to `powershell.exe` (`FileStream` with
      `FileShare.None`), which does. Confirmed against a real lock held by
      the running codebase-memory-mcp indexer
- [x] 2.5 Check 3: read the server process environment for `AUTH_JWT_SECRET`
      via `pgrep` and `/proc/<pid>/environ`. Do NOT read the container
      environment
- [x] 2.6 Check 4: ports 3000 and 8025 answer on the host. Verified both the
      pass and the fail path (port 3000 temporarily unpublished), for both
      `preflight.sh` and `preflight.ps1`
- [x] 2.7 Check 5: the `definitions` table exists, holds a row, and
      `auth_users` holds the demo superuser
- [x] 2.8 Gate checks 3, 4 and 5 behind the `serve` profile. Confirm the
      `core` profile starts no process

## 3. The PowerShell preflight

- [x] 3.1 Create `scripts/preflight.ps1` with the same six checks, the same
      order, the same two profiles
- [x] 3.2 Confirm it prints the same repair commands as `preflight.sh`, string
      for string. Verified: stopping `mailpit` produces byte-identical check
      2 output from both scripts

## 4. Wire the callers

- [x] 4.1 Call the `serve` profile from `scripts/dev-up.sh`, after its
      existing bring-up steps — right after restarting the HTTP server,
      before the final `Ready:` message — as a closing confirmation, not a
      precondition. The containers, secret, seed and server do not exist yet
      on a fresh clone, so calling it before those steps would fail check 2
      before the script ever runs `compose up -d`. Verified end to end
- [x] 4.2 Call the `serve` profile from `scripts/dev-up.ps1`, at the same
      point — after its existing bring-up steps, not before. Verified end to
      end
- [x] 4.3 Call `bash scripts/preflight.sh core` from `.githooks/pre-push`,
      after the ponytail-ledger check and before `bun run check`
- [x] 4.4 Remove the hook's inline container check, now covered by check 2
- [x] 4.5 Confirm the hook never invokes the `serve` profile

## 5. Verify against the spec's scenarios

- [x] 5.1 Stop the Docker daemon. Confirm the preflight reports check 1, runs
      no later check, and exits non-zero. Verified against both scripts
      without stopping the real daemon: `DOCKER_HOST=tcp://127.0.0.1:1`
      makes the daemon unreachable the same way, with no disruption to
      anything else using Docker on the machine
- [x] 5.2 Bring the stack up with no HTTP server. Confirm the `core` profile
      passes and leaves no server running. Verified for `preflight.sh`
- [x] 5.3 Start the server without `AUTH_JWT_SECRET`. Confirm check 3 fails
      while `ALLOW_INSECURE_DEV_AUTH=1` is still set in the container.
      Verified for `preflight.sh`
- [x] 5.4 Run `dev-up` twice against a prepared stack. Confirm the second run
      changes nothing and passes. Verified for both `dev-up.sh` and
      `dev-up.ps1`, each run twice back to back
- [x] 5.5 Run the same broken precondition past both scripts. Confirm both
      name the same check and print the same command. Verified: stopping
      `mailpit` produces byte-identical check 2 output from both scripts
- [x] 5.6 Rename the codebase-memory cache directory away. Confirm check 6
      passes without a warning. Verified for both scripts by pointing each
      at a directory with no cache present (`HOME` for `preflight.sh`,
      `USERPROFILE` for `preflight.ps1`, since that is what its `$HOME`
      resolves from) rather than renaming the real, shared,
      multi-project cache directory
- [x] 5.7 Run `dev-up` against a genuinely fresh clone: no
      `.devcontainer/docker-compose.override.yml`, no
      `.devcontainer/.auth-secret`, no containers created yet. Confirm it
      completes and reports ready, rather than failing on its own preflight
      call before it has run any bring-up step. Verified for both
      `dev-up.sh` and `dev-up.ps1` against a full `docker compose down -v`
      teardown

## 6. Documentation and the four verification gates

- [x] 6.1 Add a description of the bring-up flow (`dev-up`, the preflight, its
      two profiles) to README.md's Develop section and to
      `docs/current-state.md`. Neither currently documents
      `scripts/dev-up.sh`/`dev-up.ps1` at all — this is new content, not an
      edit to existing prose
- [x] 6.2 Run the antislop linter on every Markdown file this change touched
- [x] 6.3 Run `bun run typecheck` and the full `bun test` with `DATABASE_URL`
      set, inside the container. Report what each printed. Typecheck: engine,
      `form-ui` and `web` all exit 0. Tests: 1652 pass, 0 fail, 4541
      `expect()` calls across 103 files, no skips
- [x] 6.4 Run `git diff --check` on the change. Clean: only the expected
      CRLF-normalization notices, no trailing whitespace or blank-at-eof
- [x] 6.5 Push once with the hook enabled. Confirm the gate runs the preflight
      first and the suite still passes
