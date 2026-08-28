<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

# admin-app Specification

## Purpose

The operator-facing frontend, the admin area of `packages/web`: a workspace package mirroring
the app area of `packages/web`'s shape (React 18, Vite 6, own build/typecheck, a hand-written
History-API routing hook, `session.ts` for the JWT), reusing the existing
login mechanism, with a role-aware shell, the Operations screens
(all-instances list, instance detail with the merged record and cancel,
outbox with dead-letter retry/discard, pending timers), and a Users screen
(list, create, disable/enable, roles, manager, password reset) — reaching the engine exclusively through the HTTP
wrapper, never a direct database read or an imported engine runtime module.
It renders records and system state, never step forms, so it does not depend
on `form-ui`. See the `admin-operations-api` capability for the operations
server-side reads/routes and `admin-user-management` for the users routes
this frontend calls, and the `authorization` capability for the
`system:admin` role its shell checks (presentationally) and every `/admin/*`
route enforces (authoritatively).
## Requirements
### Requirement: The admin area is its own workspace package

The admin area SHALL live at `packages/web/src/areas/admin`, inside the one
workspace package that produces a browser bundle (see the `unified-shell`
capability). It SHALL NOT carry its own `package.json`, `vite.config.ts`,
`tsconfig.json` or `index.html`: `packages/web` carries one of each for every
area.

It SHALL depend on `workflow-engine` at compile time only for the types it
renders (`InstanceRecordElement`, `ActionOutcome`, instance and outbox row
shapes). It SHALL NOT import `form-ui`, and SHALL NOT import from another
area's directory — the admin area renders records and system state, never step
forms.

At runtime it SHALL reach the engine exclusively through the HTTP wrapper. It
SHALL NOT read the database directly and SHALL NOT import engine runtime
modules.

#### Scenario: The package builds and typechecks on its own

- **WHEN** `bun run typecheck` and `vite build` are run for `packages/web`
- **THEN** both succeed, and the admin area needs no build of its own

#### Scenario: No form renderer dependency

- **WHEN** the admin area's sources are inspected
- **THEN** nothing under it imports `form-ui`

#### Scenario: No cross-area import

- **WHEN** the admin area's sources are inspected
- **THEN** nothing under it imports from another area's directory

#### Scenario: No direct database access

- **WHEN** the area's sources are inspected for data access
- **THEN** every engine interaction goes through `fetch` against the HTTP
  wrapper

### Requirement: Login and session reuse the existing mechanism

The admin area SHALL NOT authenticate at all. The shell owns the one login
screen and the one session (see the `unified-shell` capability): the area
receives the bearer token, sends it on every request, and reports a 401 upward
so the shell discards the session and shows the login screen.

There SHALL be no second login mechanism, no refresh flow, and no separate
token store. Reaching the admin area SHALL need no second sign-in for an actor
already signed in elsewhere in the shell.

Routing within the area SHALL stay a pure matcher and path builder over paths
relative to the `/admin` prefix, driven by the shell's one History-API hook. No
router dependency SHALL be added.

#### Scenario: A 401 returns to login

- **WHEN** any request from the admin area answers 401
- **THEN** the stored session is discarded and the login screen is shown

#### Scenario: No second sign-in

- **WHEN** an actor holding `system:admin` signs in and navigates to `/admin`
  from another area
- **THEN** no login screen appears

#### Scenario: No router dependency

- **WHEN** `packages/web/package.json` is inspected
- **THEN** it lists no routing library

### Requirement: An actor without the admin role sees an explanatory empty state

After a successful login, the shell SHALL read the roles carried by the login
response and, when neither `system:admin` nor `system:datalists` is present,
SHALL render a single explanatory screen stating that the account lacks the
operator role — not a partially populated UI, and not a redirect back to login
(the credential is valid).

An actor who holds exactly one of the two SHALL enter the area and reach the
screens that role gates. The operations screens SHALL stay behind
`system:admin`, and the data list screens behind `system:datalists`. A screen
the actor's role does not gate SHALL show the same explanatory state rather
than a partially populated UI.

