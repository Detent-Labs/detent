<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## Purpose

One browser package presents the whole installation at one address: one login,
one session, one build, with each audience's screens under its own URL prefix
and behind its own role gate. It owns what the four separate SPAs each used to
own a copy of, and it owns nothing an area's screens are responsible for.

## ADDED Requirements

### Requirement: One workspace package produces the whole frontend

`packages/web` SHALL be the only workspace package that produces a browser
bundle. It SHALL carry one `vite.config.ts`, one `index.html`, one `main.tsx`,
one routing module, one session module, one `LoginScreen` and one
`ErrorBoundary`.

Its source SHALL be laid out as `src/shell/` (routing, session, login, error
boundary, area navigation, chrome styles), `src/api/` (the API base, the client
error type, error-body parsing, authenticated fetch), `src/i18n/` (locale
selection and persistence) and `src/areas/<area>/`, one directory per area,
each holding that area's own screens, its own API route functions and its own
`types.ts`.

`packages/form-ui` SHALL stay a separate package.

#### Scenario: Exactly one package builds

- **WHEN** the workspace is inspected for packages that produce a browser bundle
- **THEN** `packages/web` is the only one, and no `packages/app`,
  `packages/admin`, `packages/studio` or `packages/reporting` exists

### Requirement: An area never imports from another area

No source file under `src/areas/<a>/` SHALL import from `src/areas/<b>/` for any
other area `<b>`. An area SHALL import only upward, from `src/shell/`,
`src/api/` or `src/i18n/`, or from a declared package dependency.

A test SHALL enforce this by scanning the source, not leave it to review.

#### Scenario: A cross-area import fails the suite

- **WHEN** a file under one area's directory imports from another area's
  directory
- **THEN** the boundary test fails and names the importing file

### Requirement: Every area lives under its own URL prefix

The URL scheme SHALL be `/login` for the login screen, and `/app/*`,
`/admin/*`, `/studio/*`, `/reporting/*` for the four areas.

The shell SHALL split the first path segment off as the area and pass only the
remainder to that area's own route matcher, and SHALL prepend the same prefix
to whatever that area's own path builder returns. An area's route table
therefore SHALL NOT know its own prefix.

An area path builder that returns `/` SHALL produce the bare prefix, with no
trailing slash.

#### Scenario: A deep area route round-trips

- **WHEN** the browser is at `/studio/processes/proc_x/migrate/1/2`
- **THEN** the shell resolves the area as `studio`, that area's matcher receives
  `/processes/proc_x/migrate/1/2`, and building that same route again yields
  the original URL

#### Scenario: An area's own root has no trailing slash

- **WHEN** an area builds a route whose local path is `/`
- **THEN** the resulting URL is the bare prefix, such as `/studio`

#### Scenario: An unknown prefix does not dead-end

- **WHEN** the browser is at a first segment that names no area
- **THEN** the shell redirects to `/`

### Requirement: The root path redirects by role, client-side

`/` SHALL resolve to the first area the signed-in actor may see, chosen
client-side. The engine SHALL NOT issue a redirect for it, because the engine
must not need to know its own outward address.

An actor with no session at `/` SHALL reach the login screen.

#### Scenario: An operator lands in the admin area

- **WHEN** an actor holding only `system:admin` opens `/`
- **THEN** the browser ends up under `/admin`, with no request to the engine for
  a redirect

#### Scenario: A participant lands in the app area

- **WHEN** an actor holding no reserved role opens `/`
- **THEN** the browser ends up under `/app`

### Requirement: One session carries the token, actor, roles and expiry

The shell SHALL persist one session under one storage key, holding the bearer
token, the actor id, the actor's roles and the token's expiry. All four values
SHALL come from the `POST /auth/login` response, which already returns
`{token, expiresAt, actor: {id, roles}}`.

The expiry SHALL be recorded, not enforced. A `401` from any API call stays the
sole signal that a session has ended, as the `end-user-app` capability already
requires, and the shell SHALL run no client-side expiry check.

The four previous per-package storage keys SHALL NOT be read. No session
migration is provided.

#### Scenario: Logging in once reaches every permitted area

- **WHEN** an actor holding `system:admin` and `system:developer` logs in once
- **THEN** both `/admin` and `/studio` are reachable without logging in again

#### Scenario: A stored expiry gates nothing

- **WHEN** the stored session's expiry is in the past
- **THEN** the shell still uses the token, and the session ends only when an API
  call answers `401`

#### Scenario: A malformed stored session is discarded

- **WHEN** the stored value is not parseable, or lacks the token, actor id or
  roles
- **THEN** the shell treats the actor as signed out

### Requirement: Areas are gated by the same roles the HTTP layer enforces

The shell SHALL declare, in one place, the role that reveals each area: the app
area needs only a session, the admin area `system:admin`, the studio area
`system:developer`, and the reporting area `system:reports`. The same
declaration SHALL drive the area navigation, the `/` redirect and the guard on
a direct hit.

This gating is display logic. It SHALL NOT be the only enforcement: the engine
still answers `403` to a direct API call, and this change adds no backend
enforcement.

#### Scenario: A direct hit on a forbidden area is refused

- **WHEN** an actor without `system:admin` navigates directly to `/admin`
- **THEN** the shell shows an explanatory state rather than the admin screens

#### Scenario: The server is still the enforcement point

- **WHEN** an actor without `system:admin` calls an admin route directly, past
  any browser
- **THEN** the engine answers `403`, unchanged by this capability

### Requirement: The area switcher shows only other permitted areas

The area switcher SHALL sit inside the account menu, beside the language
selector and logout, and SHALL list only the areas the signed-in actor may see
other than the current one. It SHALL be absent for an actor permitted exactly
one area.

The current location SHALL show in the URL prefix and the document title, not
as a label in the header.

#### Scenario: A participant sees no trace of the consolidation

- **WHEN** an actor permitted only the app area opens the account menu
- **THEN** no area switcher is present

#### Scenario: A two-area actor can switch

- **WHEN** an actor holding `system:admin` and `system:developer` is under
  `/admin` and opens the account menu
- **THEN** the switcher lists the studio area and not the admin area

### Requirement: Each area is its own lazily-loaded chunk

Each area's root component SHALL be loaded through a dynamic import, so the
build emits one chunk per area and a browser downloads only the areas it
visits.

#### Scenario: A participant does not download the Studio canvas

- **WHEN** a browser loads `/app` and visits no other area
- **THEN** the Studio area's chunk is not requested

### Requirement: The build assumes no fixed outward address

The build SHALL use a root-relative base and emit no absolute URL naming its
own origin, so a reverse proxy in front stays possible. Same-origin SHALL stay
the default API base, with `VITE_API_URL` overriding it for development against
a separately-hosted engine.

#### Scenario: The bundle works behind a proxy

- **WHEN** the built bundle is served from a web root behind a reverse proxy
- **THEN** its asset references and its API calls are relative to the serving
  origin, with no build-time origin baked in
