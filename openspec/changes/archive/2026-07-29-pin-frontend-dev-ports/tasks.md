## 1. Pin each frontend's dev-server port

- [x] 1.1 Add `server: { port: 5173, strictPort: true }` to
  `packages/app/vite.config.ts`
- [x] 1.2 Add `server: { port: 5174, strictPort: true }` to
  `packages/admin/vite.config.ts`
- [x] 1.3 Add `server: { port: 5175, strictPort: true }` to
  `packages/studio/vite.config.ts`
- [x] 1.4 Add `server: { port: 5176, strictPort: true }` to
  `packages/editor/vite.config.ts`

## 2. Widen the devcontainer CORS allowlist

- [x] 2.1 In `.devcontainer/docker-compose.yml`, set `CORS_ALLOWED_ORIGINS`
  to the four assigned origins, comma-separated with no spaces:
  `http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176`
- [x] 2.2 Replace the comment above it: it must name the frontend dev servers
  as a set and state the package↔port mapping, not "Editor Player dev server"
- [x] 2.3 Confirm the value still parses as the allowlist form and not the
  wildcard — `server.ts`'s `CORS_ALLOWED_ORIGINS` handling splits on `,`, so
  stray whitespace or a trailing comma would produce an origin that never
  matches

## 3. Verify the fix does what it claims

- [x] 3.1 Restart the devcontainer's `app` service so `startHttpServer`
  re-reads `CORS_ALLOWED_ORIGINS` (it is read once at process start)
- [x] 3.2 Start all four dev servers and confirm each binds its assigned
  port regardless of start order
- [x] 3.3 For each of the four origins, confirm the engine answers a
  cross-origin request with `Access-Control-Allow-Origin` echoing that origin
  plus `Vary: Origin` — a `curl`-equivalent with an `Origin` header against
  the running engine is sufficient; a browser is not required
- [x] 3.4 Confirm an origin outside the list (e.g. `http://localhost:9999`)
  still receives no `Access-Control-Allow-Origin` header
- [x] 3.5 Confirm `strictPort` behaves: occupy one assigned port, start that
  package's dev server, and observe it exit with a port-in-use error instead
  of binding a different port

## 4. Documentation

- [x] 4.1 Record the package↔port mapping in `docs/current-state.md`'s CORS
  entry, which currently states only `CORS_ALLOWED_ORIGINS=http://localhost:5173`
  and calls it "the editor's Vite dev server"

## 5. Verification

- [x] 5.1 Run `bun run typecheck` from the repo root (engine plus every
  workspace member) and confirm it passes
- [x] 5.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the
  repo root, and confirm it passes — never a single-file rerun; check the
  skip count, not only the pass count, since the DB-backed suites are
  `test.skipIf(!DB)` and skip silently without the variable
