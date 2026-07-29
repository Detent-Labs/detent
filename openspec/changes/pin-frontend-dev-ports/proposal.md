# Pin frontend dev-server ports and widen the devcontainer CORS allowlist

## Why

The devcontainer sets `CORS_ALLOWED_ORIGINS: http://localhost:5173`, with a
comment naming it "Editor Player dev server (Vite default port)". That was
correct when `packages/editor` was the only SPA. There are now four — `app`,
`admin`, `studio`, `editor` — and none pins a port, so Vite auto-increments
from 5173 in start order. Only the first dev server started gets an
`Access-Control-Allow-Origin` header from the engine; the other three are
blocked by the browser, and *which* one works depends on the order the
developer happened to run `bun run dev`. The failure is silent from the
server's side (a preflight from a non-allowlisted origin still answers `204`,
by design) and presents in the browser as an opaque network error, so it
reads as a broken app rather than a missing config entry.

## What Changes

- Each frontend package pins its own dev-server port in its `vite.config.ts`
  (`server.port` plus `strictPort: true`), one distinct port per package:
  `app` 5173, `admin` 5174, `studio` 5175, `editor` 5176.
- `strictPort` makes a taken port fail loudly at startup instead of silently
  sliding to the next one — the silent slide is the actual bug here, and
  without `strictPort` a pinned port only moves the coincidence rather than
  removing it.
- `.devcontainer/docker-compose.yml` lists all four origins in
  `CORS_ALLOWED_ORIGINS`, and its comment stops naming a single app.
- No engine change. `configurable-cors-origins` already implements the
  comma-separated allowlist mode with per-request `Origin` echo and `Vary:
  Origin`; this change only supplies it a correct value.

## Capabilities

### New Capabilities

None. This is configuration for an already-specified mechanism.

### Modified Capabilities

- `development-toolchain`: adds a requirement that each frontend workspace
  package serves on a fixed, distinct, documented dev port, and that the
  devcontainer's CORS allowlist covers every one of them — so a contributor
  can run all four dev servers at once against one engine, in any order,
  without editing configuration.

## Impact

- `packages/app/vite.config.ts`, `packages/admin/vite.config.ts`,
  `packages/studio/vite.config.ts`, `packages/editor/vite.config.ts` — three
  lines each (`server: { port, strictPort: true }`).
- `.devcontainer/docker-compose.yml` — the `CORS_ALLOWED_ORIGINS` value and
  its comment.
- No source file under `src/` or any package's `src/` is touched; no
  dependency added; no test changes (the HTTP wrapper's allowlist behavior is
  already covered by `test/http.test.ts`, and this change does not alter it).
- `packages/editor` is deleted by the future `studio-tools-and-player`
  change; its port entry goes with it, and nothing else has to be revisited
  when that happens.
