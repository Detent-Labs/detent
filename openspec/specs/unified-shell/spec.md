# unified-shell Specification

## Purpose
One browser package presents the whole installation at one address: one login,
one session, one build, with each audience's screens under its own URL prefix
and behind its own role gate. It owns what the four separate SPAs each used to
own a copy of, and it owns nothing an area's screens are responsible for.
## Requirements
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

The URL scheme SHALL be `/login` for the login screen, `/profile` for the
profile page, and `/app/*`, `/admin/*`, `/studio/*`, `/reporting/*` for the
four areas.

`/login` and `/profile` name no area. The shell SHALL match each of them as a
whole first segment. It SHALL do so before it reads a first segment as an
area.

The shell SHALL split the first path segment off as the area. It SHALL pass
only the remainder to that area's own route matcher. It SHALL prepend the
same prefix to whatever that area's own path builder returns. An area's
route table therefore SHALL NOT know its own prefix.

An area path builder that returns `/` SHALL produce the bare prefix, with no
trailing slash.

#### Scenario: A deep area route round-trips

- **WHEN** the browser is at `/studio/processes/proc_x/migrate/1/2`
- **THEN** the shell resolves the area as `studio`, and that area's matcher
  receives `/processes/proc_x/migrate/1/2`
- **AND** building that same route again yields the original URL

#### Scenario: An area's own root has no trailing slash

- **WHEN** an area builds a route whose local path is `/`
- **THEN** the resulting URL is the bare prefix, such as `/studio`

#### Scenario: The profile path matches as a whole segment

- **WHEN** the browser is at `/profile`
- **THEN** the shell resolves the profile page
- **AND** a deeper path such as `/profile/settings` names no area and
  redirects to `/`

#### Scenario: An unknown prefix does not dead-end

- **WHEN** the browser is at a first segment that names no area, and names
  neither `login` nor `profile`
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

The shell SHALL persist one session under one storage key. It SHALL hold
the bearer token, the actor id, the actor's roles, and the token's expiry.
It SHALL also hold the actor's `displayName` and `locale` once hydrated.

The token, actor id, roles, and expiry SHALL come from the `POST
/auth/login` response, `{token, expiresAt, actor: {id, roles}}`. The shell
SHALL hydrate `displayName` and `locale` separately, with a call to `GET
/account/me` made once a session exists. Login SHALL NOT block on that
call. The shell SHALL treat the session as established as soon as the
login response arrives. It SHALL fill in `displayName`/`locale` when the
hydration call resolves.

A stored session that carries neither `displayName` nor `locale` SHALL
stay valid. The shell SHALL hydrate the two missing fields on next use,
rather than discard the session as malformed.

The shell SHALL record the expiry but SHALL NOT enforce it. A `401` from
any API call stays the sole signal that a session has ended. The
`end-user-app` capability already requires this. The shell SHALL run no
client-side expiry check.

The shell SHALL NOT read the four previous per-package storage keys. The
shell SHALL provide no session migration.

#### Scenario: Logging in once reaches every permitted area

- **WHEN** an actor holding `system:admin` and `system:developer` logs in
  once
- **THEN** both `/admin` and `/studio` are reachable without logging in
  again

#### Scenario: A stored expiry gates nothing

- **WHEN** the stored session's expiry is in the past
- **THEN** the shell still uses the token, and the session ends only when
  an API call answers `401`

#### Scenario: The shell discards a malformed stored session

- **WHEN** the stored value is not parseable, or lacks the token, actor id
  or roles
- **THEN** the shell treats the actor as signed out

#### Scenario: A session hydrates its name and locale after login

- **WHEN** an actor logs in
- **THEN** the shell establishes the session at once from the login
  response
- **AND** it then calls `GET /account/me` and fills in `displayName` and
  `locale` once that call resolves

#### Scenario: A pre-existing session without a name or locale stays valid

- **WHEN** the shell loads a pre-existing stored session with no
  `displayName` or `locale`
- **THEN** the shell treats the actor as signed in, not malformed, and
  hydrates the missing fields on next use

### Requirement: Areas are gated by the same roles the HTTP layer enforces

The shell SHALL declare, in one place, the roles that reveal each area: the app
area needs only a session, the admin area `system:admin` or
`system:datalists`, the studio area `system:developer` or `system:templates`,
and the reporting area `system:reports`. The declaration SHALL carry a set of
roles per area, and an actor holding any one of them SHALL enter. The same
declaration SHALL drive the area navigation, the `/` redirect and the guard on a
direct hit.

The admin area carries two roles because the data list screens live in it while
their maintainers must not hold `system:admin`. Area entry is therefore the
weaker gate, and each screen keeps its own role check. See the `admin-app`
capability.

