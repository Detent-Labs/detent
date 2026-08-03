<!-- antislop: allow-file passive-voice -->

## MODIFIED Requirements

### Requirement: A Users screen lists accounts and toggles disable/enable

<!-- antislop: allow sentence-length run-ons -->

The `/users` screen SHALL list every local user via `GET /admin/users`,
showing email, roles, and disabled state, and SHALL offer a disable/enable
toggle per row calling the corresponding `POST /admin/users/:id/disable` or
`POST /admin/users/:id/enable` route. It SHALL NOT offer creating a user or
changing a password: those remain CLI-only (`local-user-accounts`).

The screen SHALL offer role editing per row, over `PATCH
/admin/users/:id/roles`. A per-row control SHALL replace the roles cell with a
text input. That input SHALL hold the user's current roles, comma-separated,
with a save control and a cancel control beside it. Cancelling SHALL leave the
stored roles untouched. Saving SHALL send the whole set, so a role the input
omits is a role removed.

Beside the input the screen SHALL name the reserved `system:*` roles. A role
string is otherwise free, and nothing else lists the roles a deployment uses.

The screen SHALL show a 409 from that route as its own message. It means the
actor tried to remove `system:admin` from its own account. The route refuses
that, so the admin area keeps at least the acting holder.

The roles input SHALL carry an accessible name identifying the user whose roles
it holds. The control is then usable without the surrounding row for context.

A reload SHALL leave an open editor's pending text untouched. The refresh
convention below fires on window focus, not only on the explicit control. A
reload therefore arrives unasked.

<!-- antislop: allow sentence-length synonym-rotation -->

The disable action SHALL be presented with a confirmation stating that it
blocks the user's *next* login but does not end an already-active session
(that token remains valid until it expires, per `admin-user-management`), so
an operator does not mistake this for immediate revocation.

A role assignment SHALL carry the same caveat, for the same reason. The
affected user's active token keeps the roles it carried at login.

<!-- antislop: allow sentence-length -->

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

#### Scenario: Editing a user's roles

- **WHEN** the operator opens the roles editor on a row, changes the text, and
  saves
- **THEN** `PATCH /admin/users/:id/roles` is called with the whole set, and the
  row shows the new roles after the refresh

#### Scenario: Cancelling a role change writes nothing

- **WHEN** the operator opens the roles editor, changes the text, and cancels
- **THEN** no request is sent and the row shows the stored roles

#### Scenario: A reload leaves an open editor alone

- **WHEN** the operator opens the roles editor, types, and the window regains
  focus so the screen refetches
- **THEN** the editor stays open and holds the typed text

#### Scenario: A refused self-edit is explained

- **WHEN** the operator saves a role set for its own account that omits
  `system:admin`, and the route answers 409
- **THEN** the screen states that the actor cannot remove its own
  `system:admin`, and the row keeps its roles

#### Scenario: No create or password controls

- **WHEN** the Users screen is inspected for write actions
- **THEN** only the disable/enable toggle and the roles editor are offered
