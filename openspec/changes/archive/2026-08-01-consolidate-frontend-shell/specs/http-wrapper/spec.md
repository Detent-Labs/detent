<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: An unmatched GET or HEAD defers to static asset serving

The wrapper's terminal unmatched-route response SHALL first offer the request to
the `web-asset-serving` capability, and SHALL return the JSON 404 envelope only
when that capability declines. The deferral SHALL sit behind every API route, so
no URL prefix is reserved for assets and a later API route needs no special
case.

One case is ordered the other way. A `GET` or `HEAD` **navigation** request
SHALL be offered to `web-asset-serving` BEFORE any route matching, because an
area's URL prefix can be the same as an API prefix: `/admin/outbox`,
`/admin/timers` and `/admin/users` name both an admin screen and a `GET` admin
route. Without the reordering, a reload of those screens answers `401` JSON
instead of the shell. See the `web-asset-serving` capability for what counts as
a navigation.

The deferral applies to `GET` and `HEAD` only. Every other method keeps today's
JSON 404 envelope unchanged.

Static asset serving is not a route. The requirement that every route rejects a
missing or invalid bearer token when the JWT resolver is active does not reach
it: the wrapper resolves no actor on either path, exactly as it resolves none
for today's terminal 404.

#### Scenario: An unmatched GET reaches the static branch

- **WHEN** a `GET` request matches no API route and a web root is configured
- **THEN** the wrapper answers from `web-asset-serving`, and resolves no actor
  while doing so

#### Scenario: An unmatched POST keeps the JSON 404

- **WHEN** a `POST` request matches no API route
- **THEN** the response is `404` with `error.type` equal to `"not-found"`,
  whatever the web root holds

#### Scenario: An API route still wins over a file of the same name

- **WHEN** `GET /processes` arrives without `Sec-Fetch-Mode: navigate` and a
  file named `processes` also exists under the web root
- **THEN** the API route answers, and the file is not served

#### Scenario: A navigation wins over a colliding API route

- **WHEN** `GET /admin/outbox` arrives with `Sec-Fetch-Mode: navigate` and a web
  root is configured
- **THEN** the shell document answers, and the admin route does not
