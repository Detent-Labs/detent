<!-- The MODIFIED block below copies the live frontend-security-headers
     requirement, apart from what this change edits. That file carries its
     own allow-file directive, and a rewrite here would make the delta and
     its destination disagree. This directive dies with the change, at
     archive time. -->
<!-- antislop: allow-file all -->

## ADDED Requirements

### Requirement: Every path that serves the bundle sends the framing and sniffing headers

A meta tag cannot carry `frame-ancestors`, `report-uri` or `sandbox`. A
browser honors those three only from an HTTP response header. Every path that
serves the built bundle SHALL therefore send these four headers with every
document and every asset:

- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

Two paths serve the bundle. The engine serves it from `WEB_ROOT`, which
`web-asset-serving` describes. The frontend image serves it from nginx, which
`production-docker-images` describes. Both SHALL send all four.

`X-Frame-Options` repeats what `frame-ancestors` says, for a client that
predates CSP Level 2. It costs one line and it conflicts with nothing.

The response header SHALL carry `frame-ancestors` and no other directive. The
meta tag keeps the rest. A browser applies both policies, and each one
restricts something the other does not, so no page breaks under the pair.

#### Scenario: A served document refuses framing

- **WHEN** a browser loads the shell document from either serving path
- **THEN** the response carries `Content-Security-Policy: frame-ancestors
  'none'` and `X-Frame-Options: DENY`

#### Scenario: A served asset refuses type sniffing

- **WHEN** a browser loads a hashed asset from either serving path
- **THEN** the response carries `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: no-referrer`

#### Scenario: A framing try fails

- **WHEN** a page on another origin puts the studio in an `iframe`
- **THEN** the browser refuses to render it

## MODIFIED Requirements

### Requirement: Every browser package ships a Content-Security-Policy in its production build

The one workspace package that produces a browser bundle, `packages/web`,
SHALL emit a
`Content-Security-Policy` `<meta http-equiv>` into its built `index.html`.
Its own Vite config SHALL inject this tag, not the source `index.html`.
One config now emits one policy covering every area.
The policy SHALL at minimum:

- forbid script from anywhere but the document's own origin
  (`script-src 'self'`, with no `'unsafe-inline'` and no `'unsafe-eval'`);
- forbid plugin content and a rewritten base URI
  (`object-src 'none'`, `base-uri 'none'`);
- restrict form submission (`form-action 'self'`);
- restrict network destinations to the document's own origin plus the
  engine origin the build calls. This is `connect-src`, derived from
  `VITE_API_URL` — the same variable the API client reads. An unset value
  means same-origin, so `connect-src 'self'` is the correct default.

The policy SHALL NOT carry `frame-ancestors`. A browser ignores that
directive in a meta tag, so its presence there reads as protection and gives
none. The requirement above puts it in a response header, where it works.

`style-src` MAY keep `'unsafe-inline'`. The mitigation targets script
execution and exfiltration. The areas rely on inline styles.

The policy applies to the **build** only. The dev server does not carry it.
`@vitejs/plugin-react` injects the react-refresh preamble as an inline
script, and `script-src 'self'` would forbid it. A dev origin holds only a
dev token against a dev database. Breaking `bun run dev` to protect that
token would trade a real cost for a nominal gain.

This is defense in depth for a token in `localStorage`: nothing can revoke it
before it expires. This is not a response to a known injection sink. None
exists in the tree today.

An area may later gain a dependency on an external origin — a font, an
image host, an analytics endpoint, a second API. The change that adds the
dependency SHALL widen the policy too, and the widening applies to every area,
since one policy covers the whole bundle.

#### Scenario: A built page carries the policy

- **WHEN** `packages/web` is built for production
- **THEN** its emitted `index.html` carries a `Content-Security-Policy` meta
  tag containing at least `script-src 'self'`, `object-src 'none'`,
  `base-uri 'none'` and `form-action 'self'`

#### Scenario: The meta policy carries no inert directive

- **WHEN** `packages/web` is built for production
- **THEN** its emitted meta policy contains no `frame-ancestors`,
  `report-uri` or `sandbox` directive

#### Scenario: The engine origin is reachable from the built app

- **WHEN** the package is built with `VITE_API_URL` set to the engine's origin
- **THEN** that origin appears in the policy's `connect-src`, and the built
  app's API calls are not blocked by the policy

#### Scenario: A same-origin build needs no extra entry

- **WHEN** the package is built with `VITE_API_URL` unset, so the API client
  uses a same-origin base
- **THEN** `connect-src` is `'self'` and no other origin is permitted

#### Scenario: An injected inline script does not execute

- **WHEN** a built page is loaded and markup containing an inline `<script>`
  is injected into the DOM
- **THEN** the browser refuses to execute it under `script-src 'self'`

#### Scenario: A lazily-loaded area chunk is not blocked

- **WHEN** a built page loads an area's chunk through its dynamic import
- **THEN** the chunk is same-origin and `script-src 'self'` permits it

#### Scenario: The dev server is unaffected

- **WHEN** a contributor runs `bun run dev`
- **THEN** no policy is injected, and react-refresh works as before

#### Scenario: A newly added browser package is not exempt

- **WHEN** a workspace package that produces a browser bundle is added
- **THEN** its own Vite config injects the policy in the same change that adds
  the package, and no build of it ships without one
