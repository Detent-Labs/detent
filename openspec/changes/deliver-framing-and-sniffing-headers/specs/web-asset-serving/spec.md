## ADDED Requirements

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
envelope carries its own headers, which `http-wrapper` states. The
attachment download carries its own `X-Content-Type-Options: nosniff` from
that same capability, for its own reason.

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