This client-side check SHALL be presentational only; the server-side
`requireRole` on every `/admin/*` route remains the enforcement.

#### Scenario: A participant logs into the admin area

- **WHEN** an actor whose roles include neither `system:admin` nor
  `system:datalists` logs in
- **THEN** the explanatory screen is shown and no operations screen is reachable

#### Scenario: An operator logs in

- **WHEN** an actor holding `system:admin` logs in
- **THEN** the operations screens are reachable

#### Scenario: A data list maintainer reaches only their screens

- **WHEN** an actor holding `system:datalists` and not `system:admin` logs in
- **THEN** the data list screens are reachable and the operations screens show
  the explanatory state

### Requirement: All instances are listable with filters and paging

The `/admin/instances` screen SHALL list every instance via `GET /instances`
with `scope=all`. It SHALL expose five of the filters `InstanceListFilter`
supports: process, status, current step, `startedBy` and `claimedBy`. It SHALL
expose cursor paging. It SHALL NOT filter to the operator's own assignments;
that is the participant app's view.

<!-- antislop: allow passive-voice - the live spec writes this paragraph verbatim -->

Filter and paging state SHALL live in a pure module under the area's
`screens/` directory with `bun:test` coverage, following
`packages/web/src/areas/app/screens/inboxLogic.ts`. Components themselves are
not required to be tested.

#### Scenario: Listing every instance

<!-- antislop: allow passive-voice - the delta copies this scenario from the live spec verbatim -->
- **WHEN** the operator opens the instances screen
- **THEN** instances started by other actors are listed

#### Scenario: Narrowing by status

- **WHEN** the operator selects a status filter
- **THEN** the request carries the corresponding `status` parameter and the
  list narrows

#### Scenario: Paging forward

- **WHEN** more instances match than the page limit
- **THEN** a next-page control requests the same route with the returned cursor

### Requirement: An instance's diagnostic view is the merged record

The `/instances/:id` screen SHALL show a header carrying process, version,
`definitionHash`, status, current step, `transitionSeq`, claim state and armed
timers, above a single chronological timeline built from
`GET /instances/:id/record`.

Both element kinds SHALL be rendered: a `transition` element with its cause,
path, resulting step and per-action `ActionOutcome`s, and an `event` element
with its `kind` and kind-specific payload. The diagnostic kinds SHALL be
legible as such — in particular `subprocess.outcome-unmatched`, `timer.unarmed`
and `instance.faulted`, which are what answers "why is this parked?".

The screen SHALL offer cancellation via the existing
`POST /instances/:id/cancel`. It SHALL NOT offer a forced transition or a
direct edit of instance `data`.

#### Scenario: A parked instance shows why

- **WHEN** an instance holds a `subprocess.outcome-unmatched` event
- **THEN** that event appears in the timeline with its payload

#### Scenario: Action outcomes are visible

- **WHEN** a transition enqueued actions
- **THEN** each action's outcome, including a `dead-letter` one, is shown with
  that transition

#### Scenario: No state-writing controls beyond cancel

- **WHEN** the instance screen is inspected for write actions
- **THEN** cancel is the only one

### Requirement: The instance detail screen offers a redact action

The instance detail screen SHALL show a "Redact data" action next to the
existing Cancel action, whenever the instance's status is not `running`.
It SHALL disable the action, rather than hide it, once the instance
already carries a `redactedAt` value.

Its confirmation dialog SHALL state plainly that the action permanently
clears the instance's data, comments, and attachments. Confirming SHALL
call `POST /admin/instances/:id/redact` through the existing admin API
client.

#### Scenario: The action is shown for a non-running instance

- **WHEN** the operator opens the detail screen for a `completed`,
  `cancelled`, or `faulted` instance with no `redactedAt` value
- **THEN** the "Redact data" action is shown and enabled

#### Scenario: The action is hidden for a running instance

