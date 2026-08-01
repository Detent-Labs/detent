<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## ADDED Requirements

### Requirement: An unmatched GET or HEAD defers to static asset serving

The wrapper's terminal unmatched-route response SHALL first offer the request to
the `web-asset-serving` capability, and SHALL return the JSON 404 envelope only
when that capability declines. The deferral SHALL sit behind every API route, so
no URL prefix is reserved for assets and a later API route needs no special
case.

The deferral applies to `GET` and `HEAD` only. Every other method keeps today's
JSON 404 envelope unchanged.

Static asset serving is not a route. The requirement that every route rejects a
missing or invalid bearer token when the JWT resolver is active does not reach
it: the wrapper resolves no actor on this path, exactly as it resolves none for
today's terminal 404.

#### Scenario: An unmatched GET reaches the static branch

- **WHEN** a `GET` request matches no API route and a web root is configured
- **THEN** the wrapper answers from `web-asset-serving`, and resolves no actor
  while doing so

#### Scenario: An unmatched POST keeps the JSON 404

- **WHEN** a `POST` request matches no API route
- **THEN** the response is `404` with `error.type` equal to `"not-found"`,
  whatever the web root holds

#### Scenario: An API route still wins over a file of the same name

- **WHEN** `GET /processes` arrives and a file named `processes` also exists
  under the web root
- **THEN** the API route answers, and the file is not served
