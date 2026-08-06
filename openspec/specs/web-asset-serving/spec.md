<!-- antislop: allow-file sentence-length passive-voice em-dash -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo (see
     admin-app/spec.md). "SHALL read", "SHALL be refused" and the other
     normative passives are that grammar, not prose choices. -->

# web-asset-serving Specification

## Purpose
Lets one engine process serve a built browser frontend from its own origin, so
an installation presents itself at one address instead of one port per SPA. The
capability covers only static delivery: which requests it answers, where it
reads files from, what it refuses, and what it caches.
## Requirements
### Requirement: The engine serves files from a configured web root

The HTTP server SHALL read a filesystem root from the `WEB_ROOT` environment
variable, falling back to a default path resolved relative to the server
module's own location. When that root names an existing directory, the server
SHALL answer `GET` and `HEAD` requests that match no API route by serving a
file from under it.

The response SHALL carry a `Content-Type` derived from the file, and no CORS
headers: these assets are same-origin to the API by construction, which is the
whole point of the capability.

Serving a file SHALL NOT resolve an actor and SHALL NOT need a credential. A
browser fetches the shell document and its assets before it holds a token.

Only a regular file is servable. A path that resolves to a directory SHALL fall
through to the shell document, not raise an error.

#### Scenario: An existing file under the root is served

- **WHEN** `GET /assets/index-a1b2c3.js` arrives, no API route matches, and
  `assets/index-a1b2c3.js` exists under the web root
- **THEN** the response is `200` with that file's bytes and a JavaScript
  `Content-Type`

#### Scenario: A HEAD request returns headers without a body

- **WHEN** `HEAD /assets/index-a1b2c3.js` arrives for that same existing file
- **THEN** the response is `200` with the same headers and an empty body

#### Scenario: No credential is required

- **WHEN** a request for an existing file arrives with no `Authorization`
  header while the JWT resolver is the wired resolver
- **THEN** the file is served with `200`, not `401`

### Requirement: An unmatched path falls back to the shell document

To support the browser History API, the server SHALL answer a `GET` or `HEAD`
request that names no existing file under the root by serving `index.html` from
the root with status `200`.

When `index.html` itself is absent from an existing root, the server SHALL fall
through to the JSON 404 envelope instead.

#### Scenario: A client-side route is served the shell

- **WHEN** `GET /studio/processes/proc_x/migrate/1/2` arrives, matches no API
  route, and names no file under the root
- **THEN** the response is `200` with the bytes of `index.html`

#### Scenario: A directory path is not an error

- **WHEN** `GET /assets` arrives and `assets` is a directory under the root
- **THEN** the response is `200` with the bytes of `index.html`, and no error
  reaches the caller

#### Scenario: A root without a shell document does not mask the 404

- **WHEN** the web root exists but holds no `index.html`, and a request matching
  no API route and no file arrives
- **THEN** the response is the JSON 404 envelope with `error.type` equal to
  `"not-found"`

### Requirement: Only GET and HEAD reach the static branch

Every other method SHALL keep the JSON 404 envelope for an unmatched route,
whatever the web root holds. A `POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS`
request never receives `index.html`.

#### Scenario: A POST to an unmatched path still 404s as JSON

- **WHEN** `POST /studio/processes` arrives, matching no API route, while a web
  root holding `index.html` is configured
- **THEN** the response is the JSON 404 envelope, not the shell document

### Requirement: An absent web root leaves the engine unchanged

When `WEB_ROOT` names a path that does not exist or is not a directory, or the
default root does not exist, the server SHALL skip the static branch entirely
and answer every unmatched request with the JSON 404 envelope.

An empty or whitespace-only `WEB_ROOT` SHALL count as unset. It SHALL NOT
resolve to the process working directory, which would put the whole tree behind
the static branch. Running the engine with no built
frontend is a supported configuration, because a reverse proxy may serve the
assets instead.

#### Scenario: A headless engine answers as it did before

- **WHEN** the configured web root does not exist and `GET /anything` arrives
- **THEN** the response is the JSON 404 envelope, and the server started without
  error

#### Scenario: An empty variable does not serve the working directory

- **WHEN** the server starts with `WEB_ROOT` set to an empty or whitespace-only
  value
- **THEN** it has no web root at all, and no file under the process working
  directory becomes reachable

### Requirement: A resolved path outside the web root is refused

Path containment is a trust boundary. The server SHALL percent-decode the
request path before resolving it, and SHALL refuse to serve any resolved path
that does not stay under the web root. A refusal SHALL fall back to the shell
document or the JSON 404 envelope, revealing nothing about the filesystem
outside the root.

A request path the server cannot decode SHALL be refused the same way.

#### Scenario: A traversal segment does not escape the root

- **WHEN** `GET /../../etc/passwd` arrives
- **THEN** no file outside the web root is read, and the response is either the
  shell document or the JSON 404 envelope

