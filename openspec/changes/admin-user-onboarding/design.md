## Context

See `proposal.md` for the motivation. This section covers only the pieces
the approach needs.

`src/auth/users.ts` already holds every function the CLI needs. That list is
`createUser`, `setPassword` (email-keyed), `setRoles`/`setRolesById`,
`setDisabled`, `setManagerById`, and `listUsers`. `src/http/admin-routes.ts`
exposes the `userId`-keyed ones over HTTP today.

Each route follows the same guard. It resolves the actor. It calls
`requireRole(actor, ADMIN_ROLE)`. Only then does it act.

`src/pagination.ts` already holds the keyset cursor encoder every other
admin list route shares: `encodeCursor` and `decodeCursor`. The `Page<T>`
type this change reuses lives in `src/engine/admin-queries.ts`, alongside
`MAX_LIST_LIMIT`. `admin-routes.ts` already imports both from there. Nothing
in this change needs a new pattern.

## Goals / Non-Goals

**Goals:**
- Give every remaining CLI-only `auth_users` write an HTTP door: create,
  password reset.
- Bring `GET /admin/users` in line with every other admin list route's
  pagination.
- Keep the write path identical to the CLI's. A reader should not be able
  to tell a row's origin apart, CLI or route.

**Non-Goals:**
- Self-service password reset (emailed link, token table). A future
  change, not this one.
- A password-strength rule. `Bun.password.hash` keeps accepting anything.
- Hard delete. Disable stays the only retirement path.
- Any change to how `disabled`, roles or manager assignment behave. This
  change adds two writes and paginates a read. It does not touch the four
  requirements already shipped.

## Decisions

**An operator sets the password directly, not by a self-service link.**
`POST /admin/users/:id/password` takes the new password in the request
body. It writes that password at once.

The alternative is an emailed reset link. That needs a token table. It
needs an unauthenticated consume route. It needs a send path too. It would
be the first password-reset flow the system has. `docs/current-state.md`
already states none exists today, not even for `/auth/login`.

Direct-set matches the shape every other write on this screen already
takes. An operator acts on another account's behalf. The effect lands at
once, and this needs no new infrastructure.

This design still helps if self-service ever lands. Its token flow would
still end by calling `setPasswordById`. Only the route in front of that
call would differ, unauthenticated instead of admin-gated.

**`setPasswordById` is a new function, not a new signature on
`setPassword`.** `setPassword(email, password, db)` stays as `cli.ts` calls
it today.

`setDisabled`/`setRolesById`/`setManagerById` already set the pattern this
follows: a `userId`-keyed sibling beside an email-keyed CLI function. The
reason repeats each time. The browser holds ids. A human at a terminal
types an email instead. `setPasswordById` follows that same precedent.

**Account creation reuses `createUser` unchanged.** No new function backs
it. The route parses the request body. It bounds the body's fields. It then
calls the existing function. `handleAdminSetUserRoles` already has that
same relationship with `setRolesById`.

**A duplicate email becomes a 409 from the constraint, not from a
pre-read.** `auth_users.email` already carries `UNIQUE NOT NULL`.

A `SELECT` before the insert could give a friendlier error. It would also
race a concurrent create for the same email. The constraint decides the
outcome either way, so the route leaves it to decide.

`handleAdminSetUserManager` already maps a constraint violation to a typed
400. It does so through `isManagerForeignKeyViolation`. The new route adds
a sibling check for SQLSTATE 23505 (`unique_violation`) on
`auth_users_email_key`.

**Pagination follows the outbox and timers shape exactly.** `listUsers`
gains a `page: { limit?: number; cursor?: string }` parameter. It returns
`Page<UserSummary>`, the type `src/engine/admin-queries.ts` already exports.

The list keyset-pages on `(email, user_id)`. `email` alone carries no
unique order without a tiebreaker. `(created_at, idempotency_key)` orders
outbox rows for the same reason.

`GET /admin/users` translates `limit` and `cursor` through the existing
`parseLimit` helper in `src/http/routes.ts`. It caps at the existing
`MAX_LIST_LIMIT` (200) from `src/engine/admin-queries.ts`.

`parseLimit` returns `undefined` when the request omits `limit`.

`listOutbox` and `listPendingTimers` both cover that gap already. Each
applies a private `DEFAULT_LIST_LIMIT` of 50 as its floor, still capped by
`MAX_LIST_LIMIT`. That constant stays private to `admin-queries.ts`.
`listUsers` needs its own copy in `src/auth/users.ts`.