The studio area carries two roles for the same reason. The templates screen
lives in it, and a template curator must not hold `system:developer`. Area entry
is the weaker gate there too, so the studio area declares a per-screen role map
of its own.

This gating is display logic. It SHALL NOT be the only enforcement: the engine
still answers `403` to a direct API call.

#### Scenario: A direct hit on a forbidden area is refused

- **WHEN** an actor holding neither `system:admin` nor `system:datalists`
  navigates directly to `/admin`
- **THEN** the shell shows an explanatory state rather than the admin screens

#### Scenario: The data list role opens the admin area

- **WHEN** an actor holding only `system:datalists` navigates to `/admin`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The template role opens the studio area

- **WHEN** an actor holding only `system:templates` navigates to `/studio`
- **THEN** the shell enters the area rather than showing the explanatory state

#### Scenario: The shell refuses a direct hit on the studio area

- **WHEN** an actor holding neither `system:developer` nor `system:templates`
  navigates directly to `/studio`
- **THEN** the shell shows an explanatory state rather than the studio screens

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

### Requirement: The header names the signed-in actor

The shell header SHALL render the signed-in actor's identity as text
immediately to the left of the account button. The account button SHALL
keep its own label unchanged.

The shell SHALL source the text from the session's `displayName`. Where
`displayName` is unset, the shell SHALL fall back to the session's
`actorId`. Two cases leave `displayName` unset. One is a federated actor,
whose account carries no `displayName`. The other is the window between
login and the `GET /account/me` hydration call resolving.

The shell SHALL render a set `displayName` in the body type face. It SHALL
render an `actorId` fallback in the mono type face.

#### Scenario: A hydrated actor's name shows beside the account button

- **WHEN** the signed-in actor's session carries a `displayName`
- **THEN** the header shows that name to the left of the account button, in
  the body face

#### Scenario: A federated actor's id shows beside the account button

- **WHEN** the signed-in actor holds a federated account, so the session
  never carries a `displayName`
- **THEN** the header shows the actor's `actorId` to the left of the account
  button, in the mono face

#### Scenario: The pre-hydration window shows the actor id

- **WHEN** an actor has logged in and the `GET /account/me` hydration call
  has not yet resolved
- **THEN** the header shows the actor's `actorId` to the left of the account
  button
- **AND** the header switches to the hydrated `displayName` once hydration
  resolves

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

### Requirement: The studio area gates each screen by role

The studio area SHALL declare a role map keyed by screen, in
`packages/web/src/areas/studio/routing.ts`. The map SHALL put the six existing
screens behind `system:developer`. Those six are the process list, the editor,
the versions screen, the migration screen, the tools screen and the player. The
map SHALL put the templates screen behind `system:templates`.

The map SHALL drive the area navigation and the guard on a direct hit. The admin
area's own map does the same. An actor reaching a screen the map denies SHALL
see an explanatory state rather than the screen.

The area's default route is the process list, which the map denies a curator.
The area SHALL therefore move an actor stranded on that default to the
templates screen. The admin area already does this for a maintainer stranded
on the instances list. Without the move, a curator meets a refusal as the
first screen after login.

This gate exists because the area entry now admits two roles. Without the map,
a template curator would reach every authoring screen in the studio area.

The map is display logic. The engine's role check on each studio route stays the
enforcement.

#### Scenario: A curator sees only the templates screen

- **WHEN** an actor holding only `system:templates` enters the studio area
- **THEN** the navigation offers the templates screen and none of the six others

#### Scenario: A curator lands on the templates screen, not on a refusal

- **WHEN** an actor holding only `system:templates` logs in and the shell
  sends them to the studio area
- **THEN** the templates screen renders
- **AND** the explanatory state for the process list does not render

#### Scenario: A curator cannot open an authoring screen directly

- **WHEN** an actor holding only `system:templates` navigates directly to the
  studio process list
- **THEN** the shell shows an explanatory state rather than the process list

#### Scenario: A developer keeps every authoring screen

- **WHEN** an actor holding only `system:developer` enters the studio area
- **THEN** the navigation offers all six existing screens

#### Scenario: A developer does not reach the templates screen

- **WHEN** an actor holding only `system:developer` navigates directly to the
  templates screen
- **THEN** the shell shows an explanatory state, while the process picker still
  reads `GET /templates` to seed a new process

#### Scenario: The server still enforces the studio routes

- **WHEN** an actor holding only `system:templates` calls a studio route the map
  hides, past any browser
- **THEN** the engine answers `403`

### Requirement: An area's router ships match, round-trip and half-match coverage

`CLAUDE.md` names an `/admin/*` route collision as one of three defects that
shipped past a green suite. Every area router in `packages/web` SHALL carry
the coverage `admin-routing.test.ts` already has.

