## 1. Drop the two port lines from both bring-up scripts

- [x] 1.1 In `scripts/dev-up.ps1`, delete `"127.0.0.1:5174:5174"` and
      `"127.0.0.1:5175:5175"` from the here-string that writes
      `.devcontainer/docker-compose.override.yml`. Keep `3000` and `5173`, and
      keep the mailpit block with its `127.0.0.1` comment
- [x] 1.2 Make the same deletion in the heredoc in `scripts/dev-up.sh`, so the
      two scripts keep writing one file

## 2. Correct the two documents

- [x] 2.1 In `.devcontainer/docker-compose.yml`, rewrite the comment above
      `CORS_ALLOWED_ORIGINS`. It names three dev servers and their ports; one
      package ships a dev server, `packages/web` on 5173. Leave the value
      unchanged
- [x] 2.2 In `docs/current-state.md`, correct the CORS paragraph. It states
      `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175`
      and "the three frontend dev servers ... `app` 5173, `admin` 5174,
      `studio` 5175". Keep the `strictPort: true` reasoning, which still holds
      for the one package that has a port
- [x] 2.3 Leave the historical entries in that file alone. The reporting entry
      from line 1643 says "It arrived as the fourth SPA ... dev port 5176" in
      the past tense, and the entry below it records that those packages are
      deleted. That is the document's chronicle, not a stale claim. Correct
      the present-tense CORS paragraph alone

## 3. Manual verification

- [x] 3.1 Delete `.devcontainer/docker-compose.override.yml`, run
      `pwsh scripts/dev-up.ps1`, and confirm the regenerated file publishes
      3000, 5173 and the mailpit port alone. Confirm the run ends with
      `preflight (serve): all checks passed`
- [x] 3.2 Confirm `bash scripts/dev-up.sh` writes the same file. Compare the
      two generated files rather than reading each one, so a difference cannot
      hide. Normalize the trailing newline first: `dev-up.ps1:38` writes with
      `-NoNewline` and the bash heredoc ends its last line with `\n`, so the
      two files already differ by that one byte. That difference predates this
      change and stays
- [x] 3.3 Start the dev server (`bun run dev -- --host 0.0.0.0` in
      `packages/web`, inside the container) and confirm the host browser still
      reaches it on 5173. The `--host` flag is required: `vite.config.ts` sets
      no `host`, so Vite binds to localhost inside the container and a
      published port reaches nothing

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer
- [x] 4.2 Run the full `bun test` suite in the devcontainer with `DATABASE_URL`
      set, and read the skip count as well as the pass count
- [x] 4.3 Run the antislop linter over `proposal.md`, `design.md`, `tasks.md`
      and `docs/current-state.md`
- [x] 4.4 Run `git diff --check`
