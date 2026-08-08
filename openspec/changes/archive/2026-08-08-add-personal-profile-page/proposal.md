## Why

A logged-in user cannot see or change anything about their own identity
today. The account menu in `packages/web/src/shell/Chrome.tsx` is a stub: a
language picker, an area switcher, and logout. It has no name and no profile
link.

The only account-editing screen that exists is the admin Users screen, gated
by `system:admin`. It edits another user's account, never the caller's own.
Locale lives only in per-browser `localStorage`, so it resets on every new
device. No route scopes to the caller's own `auth_users` row.

## What Changes

- Add self-scoped `GET /account/me` and `PATCH /account/me` routes. The
  routes scope to the caller's own resolved actor id. Neither takes a `:id`
  param and neither checks a role; any valid session reaches them. A caller
  can change `displayName` and `locale`. The response also carries `email`,
  `roles`, and `managerUserId` as read-only fields.
- `auth_users` gains an additive `locale text` column, using the same
  migration pattern as `manager_user_id` and the pending `display_name`
  column.
- `GET /account/me` distinguishes two cases. A local account has a matching
  `auth_users` row. A federated actor authenticates through JWKS with a
  non-`"bps"` issuer and has no local row. A `"bps"`-issued token already
  guarantees an active local row. A missing row is therefore an exact signal
  of federation, not an error. For a federated actor, the route returns
  `{ id, roles, editable: false }`, never a `404`.
- `PATCH /account/me` rejects a federated actor's request outright. It never
  silently ignores the write.
- `packages/web`'s `Session` type gains `displayName` and `locale`. The
  shell hydrates both from `GET /account/me` once it establishes a session.
- A new dedicated profile page lives in the shell at `/profile`, not under
  any of the four role-gated areas. Identity does not belong to a single
  role-gated area. A new entry in the existing Account menu links to it. The
  page shows the read-only fields. It lets a user change their display name
  and language.
- The page path `/profile` differs from the API path `/account/me`. The
  engine matches its route table before it serves a static asset. A shared
  path would answer a browser with JSON.
- The account menu's language picker becomes account-scoped for a signed-in
  user. It persists through `PATCH /account/me` instead of staying
  browser-only. `localStorage` stays the fallback before login.
- Password self-service stays out of scope. `local-user-accounts` already
  states a deliberate boundary: no HTTP route ever changes a password.
  Account administration stays CLI-only. This change adds no route that
  creates a user or sets a password. It adds no route that acts on another
  account.
- `local-user-accounts` also enumerates the administration routes.
  `add-user-display-name` rescopes that list to the `/admin/users` routes.
  A self-scoped route then falls outside it. This change ships no delta for
  that requirement. Two unarchived changes on one requirement would force a
  manual merge.

## Capabilities

### New Capabilities

- `account-self-service`: the self-scoped `GET`/`PATCH /account/me` routes.
  A logged-in user's own identity page, distinct from
  `admin-user-management`'s operator-facing, other-account routes.

### Modified Capabilities

- `local-user-accounts`: `auth_users` gains an additive `locale` column,
  alongside the existing `manager_user_id` pattern. No change to the
  CLI-only password-administration requirement.
- `unified-shell`: the session gains `displayName`/`locale`. The URL scheme
  gains `/profile`, a fifth top-level path that names no area. The account
  menu gains a profile-page link. Locale persistence gains an
  account-scoped path once signed in, alongside the existing browser-only
  fallback.
- `http-api-documentation`: `docs/openapi.yaml`'s enumerated
  customer-facing route list gains `GET` and `PATCH /account/me`. A token
  reaches both and no role gates either, so neither falls under the
  document's `admin/*` exclusion.

## Impact

- **Sequencing.** This change depends on `add-user-display-name` landing
  first. That change is not yet applied or archived, and OpenSpec has no
  dependency field to enforce the order. Apply and archive
  `add-user-display-name` before applying or archiving this change. It
  reuses that change's `display_name` column and its
  `COALESCE(display_name, email)` helper in `src/auth/users.ts`, instead
  of re-deriving either.
