## Why

The bundle carries a Content-Security-Policy, delivered as a `<meta
http-equiv>` tag that `packages/web/vite.config.ts` injects. Three directives
do not work that way. Per the CSP specification, a browser ignores
`frame-ancestors`, `report-uri` and `sandbox` in a meta tag. It honors them
only as an HTTP response header. So `frame-ancestors 'none'` in these builds
does nothing at all.

Neither path that serves the bundle repairs it. The engine's own static
branch (`src/http/static.ts`) sets `content-type` and `cache-control`, and no
other header. The `docker/nginx.conf` server block sets no security header
either. Its own comment records that it replaces the base image's block
entirely, so it inherits nothing.

The result is that a page can frame the studio and the admin area from any
origin. Both are click-to-act interfaces over destructive operations. They
publish a version, run a migration, disable a user, redact an instance and
cancel an instance. That list is the clickjacking target profile.

Two more headers are missing on the same responses, for the same reason.
Nothing sends `X-Content-Type-Options`, so a browser may sniff a served file
into a type the server did not declare. Nothing sends `Referrer-Policy`, so
an instance id in a URL travels to any origin the page reaches.

The 2026-08-01 code review (`docs/CODE_REVIEW.md`) records this as SEC-4.

## What Changes

- Both serving paths send four response headers with every document and every
  asset: `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`.
- The meta policy drops `frame-ancestors`, and the plugin's doc comment says
  where that directive now lives. An inert directive that reads as protection
  is what this change exists to remove.
- The meta policy keeps every directive a meta tag does honor:
  `default-src`, `script-src`, `style-src`, `img-src`, `connect-src`,
  `object-src`, `base-uri` and `form-action`. The response header carries
  `frame-ancestors` alone. The two policies restrict different things, so
  they cannot intersect into a broken page.

Out of scope, and named so the reason survives. The review's SEC-8 asks
`docker/nginx.conf` to normalize `X-Forwarded-For`. That block holds no
`proxy_pass`: it serves static files and forwards nothing. A deployment that
fronts the engine with its own proxy owns that setting. The deployment
runbook is where it belongs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-security-headers`: the meta policy loses `frame-ancestors`, and a
  new requirement covers the response headers both serving paths send.
- `web-asset-serving`: the engine's static responses carry the four headers.
- `production-docker-images`: the frontend image's server block sends the
  same four.

## Impact

- `packages/web/vite.config.ts`: the policy list and the plugin's comment.
- `src/http/static.ts`: `fileResponse`, and the fallback path that shares it.
- `docker/nginx.conf`: four `add_header` directives with `always`.
- `docs/current-state.md`: the static-serving and CSP entries.
- Tests: `test/http-static.test.ts` asserts the four headers, and
  `packages/web/test/vite-config.test.ts` inverts its `frame-ancestors`
  assertion.
