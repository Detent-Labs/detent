## MODIFIED Requirements

### Requirement: A Users screen lists accounts and toggles disable/enable

The `/users` screen SHALL list local accounts through `GET /admin/users`. Each
row SHALL show email, roles, manager and disabled state. The screen SHALL offer
a disable/enable toggle per row. That toggle SHALL call `POST
/admin/users/:id/disable` or `POST /admin/users/:id/enable`.

The route pages its answer. The screen SHALL request `MAX_LIST_LIMIT` rows and
SHALL follow the returned cursor until none comes back. It SHALL then show
every account it holds. An operator therefore sees the whole directory in one
list.

The screen SHALL NOT show a partial set. The manager control and the manager
column both read the full list. One page alone would drop accounts out of the
choices. It would print a `user_id` where an email belongs. The `auth_users`
table stays operator-scale, which is what keeps this walk a bounded read. A
deployment that outgrows it needs a narrower candidates route, not a page
control on this screen.

The screen SHALL offer role editing per row, over `PATCH
/admin/users/:id/roles`. A per-row control SHALL replace the roles cell with a
text input. That input SHALL hold the account's current roles, comma-separated.
A save control and a cancel control SHALL sit beside it. Cancelling SHALL leave
the stored roles untouched. Saving SHALL send the whole set, so a role the input
omits is a role removed.

Beside the input the screen SHALL name the reserved `system:*` roles. A role
string is otherwise free, and nothing else lists the roles a deployment uses.

The screen SHALL show a 409 from that route as its own message. It means the
actor tried to remove `system:admin` from its own account. The route refuses
that, so the admin area keeps at least the acting holder.

The roles input SHALL carry an accessible name identifying the account whose
roles it holds. The control is then usable without the surrounding row for
context.

A reload SHALL leave an open editor's pending text untouched. The refresh
convention below fires on window focus, not only on the explicit control. A
reload therefore arrives unasked.

The disable action SHALL carry a confirmation. That confirmation SHALL state
that the action blocks the account's *next* login. It SHALL state that the
action does not end an already-active session. That token stays valid until it
expires, per `admin-user-management`. An operator then does not read this as
immediate revocation.

A role assignment SHALL carry the same caveat, for the same reason. The
affected account's active token keeps the roles it carried at login.

The screen SHALL show each account's manager. It SHALL offer manager editing per
row, over `PATCH /admin/users/:id/manager`. The control SHALL offer the other
accounts as choices. It SHALL offer a choice clearing the manager. It SHALL NOT
offer the account under edit, which the route refuses with 400.

The manager choices SHALL cover every account. A manager an operator cannot
pick is an account the read hid. The pointer to it is a `user_id`, which reads
as an opaque string wherever that account's own row is absent. The walk above
is what keeps both correct.

The manager control SHALL carry an accessible name naming the account whose
manager it holds. The roles input carries one for the same reason. A reload
SHALL leave a pending manager edit untouched, the way an open roles editor
keeps its text.

A refused manager edit SHALL leave the displayed value as it was. It SHALL show
the server's message. A successful one SHALL show the saved value without a full
reload.

The screen SHALL offer account creation, over `POST /admin/users`. The control
SHALL open a form taking an email, a password and an optional role set. A save
control and a cancel control SHALL sit beside it. On success the screen SHALL
show the created account among the rows. It SHALL show a 409 from that route as
its own message, naming the email already in use.

The creation form SHALL state that the operator hands the password to the
account holder out of band. The engine sends no mail. Nothing else tells that
person what their password is.

The screen SHALL offer a password reset per row, over `POST
/admin/users/:id/password`. The control SHALL replace the row's cell with an
input for the new password. A save control and a cancel control SHALL sit
beside it. Cancelling SHALL leave the stored hash untouched.

A password reset SHALL carry a caveat. That caveat SHALL state that the reset
leaves a token already issued to that account working. Such a token keeps
authenticating until it expires, or until an operator disables the account. The
disable confirmation and the roles editor already set this pattern.

The screen SHALL follow the refresh convention Operations/Outbox/Timers
follow. That is an explicit refresh control and a refetch on window focus. No
polling.

#### Scenario: Listing accounts