- **WHEN** the operator opens the detail screen for a `running` instance
- **THEN** the "Redact data" action is not shown

#### Scenario: The action disables once already redacted

- **WHEN** the operator opens the detail screen for an instance whose
  `redactedAt` already holds a value
- **THEN** the "Redact data" action is shown but disabled

#### Scenario: Confirming names what will be cleared

- **WHEN** the operator clicks "Redact data"
- **THEN** a confirmation dialog states that the instance's data,
  comments, and attachments will be cleared permanently, before the
  request fires

### Requirement: A redacted instance shows a badge

Once an instance's `redactedAt` holds a value, the detail screen SHALL
show a "Data redacted on `<date>`" badge. The instance's `data` SHALL
render as empty, since redaction already cleared it. The transition and
event history SHALL still render in full.

#### Scenario: The badge appears after redaction

- **WHEN** the operator opens the detail screen for a redacted instance
- **THEN** a "Data redacted on `<date>`" badge is shown, and the
  rendered `data` is empty

#### Scenario: History stays visible after redaction

- **WHEN** the operator opens the detail screen for a redacted instance
- **THEN** its transition and event history renders the same as an
  unredacted instance's

### Requirement: The instance screen shows an Audit Log section

The `/instances/:id` screen SHALL show an Audit Log section, beside the
existing merged-record timeline. It SHALL build that section from `GET
/admin/instances/:id/audit`. It SHALL list each entry's field id,
operation, actor, source and timestamp, in `seq` order. It SHALL also
list a value, when the entry carries one, and a reason, when the entry
carries one. It SHALL keyset-paginate the same way the merged-record
timeline already loads more.

A `redact` entry, and a `set` entry a later redaction cleared, SHALL
show a redaction marker in place of a value. It SHALL NOT show a blank
cell there. A blank cell would be indistinguishable from an unset
field.

#### Scenario: Audit entries show beside the merged record

- **WHEN** the operator opens the detail screen for an instance whose
  audit log holds entries
- **THEN** the Audit Log section lists them in `seq` order, each with
  its field id, operation, actor, source and timestamp

#### Scenario: A redacted value is shown as redacted, not blank

- **WHEN** the Audit Log section lists an entry whose value a redaction
  cleared
- **THEN** that entry shows a "redacted" marker, distinguishable from a
  `set` entry whose value is empty

#### Scenario: More entries load on demand

- **WHEN** the Audit Log section's first page does not cover every entry
- **THEN** a "load more" control fetches the next page via the returned
  cursor, matching the merged-record timeline's own pattern

### Requirement: The instance screen shows the chain's verified state

The instance screen SHALL show whether the instance's audit chain
verifies, sourced from `GET /admin/instances/:id/audit/verify`. It SHALL
show a "Verified" state when `ok` is true, and a "Verification failed at
entry `<failedSeq>`" state when `ok` is false. This check SHALL run once
per screen load, not once per Audit Log page turn.

#### Scenario: An intact chain shows as verified

- **WHEN** the operator opens the detail screen for an instance whose
  chain is unaltered
- **THEN** the screen shows a "Verified" indicator

#### Scenario: A tampered chain shows as failed, naming the entry

- **WHEN** the operator opens the detail screen for an instance whose
  audit log was altered outside the application
- **THEN** the screen shows a "Verification failed" indicator naming the
  first failing entry's sequence

#### Scenario: Paging the Audit Log does not re-trigger verification

- **WHEN** the operator loads a second page of the Audit Log section
- **THEN** no second call to `GET /admin/instances/:id/audit/verify` is
  made

### Requirement: The outbox screen exposes the two repairs

The `/outbox` screen SHALL show the per-status counts and a filterable list of
rows carrying action type, instance, attempt count, last error and idempotency
key. On a `dead-letter` row it SHALL offer retry and discard, each calling the
corresponding `/admin/outbox/:key/*` route.