A change that adds or edits a route SHALL extend that coverage.

#### Scenario: A new route matches and round-trips

- **WHEN** an area gains a route
- **THEN** a test asserts that the path matches the route
- **AND** a test asserts that the route round-trips through its path builder

#### Scenario: A deeper path does not half-match

- **WHEN** a request path runs deeper than a declared route
- **THEN** a test asserts the router falls back rather than half-matching

#### Scenario: Two prefixes do not collide

- **WHEN** an area declares two routes sharing a leading segment
- **THEN** a test asserts each path reaches its own route
- **AND** an area with no such pair carries no contrived case for it

<!-- antislop: allow synonym-rotation -->
### Requirement: The account menu links to a profile page

The account menu SHALL carry an entry to a dedicated profile page. The
page SHALL live under the shell, not under any of the four role-gated
areas. Identity applies to every signed-in actor, regardless of role.

The page's path SHALL be `/profile`. It SHALL differ from the path of any
API route. The engine matches its route table before it falls through to
static serving. A page whose path equals an API route's path therefore
answers a browser navigation with JSON. The routes this page calls are `GET`
and `PATCH /account/me`.

The shell SHALL present the page inside `Chrome`, so the account menu and
the area switcher stay reachable from it.

The page SHALL present the fields `GET /account/me` returns as read-only:
`email`, `roles`, `managerUserId`. It SHALL let the actor change
`displayName` and `locale` through `PATCH /account/me`.

For a federated actor, whose `GET /account/me` response carries
`editable: false`, the page SHALL present the actor's `id` and `roles`
and SHALL present no editable field.

#### Scenario: A signed-in actor opens the profile page from the account menu

- **WHEN** an actor holding any role opens the account menu and selects
  the profile entry
- **THEN** the shell navigates to the profile page
- **AND** the page presents that actor's `email`, `roles`,
  `managerUserId`, `displayName`, and `locale`

#### Scenario: A federated actor sees an identity-only profile page

- **WHEN** a federated actor, whose `GET /account/me` response carries
  `editable: false`, opens the profile page
- **THEN** the page presents that actor's `id` and `roles`
- **AND** the page presents no field the actor can change

### Requirement: The account menu's language picker persists to the account when signed in

For a signed-in actor, changing the language picker in the account menu
SHALL call `PATCH /account/me` with the chosen `locale`. It SHALL still
write to `localStorage` as before. `localStorage` SHALL stay the source
before login. It SHALL stay the fallback if the account write fails.

#### Scenario: Changing the language picker while signed in updates the account

- **WHEN** a signed-in actor selects a different language in the account
  menu's picker
- **THEN** the shell calls `PATCH /account/me` with that locale
- **AND** the session's `locale` reflects the change

#### Scenario: Locale stays browser-only before login

- **WHEN** no session exists
- **THEN** the shell reads and writes the locale only through
  `localStorage`, and calls no account route

### Requirement: A hydrated account locale wins where the browser holds none

When hydration returns a `locale` and `localStorage` holds no `app.locale`
value, the shell SHALL adopt that locale as the active UI locale. It SHALL
write the adopted value to `localStorage`.

When `localStorage` already holds a supported `app.locale` value, hydration
SHALL leave it alone. A language chosen on this browser stays chosen.

#### Scenario: A new device adopts the account's locale

- **WHEN** an actor whose account holds `locale: "de"` signs in on a browser
  whose `localStorage` holds no `app.locale`
- **THEN** the interface switches to German, and `localStorage` holds `"de"`

#### Scenario: A language chosen on this browser survives hydration

- **WHEN** an actor whose account holds `locale: "de"` signs in on a browser
  whose `localStorage` already holds `"en"`
- **THEN** the interface stays English, and `localStorage` still holds `"en"`

### Requirement: The account menu shows the running build's version

The account menu SHALL show the build version as a bare mono-face line
below the Logout entry. A hairline rule SHALL separate the two. The line
SHALL carry no label. It SHALL show for every signed-in actor, regardless
of role.

The version string SHALL be `Major.Minor.Revision.BuildHash`, read from the
repository's `VERSION` file at `packages/web` build time. It stays fixed
for the life of that build. The line SHALL NOT carry `role="menuitem"`: it
names no action. It sits outside the menu's interactive semantics even
though it renders inside the same popup.

#### Scenario: Any signed-in actor sees the build version

- **WHEN** a signed-in actor holding any role opens the account menu
- **THEN** the menu shows a mono-face line below Logout carrying the
  build's `Major.Minor.Revision.BuildHash` string
- **AND** that line carries no `role="menuitem"`

#### Scenario: The version line survives a rebuild

- **WHEN** `packages/web` is rebuilt against a different `VERSION` file
- **THEN** the account menu's version line shows the new build's string