- New: a self-scoped account route module (e.g.
  `src/http/account-routes.ts`) for `GET`/`PATCH /account/me`.
- `src/http/server.ts`: wires the new route module into the composition
  root's route table, alongside the existing admin and studio route
  modules.
- `src/auth/users.ts`: `UserRow` gains `locale`. The file gains a single-row
  lookup keyed on `user_id`. `UserSummary`, `toSummary` and the four admin
  queries stay unchanged. `admin-user-management`'s documented response
  shape stays true.
- `src/engine/store.ts`: `initSchema` gains the `locale` column, additive.
- `docs/openapi.yaml`: gains entries for `GET` and `PATCH /account/me`.
- `docs/current-state.md`: the `auth_users` schema entry gains `locale`, and
  the file records the new `src/http/account-routes.ts` module.
- `docs/browser-checks.md`: gains the profile-page walk as a checklist
  entry.
- `packages/web/src/shell/session.ts`: `Session` type extended, and
  `loadSession`'s explicit object literal passes the two new fields through.
- `packages/web/src/shell/routing.ts`: `ShellLocation`/`matchShell` gain a
  case for `/profile`.
- `packages/web/src/shell/App.tsx`: its branching logic routes the new
  `ShellLocation` case, wrapping the profile page in a second direct
  `<Chrome area="profile">` call. That call and the existing forbidden-area
  branch (line 85) both supply the new profile-menu prop. `Chrome`'s call
  sites go from 5 to 6. `changeLocale` delegates to `localeSync.ts`, which
  calls `PATCH /account/me` when a session exists. The hydration call fires
  here, after login and after `loadSession()` restores a stored session.
- `packages/web/src/shell/Chrome.tsx`: the account menu gains a
  profile-page link and an `onGoToProfile` prop. `ChromeProps.area` widens
  from `Area` to `Area | "profile"`, so the page renders the ordinary
  header.
- `packages/web/src/areas/{app,admin,studio,reporting}/root.tsx`: each of
  the four area roots also instantiates `<Chrome>` and supplies
  `onGoToProfile` from the `go` it already receives. `AreaRootProps` gains
  no member.
- `packages/web/src/i18n/catalogs/shell.ts`: EN and DE entries for every new
  label, including `area.profile`. The catalog type makes a missing DE key a
  compile error.
- `packages/web/src/api/client.ts`: the `GET`/`PATCH /account/me` calls join
  the shared `request`/`AppClientError` module, beside `login`.
- `packages/web/test/session.test.ts`: the round-trip assertion covers the
  two new `Session` fields.
- `packages/web/test/routing.test.ts`: `matchShell` coverage for `/profile`
  and for a deeper path under it that must not half-match.
- `packages/web/test/locale.test.ts`: coverage for a hydrated locale adopted
  where `localStorage` holds no `app.locale`, and for a stored `app.locale`
  that survives hydration. Its fake storage object needs no DOM.
- New: `packages/web/src/shell/profileFields.ts` maps a `GET /account/me`
  response to the page's rows. `packages/web/test/profileFields.test.ts`
  covers the local and the federated response.
- New: `packages/web/src/shell/localeSync.ts`, the pure decision behind the
  language picker, with `packages/web/test/localeSync.test.ts` covering the
  signed-in and the signed-out case.
- New: `test/http-account.test.ts`, covering every `account-self-service`
  scenario against the two new routes.
- `test/auth-users.test.ts`: coverage for the `locale` column migration.
- `test/openapi-exclusions.test.ts`: `/account/me` joins the documented
  paths it asserts, beside `/ui-strings`.
- New shell-level page and route under `packages/web/src/shell/` for the
  profile screen itself.
- `packages/web/src/i18n/locale.ts` stays unchanged. It is a pure,
  storage-injectable module with no token, and the account write belongs
  where the session already is.
- No change to the CEL-visible `Actor { id, roles }` shape
  (`src/cel/eval.ts`). This stays presentation and self-service only, in
  the auth, HTTP, and web layers.
- No change to password administration. It stays CLI-only, per
  `local-user-accounts`'s existing boundary.