Retry SHALL be presented with a confirmation that states the side effect may
re-run, and that a handler honouring the idempotency key deduplicates it
downstream.

#### Scenario: Retrying from the list

- **WHEN** the operator retries a dead-lettered row
- **THEN** `POST /admin/outbox/:key/retry` is called and the row's status is
  shown as `pending` after the refresh

#### Scenario: Repairs are offered only on dead letters

- **WHEN** a `pending`, `claimed` or `delivered` row is displayed
- **THEN** neither retry nor discard is offered on it

### Requirement: The timers screen shows what is due

The `/timers` screen SHALL list pending timers from `GET /admin/timers`,
overdue first, showing instance, process, current step and fire time, with an
explicit indication of which entries are already overdue. Overdue
classification SHALL live in a tested pure module, not inline in the component.

#### Scenario: Overdue entries are marked

- **WHEN** a listed timer's fire time is in the past
- **THEN** it is rendered as overdue

### Requirement: A Groups screen lists, filters, creates, edits and deletes groups

The `/groups` screen SHALL list groups through `GET /admin/groups`. Each row
SHALL show the group's name, its scope, and its member count. A global
group's scope SHALL read as "Global." A processes-scoped group's scope SHALL
read as the count of processes it names, for example "3 processes."

`GET /admin/groups` paginates the same way `GET /admin/users` does. The
screen SHALL walk its cursor to completion before it filters or renders.
This mirrors the Users screen's own `load()`, which loops on the returned
cursor until the cursor runs out. It SHALL show every group the walk
collects.

The screen SHALL offer a process-filter picker above the list. That picker
is a plain `<select>` populated from the existing `GET /processes` route,
following the Migrations screen's picker exactly. Selecting a process SHALL
narrow the visible rows to global groups plus groups whose scope names that
process. Clearing the filter SHALL restore every group.

The screen SHALL offer group creation through `POST /admin/groups`, taking a
name and an initial scope. A save control and a cancel control SHALL sit
beside the form. The process filter may be active at the moment creation
opens. When it is, the form SHALL pre-fill the new group's scope to that
one process, not global. The operator SHALL still be free to edit the
scope before saving.

The screen SHALL offer rename per row through
`PATCH /admin/groups/:groupId/name`. This mirrors the Users screen's inline
roles editor. A per-row control replaces the name cell with a text input,
holding the group's current name. A save control and a cancel control
SHALL sit beside it. Cancelling SHALL leave the stored name untouched.

The screen SHALL offer scope editing per row through
`PATCH /admin/groups/:groupId/scope`. The editor SHALL offer a Global/Processes
switch. Choosing Processes SHALL reveal a picker offering every process,
letting the operator name one or more. An empty processes list is not a
meaningful scope, so the screen SHALL refuse a save that names none,
client-side. Cancelling SHALL leave the stored scope untouched.

The screen SHALL offer member editing per row through
`PATCH /admin/groups/:groupId/members`. This mirrors the Users screen's roles
editor's own shape. A per-row control replaces the member-count cell with a
text input, holding the group's current members as comma-separated emails.
Elsewhere, `group-based-assignment` names a member id matching no account
as a first-class, persistent state.

A stored member id no loaded account matches SHALL show as that id
itself. This keeps a dangling member visible instead of dropping it from
the text. A save control and a cancel control SHALL sit beside it.

The account directory `GET /admin/users` already walks in full, the same
way the Users screen's own manager control resolves an account. The screen
SHALL resolve each typed entry against that directory by email. It SHALL
refuse an entry matching no loaded email, client-side, before any request
fires. One entry escapes that refusal. An entry that exactly matches an id
already in the row's own pre-edit member list SHALL pass through
unchanged. That pass-through carries a dangling member forward across an
edit that does not touch it.

It SHALL report a refusal inline in the editor. Saving SHALL send the
whole resolved member set, so a member the input omits is a member
removed. Cancelling SHALL leave the stored members untouched.

