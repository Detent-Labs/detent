## Context

See `proposal.md` for the motivation. This section covers only the
implementation state that shapes the approach.

`src/http/admin-routes.ts` and `src/http/studio-routes.ts` set the
precedent for a route module: one file per route family, wired into the
composition root in `src/http/server.ts`. This change adds
`src/http/account-routes.ts` the same way.

Every route that acts on behalf of a person resolves an `Actor { id, roles }`
through the `ActorResolver` seam (`src/auth/resolve.ts`) before reaching a
handler. Five routes resolve no actor at all: `GET /livez`, `GET /readyz`,
`GET /metrics`, `GET /ui-strings` and `POST /auth/login`.

`GET /instances?scope=mine` already derives its filter from the resolved
actor rather than from a role (`src/http/routes.ts:378`). It also refuses a
request that pairs `scope=mine` with an explicit `assignedTo` (:366). No
caller can name someone else's id there. The account routes follow the same
shape. Each reads the id from the resolved actor alone and accepts nothing
that overrides it.

`jwt-authentication` already defines the signal this design reuses. A
`"bps"`-issued token guarantees an active `auth_users` row; the resolver
raises `ActorResolutionError` otherwise. An externally issued token
carries no such guarantee, and the engine holds no directory entry for
it.

That reasoning holds for `jwtResolver` only. The second shipped resolver,
`devHeaderResolver` (`src/auth/resolve.ts:36-43`), builds an `Actor` from an
unsigned `X-Actor-Id` header and reads no directory.
`.devcontainer/docker-compose.yml` selects it.

Under that resolver a missing `auth_users` row means only that the header
named no local account. It says nothing about an external issuer. The route
answers the same way in both cases. Only the explanation the page shows
differs.

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

This design needs no new dispatch primitive. `src/http/routes.ts`
already has the right pattern. It pairs `guarded` with `resolveActor`
and skips `requireRole`. `handleClaim` and `handleGetInstanceView` use
exactly that today. `account-routes.ts` follows the same shape.

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
than ignoring it. No existing route follows this pattern.
`admin-user-management`'s roles route bounds the *contents* of the
`roles` array: trim, dedupe, length, count. Its manager route silently
ignores any body key beyond `managerUserId`.

This is a deliberate exception, not a mirror of either. A self-service
write path is a trust boundary. Input validation there stays strict,
even where the rest of this change favors the smaller approach. No
sibling route validates this strictly, and that is fine here.

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

**The shell page and the API routes take different paths.** The page is
`/profile`. The routes stay `GET` and `PATCH /account/me`.
`src/http/server.ts` matches its route table before it falls through to
static serving (`:613-623`). A page path equal to an API path therefore
answers a browser navigation with JSON instead of the app. An `/admin/*`
route collision is one of three defects `CLAUDE.md` records as shipped past
a green suite here. The chosen path matches no route-table entry and no
prefix in `AREAS` (`packages/web/src/shell/areas.ts:9`).

**The page keeps the ordinary header.** `ChromeProps.area` widens from
`Area` to `Area | "profile"`. The shell catalog gains an `area.profile` key
in EN and DE. The tab label at `Chrome.tsx:50` builds its key from the
`area` prop, so it keeps working unchanged.

The area switcher needs no change either. It lists `permittedAreas(roles)`
minus the current value (`Chrome.tsx:31`). No actor's permitted set holds
`"profile"`, so on this page the switcher lists every area that actor may
enter. `unified-shell`'s "The area switcher shows only other permitted
areas" stays true. On a page that is no area, every permitted area is
another one.

This design rejects the alternative, a reduced header for this one page. An
actor there would have no account menu, no switcher and no logout. The page
would be a dead end.

**`auth_users` gains a typed `locale text` column, not a `preferences`
jsonb blob.** Already decided in `proposal.md`; restated here as a design
decision too. One additive column per concrete preference matches the
existing `manager_user_id`/`display_name` pattern. A jsonb blob would
speculate on preferences that do not exist yet.

**`src/auth/users.ts` touch points for `locale`: `UserRow` and one new
query, nothing else.** `GET /account/me` needs its own single-row lookup
keyed on `user_id`, not a reuse of `listUsers`. That function returns every
account with no `id` filter. That fits the admin route's list view. A
self-service read of one row needs its own query instead.

`UserSummary`, `toSummary` and four `SELECT`/`RETURNING` column lists stay
as they are. Those lists sit in `listUsers`, `setRolesById`, `setDisabled`
and `setManagerById`. Widening them would change the body of `GET
/admin/users` and of the four `/admin/users/:id/*` routes. Three
requirements in `admin-user-management` pin that shape as `{ userId, email,
roles, disabled }`. This change ships no delta for that capability and needs
none. No requirement here reads `locale` through those four queries.

Publishing a locale to the Users screen is a second reason to leave them
alone. Nothing on that screen asks for it.

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

**Under `devHeaderResolver`, an unknown header value reads as federated.**
That resolver consults no directory. Any `X-Actor-Id` naming no `auth_users`
row therefore gets `editable: false`, and a `403` on write. A developer who
types an arbitrary header value sees the external-identity state on a local
install.

Mitigation: none in code. The route behaves correctly in both cases, and the
devcontainer's seeded accounts do have rows. Task 2.6's coverage creates a
real `auth_users` row and sets `X-Actor-Id` to its `user_id`. That is the
shape `test/http-admin.test.ts:302` already uses, so the tests exercise the
local path.

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
   optional `displayName`/`locale`. Pass both through `loadSession`'s
   explicit object literal (`session.ts:41`), which rebuilds the object
   field by field and would otherwise drop them. Add the hydration call. A
   stored session predating this change lacks both fields. The shell
   treats it as valid, not malformed, and hydrates it on next use (see the
   `unified-shell` delta).
5. Extend `packages/web/src/shell/routing.ts`'s `ShellLocation`/
   `matchShell` with a case for `/profile`, and `App.tsx`'s render
   branching to route it. Add the profile page component, wrapped in a
   second direct `<Chrome area="profile">` call in `App.tsx`. Thread a new
   profile-menu prop through `Chrome.tsx` and all 6 of its call sites. Five
   exist today: `App.tsx`'s forbidden-area branch at line 85, and the four
   area roots. The sixth is that new profile branch, with the same prop set
   line 85 already supplies.
6. Wire the account menu's language picker to `PATCH /account/me` for a
   signed-in actor, keeping the existing `localStorage` write. That wiring
   lands in `App.tsx`'s `changeLocale` (`App.tsx:54-57`), which already
   holds both the session and the `persistLocale` call.
   `packages/web/src/i18n/locale.ts` stays unchanged. It is a pure,
   storage-injectable module with no token. A fetch inside it would break
   `packages/web/test/locale.test.ts`.

Rollback: each step is independent and additive. Reverting the frontend
steps (4-6) leaves the backend routes unused, but harmless. Reverting the
migration drops the `locale` column; no other part of the schema
references it.

## Open Questions

- Whether the profile page's federated-actor explanatory state names the
  configured issuer, or stays generic. A UI-copy decision, deferrable to
  implementation.
