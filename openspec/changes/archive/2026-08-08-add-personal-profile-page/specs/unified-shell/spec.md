## MODIFIED Requirements

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

## ADDED Requirements

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
