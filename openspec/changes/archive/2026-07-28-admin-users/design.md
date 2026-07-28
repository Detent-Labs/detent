## Context

`local-user-accounts` deliberately has no HTTP surface today: `auth_users`
carries a `disabled` boolean already honoured by `verifyLogin`, but the only
way to flip it is `src/auth/cli.ts` on a host with database access. The admin
area (`admin-shell-and-ops`, DONE) already exists as the `system:admin`-gated
operator surface, with an established handler shape
(`handleAdminX(req, resolver, db): Promise<HttpResult>` in
`src/http/admin-routes.ts`) and an established frontend shape (a screen under
`packages/admin/src/screens/` with a pure, tested logic module plus a thin
component, following `admin-shell-and-ops`'s Outbox/Timers screens). This
change adds one narrow slice — list + disable/enable — to both, reusing every
existing pattern rather than introducing a new one.

Authentication in this engine is stateless JWT: `jwtResolver`
(`src/auth/jwt.ts`) verifies signature/`exp`/`aud` and maps claims straight to
an `Actor`, with no per-request database lookup and no revocation list
(`jwt-authentication`, `local-user-accounts`). `verifyLogin` only checks
`disabled` at login time. This matters for what "disable" actually does and is
called out explicitly below rather than left implicit.

## Goals / Non-Goals

**Goals:**
- An operator can see every local user (email, roles, disabled state) and
  toggle `disabled` from `packages/admin`, without CLI/database access.
- Reuse the existing admin route/handler/error-mapping shape and the existing
  screen shape exactly — no new architectural pattern.

**Non-Goals:**
- No create-user, password-change, or role-assignment UI or route. Those stay
  CLI-only (`local-user-accounts`, unmodified beyond the narrow carve-out).
- No session/token revocation. Disabling a user blocks their *next* login
  (`verifyLogin` already rejects `disabled = true`) but does **not** invalidate
  a JWT issued before the disable — that token remains valid until its
  existing `exp` (up to 8h), exactly as `jwt-authentication` already documents
  for every token, disabled or not. Adding revocation (a denylist, short-lived
  tokens + refresh, etc.) is a separate, unscoped decision; this change does
  not alter the JWT model, only adds a way to flip the DB flag over HTTP.
- No pagination edge-case handling beyond what `listInstances`-style keyset
  paging already establishes — see Decisions.

## Decisions

- **Route shape**: `GET /admin/users`, `POST /admin/users/:id/disable`, `POST
  /admin/users/:id/enable` in the existing `src/http/admin-routes.ts`, not a
  new file. Precedent: outbox and timers handlers already share that one file
  under `admin-operations-api`; a fourth resource doesn't justify a split.
  Two POST actions instead of one `PATCH .../disabled { disabled }` because
  every other admin write in this file (`retry`/`discard`) is an action verb
  on a sub-path, not a partial-update body — consistency over REST purity.
- **`listUsers` returns the full table, no paging.** Every other admin list
  (`listOutbox`, `listPendingTimers`) is keyset-paged because those tables grow
  with instance/action volume. `auth_users` grows with headcount — CLI-created,
  deliberately rare (`local-user-accounts`'s own framing). Add paging if a
  deployment's user count ever makes that wrong; it would be a mechanical
  follow-up, not a redesign.
- **`setDisabled(userId, disabled, db)` takes a boolean, not two functions.**
  One function with one `UPDATE ... WHERE user_id = $1` rather than inventing
  `disableUser`/`enableUser` as a pair; the two HTTP routes call the same
  function with `true`/`false`. It returns the updated `UserSummary` (via
  `RETURNING user_id, email, roles, disabled`), or `undefined` if no such
  `userId` exists, so the HTTP handler can answer 200/404 from that one call
  without a second `listUsers` query to fetch the row it just wrote.
- **Keyed by `userId`, not `email` like its siblings.** `setRoles` and
  `setPassword` take an `email` because their only caller, the CLI, is a human
  typing an address they know. `setDisabled`'s caller is the new HTTP route,
  addressing a row from a `listUsers` result that already carries `userId` —
  the table's actual primary key, and the value that's actually stable if an
  email is ever changed (not itself in scope here). Matches this codebase's
  general convention of an opaque id as the sole reference anchor over a
  mutable human-readable field (`CLAUDE.md`'s "Identity" principle, applied
  here to `auth_users` rather than process/instance entities). The
  inconsistency with its two siblings is deliberate, not an oversight.
- **No self-disable guard, and no "last admin" guard.** An admin disabling
  their own account, or the last remaining `system:admin` account (their own
  or someone else's), is allowed. Both are reversible only via the CLI
  (`set-roles`/direct SQL) once it happens — there is deliberately no HTTP path
  back if every `system:admin` account is disabled. Not worth a special case
  for a self-inflicted, reversible-via-CLI mistake — matches this codebase's
  general preference for the CLI as the ultimate recovery path, same as an
  unresolvable JWT config already relies on host access to fix.
- **Users screen has no create/edit form**, only a table + toggle, per
  Non-Goals — keeps the screen a thin read-plus-one-action view like Outbox,
  not a user-management console.

## Risks / Trade-offs

- [A disabled user's already-issued token keeps working until it expires] →
  Documented in Non-Goals and will be documented again in the spec delta and
  the screen's confirmation copy ("blocks future logins; active sessions
  expire naturally within 8h"), so an operator reaching for this during an
  incident doesn't assume immediate lockout.
- [No paging on `listUsers`] → Acceptable at CLI-provisioned scale; revisit if
  a deployment's user count grows large enough to matter (mechanical fix, see
  Decisions).
- [An operator could disable every `system:admin` account, including their
  own, locking the admin area's HTTP surface out entirely] → Accepted: the CLI
  (`set-roles`, or a direct `UPDATE auth_users SET disabled = false`) remains
  a working recovery path with database access, same as recovering from a lost
  `AUTH_JWT_SECRET`. A guard against it is a judgment call for a future change
  if this actually bites someone, not a default to build speculatively.

## Migration Plan

Purely additive: new functions, new routes, new screen, one narrowed
requirement in `local-user-accounts` (existing CLI paths unchanged). No schema
change (`disabled` column already exists), no data migration, no rollback
concern beyond reverting the change.

## Open Questions

None — scope is fixed by `ROADMAP.md` stage 10 ("one new function,
`users.ts::setDisabled`, for user administration").