The screen SHALL offer deletion per row through `DELETE /admin/groups/:groupId`,
behind a confirmation naming the group. A 409 from that route means the
deletion guard fired: a published process still references the group. The
screen SHALL show that refusal as its own message.

When the 409 body carries structured blocking process ids, that message
SHALL name every blocking process by its label. It SHALL resolve each
label against the already-loaded process list.

The 409 body may instead carry only a count or a free-text message, with
no structured ids. When it does, that message SHALL be a fixed message
stating that a published process still blocks the deletion. It SHALL NOT
name individual processes by label. It SHALL NOT derive a count or any
other detail from the response body's own message text. That text carries
no safety guarantee. The rows SHALL stay unchanged after a refused
deletion.

The screen SHALL follow the same refresh convention as every other
Operations screen. That convention is an explicit refresh control and a
refetch on window focus. A reload SHALL leave an open editor's pending
text untouched. It SHALL also leave an open creation form untouched, the
same guarantee the Users screen makes.

#### Scenario: Listing groups

- **WHEN** the operator opens the Groups screen
- **THEN** the screen shows every group, each with its name, its scope, and
  its member count

#### Scenario: Reaching a group past one page

- **WHEN** more groups exist than one `GET /admin/groups` page holds
- **THEN** the screen walks the returned cursor to completion before it
  renders
- **AND** the list shows every group across every page

#### Scenario: Filtering by process narrows the list

- **WHEN** the operator picks a process in the filter
- **THEN** the list shows only global groups and groups scoped to that
  process

#### Scenario: Clearing the filter restores the full list

- **WHEN** the operator clears the process filter
- **THEN** the list shows every group again

#### Scenario: Creating a group with no filter active

- **WHEN** the operator opens the creation form with no process filter set,
  types a name, and saves
- **THEN** the screen calls `POST /admin/groups` with a global scope, and
  the new group appears among the rows

#### Scenario: Creating a group while filtered pre-fills its scope

- **WHEN** the operator opens the creation form while the process filter
  names a process, and saves without changing the scope
- **THEN** the screen calls `POST /admin/groups` with the scope set to that
  one process

#### Scenario: Renaming a group

- **WHEN** the operator opens the rename editor on a row, changes the text,
  and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/name`, and the row
  shows the new name after the refresh

#### Scenario: Cancelling a rename writes nothing

- **WHEN** the operator opens the rename editor, changes the text, and
  cancels
- **THEN** the screen sends no request, and the row shows the stored name

#### Scenario: Switching a group's scope to specific processes

- **WHEN** the operator opens the scope editor on a global group, switches
  to Processes, names one process, and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/scope` with that
  process named, and the row shows the new scope after the refresh

#### Scenario: Switching a group's scope back to global

- **WHEN** the operator opens the scope editor on a processes-scoped group,
  switches to Global, and saves
- **THEN** the screen calls the route with a global scope, and the row shows
  "Global" after the refresh

#### Scenario: The scope editor refuses a save naming no process

- **WHEN** the operator selects Processes in the scope editor, names no
  process, and tries to save
- **THEN** the screen sends no request and states why it refuses the save

#### Scenario: Editing group membership

- **WHEN** the operator opens the member editor on a row, types a
  comma-separated list of known emails, and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/members` with the
  resolved `user_id` values, and the row's member count reflects the new
  set after the refresh

#### Scenario: The member editor refuses an unknown email

- **WHEN** the operator types an email the account directory does not hold,
  and tries to save the member editor
- **THEN** the screen sends no request and names the unresolved email inline

#### Scenario: Cancelling a member edit writes nothing

- **WHEN** the operator opens the member editor, types, and cancels
- **THEN** the screen sends no request, and the row shows the stored member
  count

#### Scenario: The member editor seeds a dangling member's raw id

- **WHEN** the operator opens the member editor on a row
- **AND** that row's stored member list holds an account id no loaded
  account matches
- **THEN** the editor's initial text shows that id itself, comma-separated
  alongside any resolved emails

#### Scenario: Saving preserves a dangling member untouched

- **WHEN** the operator opens the member editor on a row holding a
  dangling member id
- **AND** edits the text without removing that id's token
- **AND** saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/members` with that
  dangling id carried forward unchanged among the resolved member ids

