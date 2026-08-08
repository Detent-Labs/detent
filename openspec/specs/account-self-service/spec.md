# account-self-service Specification

## Purpose

Self-scoped account routes let a signed-in user view and change their own
display name and locale. The route family in `admin-user-management`
covers another account instead. This capability covers the caller's own.

The routes are `GET` and `PATCH /account/me`. The shell page that calls them
sits at `/profile`, a different path. `unified-shell` states why the two must
not collide.
## Requirements
### Requirement: A signed-in user can read their own account

The engine SHALL expose `GET /account/me`. The route SHALL scope to the
resolved actor's own `id`. It SHALL take no `:id` path parameter and SHALL
check no role, so any resolvable session reaches it.

When the actor's `id` matches an `auth_users` row, the response SHALL be
`200`. It SHALL carry `id`, `displayName`, `storedDisplayName`, `email`,
`roles`, `managerUserId`, `locale` and `editable: true`. The `displayName`
SHALL be the resolved value the `local-user-accounts` capability defines. The
`storedDisplayName` SHALL be the raw stored value, and SHALL be `null` where
the account set none.

The response carries two names because they answer two questions. The
resolved `displayName` is the value to print. The raw `storedDisplayName` is
the value the account set. An editable name control SHALL seed from the raw
value. A control seeded from the resolved value shows the email to an account
that set no name. The next save then stores that email.

When the actor's `id` matches no `auth_users` row, the response SHALL still
be `200`, with `{ id, roles, editable: false }`. The route SHALL NOT return
`404` for a resolvable actor.

What a missing row means depends on the resolver the host wired. Under the
JWT resolver, a `"bps"`-issued token guarantees an active `auth_users` row.
The `jwt-authentication` capability states that guarantee, under "The
resolver re-reads the account behind every locally issued token". A missing
row there names an externally issued identity.

Under `devHeaderResolver` the request reads no directory. A missing row
there means only that the `X-Actor-Id` header named no local account. The
route SHALL answer the same way in both cases.

#### Scenario: A local account reads its own record

- **WHEN** an actor whose `id` matches an `auth_users` row requests
  `GET /account/me`
- **THEN** the response is `200` with that actor's `displayName`,
  `storedDisplayName`, `email`, `roles`, `managerUserId`, `locale`, and
  `editable: true`

#### Scenario: An account that set no name reports a null stored name

- **WHEN** an actor whose `display_name` is `NULL` requests
  `GET /account/me`
- **THEN** the returned `displayName` is that actor's email, and the
  returned `storedDisplayName` is `null`

#### Scenario: An actor holding no reserved role still reaches the route

- **WHEN** an actor holding no `system:*` role requests `GET /account/me`
- **THEN** the response is `200`, unaffected by role

#### Scenario: A federated actor gets an identity-only response, not a 404

- **WHEN** an actor authenticated through JWKS with a non-`"bps"` issuer,
  whose `id` matches no `auth_users` row, requests `GET /account/me`
- **THEN** the response is `200` with `{ id, roles, editable: false }`, and
  carries no `displayName`, `storedDisplayName`, `email`, `managerUserId`,
  or `locale`

### Requirement: A signed-in user can change their own display name and locale

The engine SHALL expose `PATCH /account/me`. The route SHALL scope the same
way `GET /account/me` does: the resolved actor's own `id`, no `:id`
parameter, no role check.

The request body SHALL carry only `displayName` and `locale`, each
optional. The route SHALL refuse a body key outside that set, with `400`.
It SHALL change no row in that case.

`displayName`, if included, SHALL be `string | null`. The route SHALL trim
a non-null value before storing it. It SHALL refuse, with `400`, a
non-null value that is empty after trimming or longer than 200 characters.
That bound matches the one `admin-user-management`'s name route enforces.
`null` SHALL clear `display_name` back to `NULL`, so the resolved value
falls back to the actor's email.

`locale`, if included, SHALL be one of the values `packages/web`'s
`UiLocale` type declares. Only `"en"` and `"de"` exist today. The route
SHALL refuse a value outside that set, with `400`. It SHALL change no row
in that case.

When the actor's `id` matches no `auth_users` row, the route SHALL refuse
the request with `403`. It SHALL NOT silently ignore the write.

On success the route SHALL return `200` with the updated record, in the
same shape `GET /account/me` returns for a local account.

#### Scenario: Changing a display name

- **WHEN** a local actor requests `PATCH /account/me` with
  `{ "displayName": "Rita Alvarez" }`
- **THEN** the response is `200`, the returned `displayName` is `"Rita
  Alvarez"`, and `auth_users.display_name` holds that value

#### Scenario: Clearing a display name falls back to email

- **WHEN** a local actor whose email is `rita@example.com` requests `PATCH
  /account/me` with `{ "displayName": null }`
- **THEN** the response is `200`, `auth_users.display_name` is `NULL`, and
  the returned `displayName` is `"rita@example.com"`

#### Scenario: The route refuses an empty display name

- **WHEN** a local actor requests `PATCH /account/me` with
  `{ "displayName": "   " }`
- **THEN** the response is `400` and no row changes

#### Scenario: The route refuses an over-long display name

- **WHEN** a `PATCH /account/me` request carries a `displayName` longer
  than 200 characters
- **THEN** the response is `400` and no row changes

#### Scenario: The route accepts a display name at the bound

- **WHEN** a `PATCH /account/me` request carries a `displayName` of exactly
  200 characters
- **THEN** the response is `200` and `auth_users.display_name` holds that
  value

#### Scenario: A locale-only change leaves a null display name null

- **WHEN** a local actor whose `display_name` is `NULL` requests `PATCH
  /account/me` with `{ "locale": "de" }`
- **THEN** the response is `200`, `auth_users.display_name` is still `NULL`,
  and the returned `displayName` is still that actor's email

#### Scenario: Changing locale

- **WHEN** a local actor requests `PATCH /account/me` with
  `{ "locale": "de" }`
- **THEN** the response is `200` and the returned `locale` is `"de"`

#### Scenario: The route refuses a locale outside the supported set

- **WHEN** a local actor requests `PATCH /account/me` with
  `{ "locale": "fr" }`
- **THEN** the response is `400` and no row changes

#### Scenario: The route refuses an unknown body key

- **WHEN** a `PATCH /account/me` request body carries a key other than
  `displayName` or `locale`, such as `{ "roles": ["system:admin"] }`
- **THEN** the response is `400` and no row changes

#### Scenario: The route refuses a federated actor's write

- **WHEN** an actor whose `id` matches no `auth_users` row requests `PATCH
  /account/me` with `{ "displayName": "Anyone" }`
- **THEN** the response is `403` and no row changes anywhere
