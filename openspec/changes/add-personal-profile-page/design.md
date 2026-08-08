## Context

See `proposal.md` for the motivation. This section covers only the
implementation state that shapes the approach.

`src/http/admin-routes.ts` and `src/http/studio-routes.ts` set the
precedent for a route module: one file per route family, wired into the
composition root in `src/http/server.ts`. This change adds
`src/http/account-routes.ts` the same way.

Every route today resolves an `Actor { id, roles }` through the
`ActorResolver` seam (`src/auth/resolve.ts`) before it reaches a handler.
No existing route scopes itself to the resolved actor's own id instead of
a role. Every self-scoping check this change needs is new.

`jwt-authentication` already defines the signal this design reuses. A
`"bps"`-issued token guarantees an active `auth_users` row; the resolver
raises `ActorResolutionError` otherwise. An externally issued token
carries no such guarantee, and the engine holds no directory entry for
it.

This change depends on `add-user-display-name` landing first. That change
adds the `display_name` column and the `COALESCE(display_name, email)`
resolution helper in `src/auth/users.ts`, both of which this change
reuses.

## Goals / Non-Goals

**Goals:**

- Let a signed-in user read and change their own `displayName` and
  `locale`, through routes scoped to their own resolved actor id.
- Give a federated actor, one with no local `auth_users` row, a correct,
  non-error read of their own identity.
- Move locale from a browser-only preference to an account-scoped one,
  without breaking the pre-login picker.
- Add a dedicated profile page in the shell, linked from the account
  menu.

**Non-Goals:**

- Password self-service. `local-user-accounts` already forbids any HTTP
  route that changes a password. This change does not touch that
  boundary.
- A general resource-ownership authorization primitive.
  `account-self-service` scopes from the resolved token alone. No route
  gains a reusable ownership check from this.
- A subject-claim override for a federated actor whose `sub` is not a
  stable identifier, such as Entra ID's `oid`. The `jwt-authentication`
  capability already names that a known gap. This change neither closes
  it nor depends on it.
- Any change to `Actor { id, roles }`, the CEL-visible shape. This stays
  entirely in the auth, HTTP, and web layers.

## Decisions

**Self-scoping by token identity, not a role check.** `GET`/`PATCH
/account/me` take no `:id` and check no role. The resolved actor's own id
is the only input.

The alternative was a self bypass added to the existing
`system:admin`-gated routes in `admin-user-management`. That would mix
the administrator's act-on-any-account semantics with self-service,
act-on-your-own semantics, in one route family. Every other route in
that family stays admin-only on purpose, so this design keeps a separate
route family instead.

**A federated actor's `GET /account/me` returns `200` with `editable:
false`, never `404`.** A `"bps"`-issued token already guarantees an
active local row, per `jwt-authentication`'s re-read requirement. A
missing row is therefore an exact signal of federation, not a missing
account.

This design rejects the alternative, a `404`. A real, authenticated user
viewing their own profile would see an error state. That case is not an
error.

**`locale` is a closed set, reusing `packages/web`'s `UiLocale` type,**
`"en" | "de"` today. This design rejects the alternative, an unvalidated
string. Nothing downstream should receive a locale outside what the two
shipped catalogs cover.

**`PATCH /account/me` refuses an unknown body key with `400`,** rather
than ignoring it. This mirrors `admin-user-management`'s bounded-input
handling on `PATCH /admin/users/:id/roles`. A self-service write path is
a trust boundary. Input validation there stays strict, even where the
rest of this change favors the smaller approach.

**The shell hydrates `displayName`/`locale` with a `GET /account/me` call
after login,** rather than growing the `POST /auth/login` response again.
`add-user-display-name` already adds `actor.displayName` to that
response.

This design rejects growing the login response with `locale`.

Doing so would touch an already-drafted shape a second time.

It would also couple login, a hot path, to a field only this change
needs.

`GET /account/me` stays the one source of self-facing profile data.

**The profile page lives under the shell, not under an area.** Identity
applies to every signed-in actor, regardless of role. It does not belong
to one of the four role-gated areas. It sits beside the login screen and
session module, both already shell-owned.

**`auth_users` gains a typed `locale text` column, not a `preferences`
jsonb blob.** Already decided in `proposal.md`; restated here as a design
decision too. One additive column per concrete preference matches the
existing `manager_user_id`/`display_name` pattern. A jsonb blob would
speculate on preferences that do not exist yet.

## Risks / Trade-offs

**Ordering risk.** This change reads and writes a `display_name` column
that does not exist until `add-user-display-name` lands. If this change
merges first, the account routes would target a column missing from
`auth_users`.

Mitigation: sequence application strictly after `add-user-display-name`.
`tasks.md` states this as the first task.

**One extra request after login.** Hydrating `displayName`/`locale`
costs one indexed, single-row read that the login response does not
already carry.

Mitigation: the shell does not block login on it. The session works at
once, and the two fields fill in once the call resolves.

**A federated actor with `editable: false` might expect to change their
name here, and find they cannot.**

Mitigation: the profile page shows an explanatory state for that case,
not a blank or broken form. See the `unified-shell` delta's "A federated
actor sees an identity-only profile page" scenario.

## Migration Plan

1. Apply `add-user-display-name` first (already a separate, drafted
   change). This change's tasks assume `display_name` and its resolution
   helper already exist.
2. Add an additive migration: `locale text` on `auth_users`, the same
   `ALTER TABLE` pattern `manager_user_id` and `display_name` used. No
   backfill. Every pre-existing row gets `NULL`.
3. Add `src/http/account-routes.ts`. Wire it into `src/http/server.ts`,
   alongside the existing admin and studio route modules.
4. Extend `packages/web/src/shell/session.ts`'s `Session` type with
   optional `displayName`/`locale`. Add the post-login hydration call. A
   stored session predating this change lacks both fields. The shell
   treats it as valid, not malformed, and hydrates it on next use (see
   the `unified-shell` delta).
5. Add the profile page and its account-menu entry.
6. Wire the account menu's language picker to `PATCH /account/me` for a
   signed-in actor, keeping the existing `localStorage` write.

Rollback: each step is independent and additive. Reverting the frontend
steps (4-6) leaves the backend routes unused, but harmless. Reverting the
migration drops the `locale` column; no other part of the schema
references it.

## Open Questions

- Exact route path: `/account/me` versus `/profile/me` versus something
  else. Cosmetic; it does not change the specs or the approach.
- Whether the profile page's federated-actor explanatory state names the
  configured issuer, or stays generic. A UI-copy decision, deferrable to
  implementation.
