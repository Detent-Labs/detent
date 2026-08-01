<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## Why

An installation must present itself as one system at one address. Today the
engine serves only JSON: `src/http/` has no static route, so every browser
package exists either as a dev server on its own port or as a separate nginx
container built from `docker/frontend.Dockerfile`. Both models put the browser
assets on a different origin from the API.

This change gives the engine the ability to serve a built frontend from its own
origin. It is step 0 of ROADMAP.md item 12 (unified shell) and the only backend
change that item needs. It ships alone, before any frontend package moves, and
is tested against a fixture directory rather than a real build.

## What Changes

- The HTTP wrapper gains a static-asset fallthrough at the terminal 404 in
  `src/http/server.ts`, behind every API route. No URL prefix is reserved, so a
  later API route needs no special case.
- The fallthrough answers `GET` and `HEAD` only. Every other method keeps the
  JSON 404.
- An existing file under the configured root is served with its content type and
  `Cache-Control: max-age=31536000, immutable`, since Vite hashes asset names.
  Any other `GET`/`HEAD` path falls back to `index.html` with `Cache-Control:
  no-cache`, which is what the browser History API needs.
- The root comes from `WEB_ROOT`, defaulting to a path relative to
  `import.meta.dir`. An absent directory means the branch is skipped: the engine
  runs unchanged with no built frontend, which stays a supported configuration
  because a reverse proxy may serve the assets instead.
- The resolved path must stay under the root. This is a trust boundary and gets
  its own test for `..` and its encoded forms.
- No redirect is added at `/`. The engine must not need to know its own outward
  address.

## Capabilities

### New Capabilities

- `web-asset-serving`: the engine's static-file fallthrough — method and path
  resolution, the containment boundary, cache headers, the `index.html`
  fallback, and the absent-root behaviour.

### Modified Capabilities

- `http-wrapper`: the terminal unmatched-route response is no longer
  unconditionally a JSON 404. For `GET` and `HEAD` it now defers to
  `web-asset-serving` first.

## Impact

- `src/http/server.ts`: the terminal 404 becomes a fallthrough call.
- New module under `src/http/` holding the resolution and containment logic, so
  it is testable without a port.
- New test file covering method gating, containment, cache headers, the
  `index.html` fallback and the absent-root skip, against a fixture directory.
- New environment variable `WEB_ROOT`, optional.
- Unchanged: `production-docker-images` (the nginx frontend image keeps working
  as it does today), `frontend-security-headers` (the policy stays a build-time
  `<meta>` tag), CORS handling, and every existing route.