#### Scenario: Deleting an unreferenced group

- **WHEN** the operator confirms deleting a group no published process
  references
- **THEN** the screen calls `DELETE /admin/groups/:groupId`, and the row is gone
  after the refresh

#### Scenario: The deletion guard blocks and names the blocking processes

- **WHEN** the operator confirms deleting a group a published process still
  references
- **AND** the route answers 409 with structured blocking process ids
- **THEN** the screen names every blocking process by label
- **AND** the row stays in the list

#### Scenario: The deletion guard blocks with no structured process ids

- **WHEN** the operator confirms deleting a group a published process still
  references
- **AND** the route answers 409 with only a count or free-text message,
  carrying no structured process ids
- **THEN** the screen shows a fixed message with no count and no process
  names
- **AND** the row stays in the list

#### Scenario: A reload leaves an open editor alone

- **WHEN** the operator opens any inline editor on this screen, types, and
  the window regains focus so the screen refetches
- **THEN** the editor stays open and holds the typed text

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

### Requirement: Data is refreshed on demand, not pushed

Every screen SHALL offer an explicit refresh control and SHALL refetch when the
window regains focus. The admin area SHALL NOT poll on a timer, open a
websocket, or use server-sent events.

#### Scenario: Refocusing refetches

- **WHEN** the operator switches away from and back to the admin window
- **THEN** the current screen refetches its data

#### Scenario: No background polling

- **WHEN** the admin area is left open and untouched
- **THEN** no further requests are issued

### Requirement: A Migrations screen runs a registered plan

A `/migrations` screen SHALL let the operator pick a process, a
`fromVersion`, and a `toVersion`, then submit `POST /admin/migrations/run`.
The pick step SHALL populate its process list from the existing
`GET /processes` route. It SHALL populate its version choices from
`GET /processes/:id/versions`. Both routes are already open to any
authenticated actor. The picker SHALL NOT be more than a plain select.

Before submitting, the screen SHALL show a confirmation naming the process
and both versions. The confirmation SHALL state that the action migrates
running instances. It SHALL also name Studio's orphan-key dry run as the recommended
pre-flight check. It SHALL NOT link to or call that check directly. The
check (`GET /processes/:id/versions/:version/orphan-keys`) requires
`system:developer`, a role a `system:admin` actor does not necessarily
hold. The Migrations screen SHALL NOT add a second dry-run mode of its own.

After a run completes, the screen SHALL show the returned instance ids
grouped into four buckets: migrated, skipped, conflicted, failed. A 409
response (no plan registered for the pair) SHALL be shown as an inline
error, not a silent no-op.

The screen SHALL follow the same refresh convention as every other
Operations screen. It SHALL show no live progress during the run, since
`migrateInstances` runs to completion within the request.

#### Scenario: Running a plan and seeing the grouped result

- **WHEN** the operator confirms a migration run for a process/version pair
  with a registered plan
- **THEN** `POST /admin/migrations/run` is called, and the response's
  instance ids are shown grouped migrated/skipped/conflicted/failed

#### Scenario: The confirmation names what will be migrated

- **WHEN** the operator submits the pick step
- **THEN** a confirmation names the process, the `fromVersion`, and the
  `toVersion` before the request fires

#### Scenario: A missing plan surfaces inline

- **WHEN** the operator runs a migration for a pair with no registered plan
- **THEN** the 409 response is shown as an inline error, and no bucket list
  is rendered

#### Scenario: No forced transition or data edit is offered

- **WHEN** the Migrations screen is inspected for write actions
- **THEN** running a registered plan is the only one; no control edits
  instance `data` or forces a step transition directly

### Requirement: A Data lists screen maintains value lists

