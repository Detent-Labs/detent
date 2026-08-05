<!-- The MODIFIED block below copies the live production-docker-images
     requirement, apart from the paragraph and the scenario this change
     adds. That file carries the findings already, and a rewrite here would
     make the delta and its destination disagree. This directive dies with
     the change, at archive time. -->
<!-- antislop: allow-file passive-voice sentence-length -->

## MODIFIED Requirements

### Requirement: The frontend image serves the built SPA with a client-side routing fallback

The frontend image SHALL serve the built assets through nginx.
Nginx SHALL fall back to `index.html` for any request path that matches
no built file. This SHALL match the shell's client-side
History API routing, including every area prefix.

The server block SHALL send the four headers `frontend-security-headers`
names, on every response. Each `add_header` SHALL carry the `always`
argument, so an error response carries the header too. The block replaces the
base image's own server block, so it inherits no header from it.

#### Scenario: A deep link loads directly

- **WHEN** a browser requests a path the built assets do not contain
  directly, for example `/studio/processes/abc/edit`
- **THEN** the server responds with `index.html`, and the client-side
  router then renders the matching screen

#### Scenario: An area prefix is not a special case

- **WHEN** a browser requests any of `/app`, `/admin`, `/studio` or
  `/reporting`
- **THEN** the same fallback serves `index.html`, with no per-area nginx
  location block

#### Scenario: Every response carries the four headers

- **WHEN** a browser requests the shell, a hashed asset, or a path that
  produces an error response
- **THEN** the response carries `Content-Security-Policy: frame-ancestors
  'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`
