## MODIFIED Requirements

### Requirement: One session carries the token, actor and roles

The shell SHALL persist one session under one storage key. It SHALL hold
the bearer token, the actor id, and the actor's roles. It SHALL also hold
the actor's `displayName` and `locale` once hydrated.

The token, actor id, and roles SHALL come from the `POST /auth/login`
response, `{token, expiresAt, actor: {id, roles}}`. The shell SHALL NOT
store the response's `expiresAt`. The shell SHALL hydrate `displayName` and
`locale` separately, with a call to `GET /account/me` made once a session
exists. Login SHALL NOT block on that call. The shell SHALL treat the
session as established as soon as the login response arrives. It SHALL
fill in `displayName`/`locale` when the hydration call resolves.

A stored session that carries neither `displayName` nor `locale` SHALL
stay valid. The shell SHALL hydrate the two missing fields on next use,
rather than discard the session as malformed.

The shell SHALL NOT track the token's expiry client-side, in storage or
otherwise. A `401` from any API call stays the sole signal that a session
has ended. The `end-user-app` capability already requires this.

The shell SHALL NOT read the four previous per-package storage keys. The
shell SHALL provide no session migration.

#### Scenario: Logging in once reaches every permitted area

- **WHEN** an actor holding `system:admin` and `system:developer` logs in
  once
- **THEN** both `/admin` and `/studio` are reachable without logging in
  again

#### Scenario: A stored expiry gates nothing

- **WHEN** a persisted token is past the lifetime the login response's
  `expiresAt` named
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

## RENAMED Requirements

- FROM: `### Requirement: One session carries the token, actor, roles and expiry`
- TO: `### Requirement: One session carries the token, actor and roles`

## ADDED Requirements

### Requirement: The account menu dismisses via native light-dismiss

The header's account menu SHALL open on a click of its trigger button. It
SHALL dismiss on an outside pointer interaction or on the Escape key. Both
SHALL work through the browser's native popover light-dismiss behavior,
never a hand-written document listener.

A control nested inside the open menu keeps its own action. A pointer
interaction with that control SHALL NOT dismiss the menu first. Four
controls carry this rule: the language picker, an area-switcher entry,
the profile entry, and the logout button.

#### Scenario: A click outside the open menu closes it

- **WHEN** the account menu is open and the actor clicks anywhere outside
  the menu and its trigger button
- **THEN** the menu closes and no menu action runs

#### Scenario: Escape closes the open menu

- **WHEN** the account menu is open and the actor presses Escape
- **THEN** the menu closes and focus returns to the trigger button

#### Scenario: The language picker inside the menu stays usable

- **WHEN** the account menu is open and the actor changes the language
  picker's selection
- **THEN** the locale changes and the menu stays open for a further
  selection

#### Scenario: Selecting an area-switcher entry closes the menu and navigates

- **WHEN** the account menu is open and the actor clicks another permitted
  area's entry
- **THEN** the menu closes and the shell navigates to that area

#### Scenario: Selecting the profile entry closes the menu and navigates

- **WHEN** the account menu is open and the actor clicks the profile
  entry
- **THEN** the menu closes and the shell navigates to the profile page

#### Scenario: Selecting the logout entry closes the menu and signs out

- **WHEN** the account menu is open and the actor clicks the logout
  entry
- **THEN** the menu closes and the shell signs the actor out