Without that default, an unqualified `GET /admin/users` stays unbounded.
That is the exact gap this change exists to close.

**No role-bounds duplication.** `POST /admin/users`'s `roles` field reuses
the bounds `PATCH /admin/users/:id/roles` enforces. Those are 64 entries, 64
characters each, and dedup on first occurrence. `parseRoles` is already a
module-level function in `admin-routes.ts`. The new handler lands in that
same file, so it calls the helper as it stands. Nothing moves.

**The route pages. The screen holds the whole set.** The screen renders its
manager choices from `managerChoices(items, userId)`. It renders its manager
column from `managerLabel(items, managerUserId)`. Both helpers sit in
`screens/usersLogic.ts`. Both read `items` as the account directory, not as
one page of it.

Rendering one page would drop later accounts out of the choices. The label
helper would fall back to the raw `user_id` for a pointer at one of them.
Neither error surfaces. An operator sees a shorter dropdown and an opaque
string.

So the screen requests `MAX_LIST_LIMIT` and follows the cursor until none
comes back. It then holds every account, and both helpers keep working
unchanged.

A "Load more" control was the first shape here, beside a second full walk for
the candidates. It went out. The manager column reads the full set on every
row at rest, so the screen holds every account either way. A control that hid
rows already in memory was a second mechanism for nothing.

The bound the route gained is still the point. An unbounded query is the
error this change closes. A screen walking a bounded one in steps is not the
same read.

`auth_users` is an operator-scale table, so the walk is one request under 200
accounts. A dedicated candidates route is the alternative if that stops
holding. It carries a narrow projection and needs none of the work here to
arrive later.

## Risks / Trade-offs

**A created account's initial password travels out of band.** The operator
types or generates it. They hand it to the account holder some other way:
chat, or in person. This is the same risk the CLI's `add-user` already
carries. This change does not make it worse. Closing it means building the
self-service flow this change sets aside on purpose.

**No password-strength floor.** An operator can set `"a"` as a password
today, from the CLI. They will still be able to from the new routes. A
future floor is a one-line addition to `handleAdminCreateUser` and
`handleAdminSetUserPassword`, once the product wants one. This change does
not wait on that decision.

**A default page size can hide accounts.** `listUsers` defaults to 50 rows.
An operator with more than 50 accounts would see only the first page on an
unupdated screen. Nothing past it would show.

`UsersScreen.tsx`'s `load()` moves to the paginated call in this same change,
and it follows the cursor to the end (`tasks.md § 5.4`). The default and its
one consumer ship in one commit. Shipping the default alone would be the real
breaking change here.

Any later caller of `GET /admin/users` reads a page unless it asks for more.
That is the point of the bound, and it is a documented 50-row default rather
than a silent truncation.

**Pagination adds a field to the response. It does not change the
response's shape.** `handleAdminListUsers` already returns `{ items:
UserSummary[] }` (`admin-routes.ts`). The web client's `UserPage` type
already matches that same shape (`packages/web/.../api/types.ts`).

This change adds one optional field to that object: `cursor`. `OutboxPage`
and `PendingTimerPage` already carry that same field. No caller reads a bare
array today.

What moves for a caller is the meaning of `items`, not its type. It held
every account. It now holds a page. `UsersScreen.tsx` reads it two ways. One
reading is the rows to show. The other is the manager candidate set. The
screen therefore splits them apart, the way the Decisions section states.

**Two existing tests assert the state this work ends.** The first sits in
`test/http-admin.test.ts`.

<!-- The quoted string is a test name, not prose. Renaming it here would stop
     it matching the file the task edits. -->
<!-- antislop: allow synonym-rotation -->
It reads "no route creates a user, sets a password, or registers one". It
expects a 404 from `POST /admin/users`. It expects one from `POST
/admin/users/user_x/password` too. Both answer for real after this.

The second is the users-route preflight test. It expects
`Access-Control-Allow-Methods: GET`. `server.ts` derives that answer from the
route table. `POST /admin/users` joins `GET /admin/users` on one path, so the
header names both. Each test moves with this work (`tasks.md § 6.6`).

## Migration Plan

No data migration runs. `auth_users` already carries every column these
routes need. `GET /admin/users`'s response-shape change ships in the same
commit as `packages/web/src/areas/admin/api/client.ts` and the screen that
reads it. One deploy carries all of it.

## Open Questions

None. Three decisions anchor this design: direct password set, no hard
delete, no strength floor. Exploration settled each one before this change
reached a proposal.
