## Why

The 2026-08-01 code review (`docs/CODE_REVIEW.md`) found five weak points at
the HTTP boundary. Each one is a few lines in `src/http/`. Each one weakens a
control the rest of the system already holds.

The worst one is the attachment download. The route
`POST /instances/:id/attachments` takes any `contentType` string up to 255
characters and stores it unchanged. On download, that value becomes the
response `content-type`, and nothing else goes with it: no
`Content-Disposition`, no `X-Content-Type-Options`. Any actor who may read an
instance can upload `{"filename":"x.html","contentType":"text/html",
"dataBase64":"<a base64 script>"}`. The upload gives them a URL on the API
origin that runs it. A `contentType` that holds a CR or an LF byte also makes
`new Response()` throw, which turns a valid download into a 500.

The other four are smaller and share one shape. A control exists, and something
outside the code can switch it off:

- `Number()` reads `MAX_ATTACHMENT_BYTES`. A value of `"5MB"` gives `NaN`, every
  comparison against `NaN` is false, and the limit stops applying. The operator
  who tries to tighten the bound loosens it instead.
- The route `GET /metrics` answers before any actor resolution. It runs three
  aggregate queries against the live database on every scrape. It reports
  backlog, dead-letter count, faulted instances and timer lag to anyone who
  asks.
- The JSON envelope carries no `Cache-Control`. An instance view holds personal
  data, and any intermediary may cache it.
- The parser `parseLimit` takes any positive integer. The cap lives in
  `src/runtime/api.ts`. A later list route that reads `limit` and forgets to
  clamp gets no bound from the layer that parsed the value.

## What Changes

- The upload route matches `contentType` against a MIME-token pattern. It
  rejects anything else as a request-shape error. This closes the CR/LF 500
  too.
- The download route sends `Content-Disposition: attachment` with the stored
  filename, and `X-Content-Type-Options: nosniff`. The bytes arrive as a
  download, never as a document.
- The module validates `MAX_ATTACHMENT_BYTES` when it loads, the way
  `parseRetentionDays` in `src/engine/host.ts` already reads
  `DATA_RETENTION_DAYS`. A malformed value stops the process. It no longer
  removes the limit.
- **BREAKING** for a deployment that scrapes metrics: `GET /metrics` needs a
  bearer token equal to `METRICS_TOKEN`, compared in constant time. The server
  leaves the route unregistered when that variable is unset, so a default
  deployment exposes nothing. The probes `/livez` and `/readyz` stay public,
  because a probe is not a query.
- Every JSON response carries `Cache-Control: no-store`.
- The parser `parseLimit` clamps to the caller's maximum at the HTTP boundary.
  The `Math.min` in `src/runtime/api.ts` stays, so both layers hold the bound.

Out of scope, and named here so the reason survives. The review's ARCH-2 asks
for an `AttachmentStore` seam, so that files can move out of Postgres later.
Nothing measures file volume as a cost today. An interface with one
implementation is the abstraction this repository does not build ahead of need.
The 5 MB per-file bound holds the exposure until volume gives the seam a reason
to exist.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-wrapper`: the upload requirement gains a `contentType` format rule. The
  download requirement gains the two response headers. A new requirement covers
  `Cache-Control` on the JSON envelope.
- `observability`: the metrics endpoint leaves its unauthenticated tier and
  becomes conditional on `METRICS_TOKEN`.

## Impact

- `src/http/routes.ts`: `attachmentBodySchema`, the `MAX_ATTACHMENT_BYTES`
  parse, `parseLimit`.
- `src/http/server.ts`: `toBinaryResponse`, `toResponse`, the `/metrics` branch.
- `src/http/errors.ts`: `HttpBinaryResult` gains an optional `filename`, so
  the download carries a header the metrics scrape does not.
- `src/runtime/api.ts`: `getAttachment` already returns `filename`. The download
  handler passes it through instead of dropping it.
- `docs/openapi.yaml`: the attachment routes and `/metrics`.
- `docs/current-state.md`: the attachment routes and the metrics endpoint.
- One new environment variable, `METRICS_TOKEN`, and a stricter
  `MAX_ATTACHMENT_BYTES`. Both need an entry wherever this repository records
  deployment configuration.
- Tests: `test/http.attachments.test.ts` and the observability suite.
