## Why

`scripts/dev-up.ps1` and `scripts/dev-up.sh` write a compose override that
publishes 5173, 5174 and 5175. Two of those three lead nowhere.

5174 belonged to `packages/admin` and 5175 to `packages/studio`. The
`consolidate-frontend-shell` change merged those packages, `packages/app` and
`packages/editor` into one `packages/web` on 5173. The workspace now holds
`packages/web` and `packages/form-ui`, and only the first ships a dev server.
`packages/web/vite.config.ts:35` pins 5173 with `strictPort: true`. No second
port has an owner.

Two documents still describe the old world. They send a reader looking for a
dev server that no package can start.

## What Changes

- The compose override that both bring-up scripts write publishes 5173 alone.
  The two dead port lines go.
- The comment in `.devcontainer/docker-compose.yml` above
  `CORS_ALLOWED_ORIGINS` stops naming "the three frontend dev servers ... app
  5173, admin 5174, studio 5175". One package ships a dev server.
- The paragraph in `docs/current-state.md` stops claiming that the `app`
  service sets
  `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175`.
  The compose file sets `http://localhost:5173`, and has since the
  consolidation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `openspec/specs/development-toolchain/spec.md:117-130` already assigns
one port to one package, `packages/web` to 5173, and states that exactly one
package ships a dev server. The behavior this change removes was never
specified. The change sets `skip_specs: true`.

## Impact

- `scripts/dev-up.ps1` and `scripts/dev-up.sh`, the heredoc that writes
  `.devcontainer/docker-compose.override.yml`.
- `.devcontainer/docker-compose.yml`, the comment above
  `CORS_ALLOWED_ORIGINS`. The value stays as it is.
- `docs/current-state.md`, the CORS paragraph.
- No engine, schema, HTTP or UI code, and no test.
- Preflight check 4 stays as it is. It probes 3000 and 8025 alone
  (`scripts/preflight.sh:59`), never a frontend dev port, because `dev-up`
  starts no dev server.
- A developer with an existing `.devcontainer/docker-compose.override.yml`
  keeps their stale copy: both scripts write the file only when it is missing.