- **WHEN** the operator opens the Users screen
- **THEN** the screen shows every local account, each with email, roles,
  manager and disabled state

#### Scenario: Reaching an account past one page

- **WHEN** more accounts exist than one request returns
- **THEN** the screen follows the cursor and shows those accounts too, with no
  control for the operator to press

#### Scenario: Disabling an account from the screen

- **WHEN** the operator confirms disabling an enabled account
- **THEN** the screen calls `POST /admin/users/:id/disable`, and the row shows
  disabled after the refresh

#### Scenario: The disable confirmation names the session caveat

- **WHEN** the operator triggers the disable action
- **THEN** the confirmation states that the action leaves an already-active
  session running

#### Scenario: Editing an account's roles

- **WHEN** the operator opens the roles editor on a row, changes the text, and
  saves
- **THEN** the screen calls `PATCH /admin/users/:id/roles` with the whole set,
  and the row shows the new roles after the refresh

#### Scenario: Cancelling a role edit writes nothing

- **WHEN** the operator opens the roles editor, changes the text, and cancels
- **THEN** the screen sends no request, and the row shows the stored roles

#### Scenario: A reload leaves an open editor alone

- **WHEN** the operator opens the roles editor, types, and the window regains
  focus so the screen refetches
- **THEN** the editor stays open and holds the typed text

#### Scenario: The screen explains a refused self-edit

- **WHEN** the operator saves a role set for its own account that omits
  `system:admin`, and the route answers 409
- **THEN** the screen states that the actor cannot remove its own
  `system:admin`, and the row keeps its roles

#### Scenario: Changing an account's manager

- **WHEN** the operator picks another account as a manager and confirms
- **THEN** the screen calls `PATCH /admin/users/:id/manager`, and the row shows
  the new manager after the refresh

#### Scenario: Clearing an account's manager

- **WHEN** the operator picks the clearing choice and confirms
- **THEN** the screen calls the route with a null manager, and the row shows no
  manager

#### Scenario: The manager control omits the account under edit

- **WHEN** the operator opens the manager control for an account
- **THEN** the choices omit that account

#### Scenario: The manager control offers an account past one page

- **WHEN** more accounts exist than one request returns, and the operator opens
  the manager control
- **THEN** the choices hold every other account, including those the first
  request did not carry
- **AND** a row whose manager is one of those accounts shows that account's
  email, not its `user_id`

#### Scenario: A reload leaves a pending manager edit alone

- **WHEN** the operator opens the manager control and the window regains focus
  so the screen refetches
- **THEN** the control stays open and holds the pending choice

#### Scenario: The screen shows a refused manager edit

- **WHEN** the server refuses a manager edit
- **THEN** the row shows the previous manager, and the operator sees the message

#### Scenario: Creating an account

- **WHEN** the operator opens the creation form, types an email, a password and
  a role set, and saves
- **THEN** the screen calls `POST /admin/users`, and the created account appears
  among the rows

#### Scenario: The screen explains a duplicate email

- **WHEN** the creation form names an email an account already holds, and the
  route answers 409
- **THEN** the screen states that the email is in use, and the rows gain none

#### Scenario: Cancelling a creation writes nothing

- **WHEN** the operator opens the creation form, types, and cancels
- **THEN** the screen sends no request, and the rows gain none

#### Scenario: The creation form names the out-of-band handover

- **WHEN** the operator opens the creation form
- **THEN** it states that the operator passes the password to the account holder
  by another route

#### Scenario: Resetting a password

- **WHEN** the operator opens the reset control on a row, types a password, and
  saves
- **THEN** the screen calls `POST /admin/users/:id/password` and reports the
  reset

#### Scenario: The reset names the token caveat

- **WHEN** the operator opens the reset control
- **THEN** it states that a token already issued to that account keeps
  authenticating

#### Scenario: Cancelling a reset writes nothing

- **WHEN** the operator opens the reset control, types, and cancels
- **THEN** the screen sends no request, and the stored hash stays as it was

#### Scenario: The screen's write actions

- **WHEN** a reader looks over the Users screen for write actions
- **THEN** the screen offers the disable/enable toggle, the roles editor and the
  manager control
- **AND** it offers the creation form and the password reset
- **AND** no control deletes an account, which no route supports