The admin area SHALL carry an overview screen listing every data list, and a
detail screen for one list. The detail screen SHALL change the list's label,
its description, and its values. It SHALL also report which processes
reference the list, and which of the list's columns each of those processes
maps.

A process that maps no column SHALL read as such in words. An empty column
area beside a named process SHALL NOT stand in for that sentence.

The screen SHALL print a mapped column key in the mono face, as the machine
value it is.

The detail screen SHALL mark an inactive value as inactive rather than hide
it. An operator then sees what a running instance can still hold. Saving
values sends the whole set, matching the route that replaces them.

Both screens SHALL sit behind `system:datalists`, not behind `system:admin`.
An actor without that role SHALL see the explanatory empty state the area
already shows for a missing role.

#### Scenario: The overview reaches the detail screen
- **WHEN** an authorized actor selects a list on the overview
- **THEN** the detail screen opens for that list

#### Scenario: The detail screen marks an inactive value
- **WHEN** a list holds an inactive value
- **THEN** the detail screen shows it and marks it inactive

#### Scenario: The detail screen names the processes that use the list
- **WHEN** a published body references the list
- **THEN** the detail screen names that process

#### Scenario: The detail screen names the columns a process maps
- **WHEN** a published body maps the list's `price` column
- **THEN** the detail screen shows `price` beside that process

#### Scenario: A process mapping nothing says so
- **WHEN** a published body reads the list and maps no column
- **THEN** the detail screen states that beside the process

#### Scenario: An actor without the data list role sees an empty state
- **WHEN** an actor holding `system:admin` but not `system:datalists` opens
  either screen
- **THEN** the area shows its explanatory empty state

### Requirement: A UI-strings screen edits wording overrides

The admin area SHALL carry a `/ui-strings` screen. It SHALL let an
operator pick an area and a locale. The choice of area SHALL come from
among the areas that already carry a `t(locale, key)` catalog. For the
selected area and locale, the screen SHALL list every catalog key. Each
row SHALL show that key's builtin value and an editable override input.

The screen SHALL seed each override input from any override already
stored for that key. Saving SHALL write the input's value as the
override. Clearing an input SHALL delete the stored override for that
key.

This screen SHALL sit behind `system:admin`, the same role every other
admin screen already requires.

#### Scenario: The screen lists a catalog's keys

- **WHEN** an operator selects an area and a locale on the screen
- **THEN** the screen lists every key that area's builtin catalog declares
  for that locale

#### Scenario: An existing override pre-fills its input

- **WHEN** a key already carries a stored override
- **THEN** the screen shows that override's value in the key's input

#### Scenario: Saving an input stores the override

- **WHEN** an operator types a value into a key's input and saves
- **THEN** the system stores that value as the key's override

#### Scenario: Clearing an input removes the override

- **WHEN** an operator clears a key's input and saves
- **THEN** the system deletes that key's stored override

#### Scenario: An actor without `system:admin` sees the empty state

- **WHEN** an actor without `system:admin` opens the screen
- **THEN** the area shows its explanatory empty state

### Requirement: The admin area renders its wording from a catalog

Every string the admin area shows an operator SHALL come from the area's own
catalog through `t(locale, key)`. The catalog SHALL carry an English and a
German map, and both maps SHALL declare the same key set.

The area SHALL render in the locale the shell holds. A locale change in the
account menu SHALL change the wording of every admin screen without a reload.

This covers screen headings, tab labels, column headers, button labels, empty
states, waiting states, confirmation prompts and the error text the area
derives from a failed request.

#### Scenario: A screen renders its catalog value

- **WHEN** an operator opens an admin screen in a supported locale
- **THEN** every heading, label and empty state on it reads its value from the
  admin catalog for that locale

#### Scenario: A locale change re-renders the area

- **WHEN** an operator switches the account menu's language while an admin
  screen is open
- **THEN** that screen re-renders its wording in the newly chosen locale

#### Scenario: Both locales declare the same keys

