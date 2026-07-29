## ADDED Requirements

### Requirement: Every browser package ships a Content-Security-Policy in its production build

Each workspace package that produces a browser bundle (`packages/app`,
`packages/admin`, `packages/studio`, `packages/editor`) SHALL emit a
`Content-Security-Policy` `<meta http-equiv>` into its built `index.html`,
injected by its own Vite config rather than written into the source
`index.html`. The policy SHALL at minimum:

- forbid script from anywhere but the document's own origin
  (`script-src 'self'`, with no `'unsafe-inline'` and no `'unsafe-eval'`);
- forbid plugin content and a rewritten base URI
  (`object-src 'none'`, `base-uri 'none'`);
- restrict form submission and framing (`form-action 'self'`,
  `frame-ancestors 'none'`);
- restrict network destinations to the document's own origin plus exactly the
  engine origin that build actually calls, derived from the same
  `VITE_API_URL` the API client reads — an unset value means same-origin, so
  `connect-src 'self'` is the correct default.

`style-src` MAY keep `'unsafe-inline'`: the mitigation targets script
execution and exfiltration, and the packages (and mermaid, in the editor)
rely on inline styles.

The policy is injected for the **build** only. The dev server is deliberately
excluded because `@vitejs/plugin-react` injects the react-refresh preamble as
an inline script, which `script-src 'self'` forbids; a dev origin holds a dev
token against a dev database, and breaking `bun run dev` to protect it would
trade a real cost for a nominal gain.

This is defense in depth for a token in `localStorage` that cannot be revoked
before it expires, not a response to a known injection sink — there is none in
the tree today.

When a package gains a dependency on an external origin (a font, an image
host, an analytics endpoint, a second API), the policy SHALL be widened in the
same change that adds it.

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
