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

A stored session predating this change carries no `displayName` or
`locale`. The shell SHALL treat it as valid all the same. It SHALL
hydrate the missing fields on next use, rather than discard the session
as malformed.

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

## ADDED Requirements

<!-- antislop: allow synonym-rotation -->
### Requirement: The account menu links to a profile page

The account menu SHALL carry an entry to a dedicated profile page. The
page SHALL live under the shell, not under any of the four role-gated
areas. Identity applies to every signed-in actor, regardless of role.

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

#### Scenario: The pre-login picker stays browser-only

- **WHEN** an actor with no session changes the language picker on the
  login screen
- **THEN** the shell writes only to `localStorage`
- **AND** the shell calls no account route