- **WHEN** the admin catalog's English and German maps are compared
- **THEN** each declares the same key set, so no key falls back to a missing
  value

### Requirement: A machine value stays untranslated

The admin area shows values the engine matches exactly. An instance id, a
process id, a definition hash, a version number, a role name, a data list key,
a CEL source, an outbox status token and a timer's stored fire instant are
such values.

The area SHALL render each one as the engine stores it. No such value SHALL
enter the catalog, and no such value SHALL change with the locale.

#### Scenario: An id reads the same in either locale

- **WHEN** the same instance row is shown in English and in German
- **THEN** its instance id, definition hash and version read identically in
  both

#### Scenario: A role name reads the same in either locale

- **WHEN** the users screen lists an account's roles in either locale
- **THEN** each role reads as the engine stores it, such as `system:admin`

### Requirement: A printed timestamp follows the chosen locale

The admin area prints stored instants on the instances list, the instance
record, the timers screen and the data lists screen. Each SHALL follow the
locale the shell holds, not the browser's own language setting.

An operator whose browser reports English and who picks German SHALL read
German dates.

#### Scenario: A timestamp follows the picked locale

- **WHEN** an operator whose browser reports English picks German, and opens a
  screen that prints a stored instant
- **THEN** that instant prints in the German locale's date format

### Requirement: The data list screen edits the column declaration

The data list detail screen SHALL let an operator declare the list's columns.
Each row of that editor SHALL carry a key input, a label input and a type
picker over `string`, `number` and `boolean`. The screen SHALL let the operator
add a row and remove one.

Removing a column SHALL warn the operator that the removal drops that column's
value from every value of the list. The warning appears before the save, not
after it.

Where a published process maps a removed column, the warning SHALL name that
process. It SHALL name the process once, however many of the removed columns
that process maps. A removal that no published process maps SHALL warn as it
does today, with no process named.

The screen SHALL report a rejected declaration where the data would otherwise
sit, the way every other failed request in this area already reports.

Every string the screen shows SHALL come from the admin catalog through
`t(locale, key)`, in EN and DE.

#### Scenario: An operator declares a column
- **WHEN** an operator adds a column row, fills its key, label and type, and
  saves
- **THEN** the list carries that column, and the screen shows it after the
  reload

#### Scenario: A removal warns before it saves
- **WHEN** an operator removes a column row from a list whose values fill it
- **THEN** the screen states that the values go with it, before the save

#### Scenario: A removal names the process that maps the column
- **WHEN** an operator removes a column a published process maps
- **THEN** the warning names that process, before the save

#### Scenario: A process mapping two removed columns is named once
- **WHEN** an operator removes two columns one published process maps
- **THEN** the warning names that process one time

#### Scenario: An unmapped removal warns as it did
- **WHEN** an operator removes a column no published process maps
- **THEN** the warning names no process

#### Scenario: A rejected declaration reports in place
- **WHEN** the save fails because a key breaks the grammar
- **THEN** the screen shows the error where the declaration sits, and keeps the
  operator's input

### Requirement: The data list screen edits per-value attributes

The value editor SHALL show one input per declared column, beside the value and
its label. The input SHALL match the column's declared type: a checkbox for
`boolean`, a number input for `number`, and a text input for `string`.

A list that declares no columns SHALL show the value editor exactly as it looks
today. No empty attribute area appears.

An inactive value SHALL show its attributes as readonly. The values route
retires such a value rather than editing it, so an editable input there would
promise a write that does not happen.

#### Scenario: A column adds an input to every value row
- **WHEN** a list declares a `price` column of type `number`
- **THEN** every value row carries a number input for it

#### Scenario: A list with no columns looks unchanged
- **WHEN** an operator opens a list that declares no columns
- **THEN** the value editor shows the value and its label alone

#### Scenario: An inactive value shows its attributes readonly
- **WHEN** a list holds an inactive value carrying attributes
- **THEN** the screen shows those attributes and refuses to edit them
