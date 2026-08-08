## Why

A logged-in user cannot see or change anything about their own identity
today. The account menu in `packages/web/src/shell/Chrome.tsx` is a stub: a
language picker, an area switcher, and logout. It has no name and no profile
link.

The only account-editing screen that exists is the admin Users screen, gated
by `system:admin`. It edits another user's account, never the caller's own.
Locale lives only in per-browser `localStorage`, so it resets on every new
device. No route anywhere scopes to the caller's own record.

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
- A new dedicated profile page lives in the shell, not under any of the
  four role-gated areas. Identity does not belong to a single role-gated
  area. A new entry in the existing Account menu links to it. The page
  shows the read-only fields and lets a user change their display name and
  language.
- The account menu's language picker becomes account-scoped for a signed-in
  user. It persists through `PATCH /account/me` instead of staying
  browser-only. `localStorage` stays the fallback before login.
- Password self-service stays out of scope. `local-user-accounts` already
  states a deliberate boundary: no HTTP route ever changes a password.
  Account administration stays CLI-only. This change does not touch that
  boundary.

## Capabilities

### New Capabilities

- `account-self-service`: the self-scoped `GET`/`PATCH /account/me` routes.
  A logged-in user's own identity page, distinct from
  `admin-user-management`'s operator-facing, other-account routes.

### Modified Capabilities

- `local-user-accounts`: `auth_users` gains an additive `locale` column,
  alongside the existing `manager_user_id` pattern. No change to the
  CLI-only password-administration requirement.
- `unified-shell`: the session gains `displayName`/`locale`. The account
  menu gains a profile-page link. Locale persistence gains an
  account-scoped path once signed in, alongside the existing browser-only
  fallback.

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
- `src/auth/users.ts`: handles the new `locale` column alongside the
  existing display-name resolution.
- `src/engine/store.ts`: `initSchema` gains the `locale` column, additive.
- `packages/web/src/shell/session.ts`: `Session` type extended.
- `packages/web/src/shell/routing.ts`: `ShellLocation`/`matchShell` gain a
  case for the profile page.
- `packages/web/src/shell/App.tsx`: its branching logic routes the new
  `ShellLocation` case; its own direct `<Chrome>` call (the forbidden-area
  branch) gains the new profile-menu prop.
- `packages/web/src/shell/Chrome.tsx`: account menu gains a profile-page
  link and a new prop for it.
- `packages/web/src/areas/{app,admin,studio,reporting}/root.tsx`: each of
  the four area roots also instantiates `<Chrome>` and needs the same new
  prop threaded through.
- New shell-level page and route under `packages/web/src/shell/` for the
  profile screen itself.
- `packages/web/src/i18n/locale.ts`: locale persistence gains an
  account-scoped path alongside the existing `localStorage` one.
- No change to the CEL-visible `Actor { id, roles }` shape
  (`src/cel/eval.ts`). This stays presentation and self-service only, in
  the auth, HTTP, and web layers.
- No change to password administration. It stays CLI-only, per
  `local-user-accounts`'s existing boundary.
