## ADDED Requirements

### Requirement: A Users screen lists accounts and toggles disable/enable

The `/users` screen SHALL list every local user via `GET /admin/users`,
showing email, roles, and disabled state, and SHALL offer a disable/enable
toggle per row calling the corresponding `POST /admin/users/:id/disable` or
`POST /admin/users/:id/enable` route. It SHALL NOT offer creating a user,
changing a password, or editing roles — those remain CLI-only
(`local-user-accounts`).

The disable action SHALL be presented with a confirmation stating that it
blocks the user's *next* login but does not end an already-active session
(that token remains valid until it expires, per `admin-user-management`), so
an operator does not mistake this for immediate revocation.

The screen SHALL follow the same refresh convention as Operations/Outbox/
Timers: an explicit refresh control and a refetch on window focus, no
polling.

#### Scenario: Listing users

- **WHEN** the operator opens the Users screen
- **THEN** every local user is shown with email, roles, and disabled state

#### Scenario: Disabling a user from the screen

- **WHEN** the operator confirms disabling an enabled user
- **THEN** `POST /admin/users/:id/disable` is called and the row shows
  disabled after the refresh

#### Scenario: The disable confirmation names the session caveat

- **WHEN** the operator triggers the disable action
- **THEN** the confirmation states that an already-active session is not
  immediately ended

#### Scenario: No create, password, or role controls

- **WHEN** the Users screen is inspected for write actions
- **THEN** only the disable/enable toggle is offered
