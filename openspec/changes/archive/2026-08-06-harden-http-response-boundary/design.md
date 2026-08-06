## Context

See proposal.md for motivation. Four constraints shape the approach.

The wrapper holds one route table and two response builders. Every JSON
answer leaves through `toResponse` in `src/http/server.ts`. The one non-JSON
answer leaves through `toBinaryResponse`. A header that belongs on every
response goes in those two functions, not on a route.

The download handler already holds what it needs. `getAttachment` in
`src/runtime/api.ts` returns `filename` beside `contentType` and `data`.
`handleGetAttachment` drops it. The header needs no new query and no schema
change.

The engine already parses one environment bound the strict way.
`parseRetentionDays` in `src/engine/host.ts` reads `DATA_RETENTION_DAYS` and
rejects a malformed value at load. Its doc comment names
`MAX_ATTACHMENT_BYTES` as the counter-example. This change closes the gap
that comment records.

The `/metrics` branch sits above the route table. It shares a block with
`/livez` and `/readyz`, ahead of any actor resolution. It reaches the
database. The two probes do not.

## Goals / Non-Goals

**Goals:**

- No response leaves this wrapper with a header an uploader chose.
- A control an operator can set wrong fails loudly, never quietly.
- Both bounds on a list limit live where a later route inherits them.

**Non-Goals:**

- No allowlist of stored MIME types. The token match and the two headers
  already stop the browser from running the bytes. An allowlist needs a
  product decision about which formats the engine takes.
- No change to attachment storage. See the proposal's out-of-scope note.
- No revocation or rotation story for `METRICS_TOKEN`. A deployment that
  needs one restarts the process, as it does for `AUTH_JWT_SECRET`.

## Decisions

**A bearer token for `/metrics`, not a role.** A scraper carries no actor
identity. An account with `system:admin` would put a full-permission
credential in a scrape config. A shared token, compared with a constant-time
equality, holds the endpoint closed. It also invents no machine actor. That
is why resolving `ADMIN_ROLE` through the ordinary resolver loses here.

A second `Bun.serve` on a private port is the other standard answer. It needs
no code in the request path. It also moves the control into deployment
topology, which this repository documents nowhere yet.

**An unset `METRICS_TOKEN` unregisters the route.** This follows
`CORS_ALLOWED_ORIGINS`, where unset permits nothing. It also follows the
login route, which the server registers conditionally today. Leaving the
route open on an unset variable would keep the current default, and so would
close nothing.

**The MIME match rejects parameters.** A value like
`text/html; charset=utf-8` fails the match. Parameters carry nothing the
download needs. Every byte the wrapper refuses to store is a byte it cannot
echo. An upload that needs a charset can declare `text/plain`.

**Every JSON response carries `Cache-Control: no-store`, with no per-route
opt-out.** A per-route list would drift. The hand-written preflight chain
drifted that way, before the route table replaced it. Every list this wrapper
serves is actor-scoped, so a cache would help none of them.

**Only the attachment download carries `Content-Disposition`.** The builder
`toBinaryResponse` serves `/metrics` as well as the download. A download
header on a scrape would be wrong. `HttpBinaryResult` gains an optional
`filename`. The builder emits `Content-Disposition` only when a result
carries one. `X-Content-Type-Options: nosniff` stays unconditional. It costs
a scrape nothing, and it holds for any later binary route.

**The filename in `Content-Disposition` is percent-encoded.** A stored
filename holds up to 255 characters of any kind. A quote and a CR are
among them. Encoding removes the header-injection question. Answering it per
character does not.

## Risks / Trade-offs

- A deployment that scrapes `/metrics` today loses its scrape until it sets
  `METRICS_TOKEN` → the proposal marks this **BREAKING**. The deployment
  runbook describes the variable in the same window.
- A deployment that set `MAX_ATTACHMENT_BYTES` to a malformed value now
  refuses to start → that is the point of the finding. The error message
  names the variable and the value.
- The MIME match rejects a type that carries a parameter → the studio and
  app upload paths set the type themselves. The answer is a 400 with
  `error.type` of `"request-shape"`, not a silent drop.
- A percent-encoded filename saves as `my%20file.pdf` where a browser would
  otherwise show a space → acceptable against header injection. A later
  change may add the `filename*` form.
- The change `deliver-framing-and-sniffing-headers` is in flight and covers
  the same header name. It works on the `frontend-security-headers`
  capability. That capability holds only a build-time
  Content-Security-Policy today, so a runtime header there is new ground.
  Should it set `X-Content-Type-Options: nosniff` on every response, the
  later broader rule supersedes the one this change puts in
  `toBinaryResponse`. A repeated identical header costs a response
  nothing. This change confines itself to `toBinaryResponse`, so removing
  the redundancy later stays a one-line change.

## Migration Plan

Both breaking steps change an environment variable, not data. No table
changes, and no stored row changes.

1. Set `METRICS_TOKEN` in every deployment that scrapes. Put the same value
   in the scrape config. A deployment that does not scrape sets nothing, and
   the route disappears.
2. Check `MAX_ATTACHMENT_BYTES` in every deployment that sets it. A value
   outside a positive integer now stops the process at load.
3. Deploy. Attachments stored before this change keep the `contentType` they
   carry. The download route holds them behind the two new headers. A stored
   `text/html` file stops running as a document, with no data fix.

Rollback is the previous image plus removing `METRICS_TOKEN`. Nothing
persists across the two versions that the older one cannot read.

## Open Questions

- Does any download need the RFC 5987 `filename*` form for a non-ASCII name?
  The percent-encoded `filename` parameter answers the security question
  today. Adding `filename*` later changes no requirement and no task.
