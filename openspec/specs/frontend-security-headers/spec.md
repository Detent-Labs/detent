# frontend-security-headers Specification

## Purpose

Every SPA (`packages/app`, `packages/admin`, `packages/studio`,
`packages/editor`) stores its bearer token in `localStorage` and cannot
revoke it before its expiry. A build-time Content-Security-Policy defends
that token in depth: it would block script execution and exfiltration from
an injected script. No injection sink exists in the tree today, so this is
prospective protection, not a fix for a known hole.

## Requirements

### Requirement: Every browser package ships a Content-Security-Policy in its production build

Each workspace package that produces a browser bundle — `packages/app`,
`packages/admin`, `packages/studio`, `packages/editor` — SHALL emit a
`Content-Security-Policy` `<meta http-equiv>` into its built `index.html`.
Its own Vite config SHALL inject this tag, not the source `index.html`.
The policy SHALL at minimum:

- forbid script from anywhere but the document's own origin
  (`script-src 'self'`, with no `'unsafe-inline'` and no `'unsafe-eval'`);
- forbid plugin content and a rewritten base URI
  (`object-src 'none'`, `base-uri 'none'`);
- restrict form submission and framing (`form-action 'self'`,
  `frame-ancestors 'none'`);
- restrict network destinations to the document's own origin plus the
  engine origin the build calls. This is `connect-src`, derived from
  `VITE_API_URL` — the same variable the API client reads. An unset value
  means same-origin, so `connect-src 'self'` is the correct default.

`style-src` MAY keep `'unsafe-inline'`. The mitigation targets script
execution and exfiltration. The packages — and mermaid, in the editor — rely
on inline styles.

The policy applies to the **build** only. The dev server does not carry it.
`@vitejs/plugin-react` injects the react-refresh preamble as an inline
script, and `script-src 'self'` would forbid it. A dev origin holds only a
dev token against a dev database. Breaking `bun run dev` to protect that
token would trade a real cost for a nominal gain.

This is defense in depth for a token in `localStorage`: nothing can revoke it
before it expires. This is not a response to a known injection sink. None
exists in the tree today.

A package may later gain a dependency on an external origin — a font, an
image host, an analytics endpoint, a second API. The change that adds the
dependency SHALL widen the policy too.

#### Scenario: A built page carries the policy

- **WHEN** any of the four packages is built for production
- **THEN** its emitted `index.html` carries a `Content-Security-Policy` meta
  tag containing at least `script-src 'self'`, `object-src 'none'`,
  `base-uri 'none'` and `form-action 'self'`

#### Scenario: The engine origin is reachable from the built app

- **WHEN** a package is built with `VITE_API_URL` set to the engine's origin
- **THEN** that origin appears in the policy's `connect-src`, and the built
  app's API calls are not blocked by the policy

#### Scenario: A same-origin build needs no extra entry

- **WHEN** a package is built with `VITE_API_URL` unset, so the API client
  uses a same-origin base
- **THEN** `connect-src` is `'self'` and no other origin is permitted

#### Scenario: An injected inline script does not execute

- **WHEN** a built page is loaded and markup containing an inline `<script>`
  is injected into the DOM
- **THEN** the browser refuses to execute it under `script-src 'self'`

#### Scenario: The dev server is unaffected

- **WHEN** a contributor runs `bun run dev` in any of the four packages
- **THEN** no policy is injected, and react-refresh works as before
