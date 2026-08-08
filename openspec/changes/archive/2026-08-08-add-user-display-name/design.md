## Context

See proposal.md - Why. `auth_users` (`src/engine/store.ts`) holds `user_id`,
`email`, `password_hash`, `roles`, `disabled`, `manager_user_id`. Nothing in
it is a human-readable name. `verifyLogin` and `listUsers`
(`src/auth/users.ts`) both turn a row into something a caller reads.
`handleLogin` (`src/auth/login.ts`) and `GET /admin/users`
(`src/http/admin-routes.ts`) are the two HTTP surfaces that would carry a
display name outward.

## Goals / Non-Goals

**Goals:**
- One resolved, non-empty display value for a user, readable from the login
  response and the admin user list.
- The same management shape (CLI + gated HTTP route) roles and manager
  already have.

**Non-Goals:**
- Wiring the value into `packages/web` (`Session`, `Chrome`). Separate,
  deliberate follow-up.
- Splitting a name into parts (first/last, given/family). See the earlier
  conversation for that trade-off. A single field stays reversible; a split
  one is not.
- A UI for bulk-editing display names. The existing admin Users screen picks
  this up in its own follow-up.

## Decisions

<!-- antislop: allow synonym-rotation -->
**Single `display_name text` column, nullable.** This matches the id/label
split already used throughout the process contract. That split uses an
opaque anchor plus one display string, never a decomposed one. A migration
adds the column via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. That is the
same additive pattern `manager_user_id` already set.

**Resolution lives once, in `src/auth/users.ts`.** A small helper backs
both `verifyLogin` and `listUsers`. Neither the login response nor the
admin listing can then disagree about a given user's displayable name. One
alternative was resolving independently at each HTTP handler. This design
rejects that. Two resolution sites is exactly the drift the proposal's Why
section warns against.

**`add-user` takes an optional trailing display-name argument.** A sibling
command, `set-name`, covers accounts that already exist. Full usage reads
`add-user <email> <password> [roles] [display-name]`, with the last two
arguments optional. Skipping the display name leaves a fresh account with
no name, resolving to email until someone sets one later. The `set-name
<email> <display-name>` command mirrors `set-roles`, `set-password` and
`set-manager` for existing accounts. Neither needs a `-` placeholder for
"skip this argument", the convention `set-manager` uses to clear a value.
Display name always sits last in the argument list, so a caller who wants
to skip it just omits it.

An account with no roles passes an empty roles argument. That reads
`add-user <email> <password> "" <display-name>`. `cli.ts` reads a falsy
roles argument as the empty set already.

`createUser` and `setDisplayName` trim that argument. They store `NULL`
when the trimmed result is empty, never the empty string itself. This
applies whether the value arrives through the CLI or a direct call. It is
what keeps the "never empty" resolution invariant true on every write path,
not only the HTTP route's own 400.

`normalizeDisplayName` is the helper behind that trim. It carries the
200-character bound too, and it throws past that bound. Every write path
runs it: `createUser`, `setDisplayName`, `setDisplayNameByEmail` and
`updateAccount`. The bound is therefore one rule, and the CLI cannot store
a name a route would refuse.

Both routes still answer 400. Each checks the value with
`validateDisplayName` before it writes, so neither reaches the throw. The
CLI runs no such check. An over-long name there prints the thrown message
and exits non-zero, the same way an unknown email already does.

An empty value is the one case the two paths answer differently. The routes
refuse it with 400, because telling the caller beats accepting a value and
changing it. On the CLI path the helper stores `NULL`, which resolves back
to the email.

**`PATCH /admin/users/:id/name` accepts a body shaped `{ displayName:
string | null }`, described below.** A `null` value clears the column and
falls back to email. That mirrors how `PATCH /admin/users/:id/manager`
already treats a `null` value. A non-null value gets trimmed first. The
route then bounds it at 200 characters, the same trim-then-validate shape
the roles route already applies. That bound is generous for a human name,
and it still rejects pathological input.

The bound and the empty-after-trim rejection ship as one exported helper in
`src/auth/users.ts`. That helper is a `DISPLAY_NAME_MAX_LENGTH` constant
plus a `validateDisplayName(value)`. It returns the trimmed value, or
signals the 400. The route calls it. A later self-scoped route calls that
same one. Two validators drift the way two resolvers would.

**The CLI-only rule covers the `/admin/users` routes only.** The
`local-user-accounts` delta enumerates the account-administration routes
under `/admin/users`. It does not enumerate every route that writes an
`auth_users` column. A later self-scoped route then extends that requirement
instead of contradicting its count. One example is a route that writes the
caller's own `display_name`.

**No change reaches `Actor { id, roles }` or the `jwtResolver`
implementation.** The display name is a response-body field on two
specific HTTP endpoints only. CEL guards and assignment strategies never
read it; they read the trusted identity object instead. Keeping it out of
`Actor` leaves that trusted shape unchanged. That is also why this change
touches no `jwt-authentication` or `actor-resolution` spec.

## Risks / Trade-offs

<!-- antislop: allow synonym-rotation -->
[An account holder sets an empty-looking display name] → the route rejects
an empty-after-trimming `displayName` with 400. Only `NULL`, never `""`,
falls back to email.

[Two divergent notions of "resolved name" creep back in later, one per
caller] → prevented by design. The single resolution point exists exactly
to stop this drift. A future reader, an export for example, should call
that same helper. It should never re-derive the `COALESCE` rule on its own.

[An externally-authenticated actor has no `auth_users` row] → this
mechanism resolves no display name for that actor. Columns like `roles`
and `manager_user_id` already cover only local accounts, the same way.
ROADMAP stage 25c names a future Entra ID or AD switch as plausible, still
out of scope today. Nothing here needs undoing for it.

The deferred header-wiring follow-up still needs its own answer for that
actor. A JWT-claim fallback is one option. Showing no display element at
all is another. This change supplies neither.

## Migration Plan

<!-- antislop: allow synonym-rotation -->
Additive only. One statement inside the existing `initSchema` adds the
column: `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS display_name
text`. It applies on the next server start, against any database, fresh or
existing. Every pre-existing row gets `NULL` in that column.

That `NULL` resolves to the row's own email, until someone sets a value
through the CLI or the new route. No backfill script and no downtime follow
from this. No rollback beyond dropping the column applies either. That step
is never required: a `NULL` column changes no existing behavior.

## Open Questions

None. The earlier conversation settled the scope, the field shape, the
resolution rule, and how this gets managed, before this proposal.