#### Scenario: A percent-encoded traversal segment does not escape the root

- **WHEN** `GET /%2e%2e%2f%2e%2e%2fetc/passwd` arrives
- **THEN** no file outside the web root is read, and the response is either the
  shell document or the JSON 404 envelope

#### Scenario: A malformed percent-escape is refused

- **WHEN** a request path carries an escape the server cannot decode, such as
  `GET /%zz`
- **THEN** no file is read for that path, and the response is either the shell
  document or the JSON 404 envelope

### Requirement: Hashed assets cache forever, the shell document never

A file served from under the root SHALL carry `Cache-Control: max-age=31536000,
immutable`, which is safe because the build hashes asset filenames.

`index.html` is the one exception and SHALL always carry `Cache-Control:
no-cache`, whether the server reaches it as the fallback or as a direct request
for that path. Its name never changes, and it is the document that names the
hashed assets. Caching it immutably would pin a browser to one build forever.

#### Scenario: An asset is cached immutably

- **WHEN** an existing file under the root is served
- **THEN** its response carries `Cache-Control: max-age=31536000, immutable`

#### Scenario: The shell document is revalidated

- **WHEN** the `index.html` fallback is served for an unmatched path
- **THEN** its response carries `Cache-Control: no-cache`

#### Scenario: A direct request for the shell document is not cached immutably

- **WHEN** `GET /index.html` arrives and that file exists under the root
- **THEN** its response carries `Cache-Control: no-cache`

### Requirement: A browser navigation is answered from the web root before route matching

An area's URL prefix can be the same as an API prefix. The admin area's
`/admin/outbox`, `/admin/timers` and `/admin/users` screens have exactly the
paths of three `GET` admin routes, so serving assets only behind every API route
answers a reload or a shared link to those screens with `401` JSON instead of
the shell.

The server SHALL therefore offer a `GET` or `HEAD` **navigation** request to
this capability BEFORE matching any API route, whenever a web root is
configured. Every other request keeps the existing order, in which an API route
answers first and only an unmatched request reaches the web root.

A navigation request is one carrying `Sec-Fetch-Mode: navigate`. When the
request carries no `Sec-Fetch-Mode` header at all, a request whose `Accept`
names `text/html` SHALL count as a navigation.

An API caller that asks for HTML therefore receives the shell document rather
than its route's JSON. That is the deliberate cost of the rule, and it is why
the test is this narrow rather than "any request a browser could make".

#### Scenario: A reload of a colliding admin screen serves the shell

- **WHEN** a browser navigates to `/admin/outbox`, sending
  `Sec-Fetch-Mode: navigate`, and a web root is configured
- **THEN** the response is the shell document with `200`, not the admin route's
  `401`

#### Scenario: The area's own request still reaches the API route

- **WHEN** the admin area fetches `/admin/outbox` with `Sec-Fetch-Mode: cors`
- **THEN** the admin route answers, exactly as it did before this rule

#### Scenario: A client sending no Sec-Fetch headers is judged by Accept

- **WHEN** a `GET` arrives with no `Sec-Fetch-Mode` and an `Accept` naming
  `text/html`
- **THEN** it is treated as a navigation

#### Scenario: A non-navigation request is unaffected by the reordering

- **WHEN** a `GET` arrives with `Sec-Fetch-Mode: no-cors` for an asset under the
  web root
- **THEN** it is served from the web root by the existing fallthrough, behind
  route matching, unchanged

#### Scenario: A navigation to an unmatched path still serves the shell

- **WHEN** a browser navigates to `/studio/processes/p1/edit`, which matches no
  API route
- **THEN** the response is the shell document, as it was before this rule

### Requirement: The static branch sends the framing and sniffing headers

Every response the engine's static branch returns SHALL carry the four
headers `frontend-security-headers` names. Those are
`Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

This covers three answers. One is a direct hit on a file under the root. One
is the `index.html` fallback for an unmatched path. One is the navigation
answer that precedes route matching. All three leave through `fileResponse`,
so one place sets all four.

A `HEAD` answer SHALL carry the same headers as the `GET` it describes.

These four headers SHALL NOT reach the wrapper's JSON envelope. That
envelope carries its own headers, which `http-wrapper` states. A binary
answer, such as an attachment download, carries its own headers from that
same capability, for its own reasons. This requirement governs the static
branch alone.

#### Scenario: A file response carries the four headers

- **WHEN** the engine serves an existing file from under the web root
- **THEN** its response carries all four headers

#### Scenario: The shell fallback carries the four headers

- **WHEN** the engine answers an unmatched path with the `index.html`
  fallback
- **THEN** its response carries all four headers, beside the
  `Cache-Control: no-cache` that requirement already sets

#### Scenario: A JSON envelope keeps its own headers

- **WHEN** the wrapper answers a request from its route table with a JSON
  envelope
- **THEN** that response carries no framing or referrer header, and its
  behavior stays as `http-wrapper` states it

