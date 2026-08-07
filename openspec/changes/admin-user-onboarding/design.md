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
admin list route shares: `encodeCursor` and `decodeCursor`. It also holds
the `Page<T>` type `src/engine/admin-queries.ts` re-exports. Nothing in this
change needs a new pattern.

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
`Page<UserSummary>`.

The list keyset-pages on `(email, user_id)`. `email` alone carries no
unique order without a tiebreaker. `(created_at, idempotency_key)` orders
outbox rows for the same reason.

`GET /admin/users` translates `limit` and `cursor` through the existing
`parseLimit` helper in `src/http/routes.ts`. It caps at the existing
`MAX_LIST_LIMIT` (200) from `src/engine/admin-queries.ts`. This change adds
no new constant.

**No role-bounds duplication.** `POST /admin/users`'s `roles` field reuses
the exact bounds `PATCH /admin/users/:id/roles` already enforces: 64
entries, 64 characters each, dedup on first occurrence. The implementation
pulls `admin-routes.ts`'s existing `parseRoles` helper out for both call
sites. Neither route copies its body.

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

**Pagination changes `GET /admin/users`'s response shape.** That is a
breaking change on its own. The response moves from a bare array to a page
object.

`GET /admin/outbox` and `GET /admin/timers` already return that same page
shape. `packages/web/src/areas/admin/api/client.ts` and `UsersScreen.tsx`
both move to the new shape here, in this same commit. No caller keeps
reading the old shape once this ships.

## Migration Plan

No data migration runs. `auth_users` already carries every column these
routes need. `GET /admin/users`'s response-shape change ships in the same
commit as `packages/web/src/areas/admin/api/client.ts` and the screen that
reads it. One deploy carries all of it.

## Open Questions

None. Three decisions anchor this design: direct password set, no hard
delete, no strength floor. Exploration settled each one before this change
reached a proposal.
