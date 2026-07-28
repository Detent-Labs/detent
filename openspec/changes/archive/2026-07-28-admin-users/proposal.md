## Why

Stage 10 (`ROADMAP.md`) needs a user-administration screen so an operator can
disable a compromised or offboarded account without shell/CLI access to the
deployment. Today `local-user-accounts` deliberately exposes no HTTP route for
user administration at all — every account action requires `src/auth/cli.ts`
on the host running the database. That is the right default for account
creation and password/role changes (rare, deliberate, worth a human at a
terminal), but disable/enable is the one action an operator needs routinely
and urgently (e.g. reacting to a leaked credential), and the admin area
(`admin-shell-and-ops`) already exists as the `system:admin`-gated surface for
exactly this kind of operational action.

## What Changes

- New `src/auth/users.ts::listUsers` and `setDisabled` functions: list users
  (email, roles, disabled state) and flip the `disabled` flag by `userId`.
- New `system:admin`-gated HTTP routes in `src/http/admin-routes.ts`:
  `GET /admin/users`, `POST /admin/users/:id/disable`, `POST
  /admin/users/:id/enable` — following the existing `handleAdminX` handler
  shape and `src/http/errors.ts` mapping.
- New "Users" screen in `packages/admin`: lists users with roles and disabled
  state, offers a disable/enable toggle. No create-user, password, or
  role-editing UI — those stay CLI-only.
- Narrows `local-user-accounts`'s "CLI-only, no HTTP route" requirement:
  disabling/enabling an existing user (and listing users for that purpose) is
  now also reachable via the new gated HTTP route. Creating a user, setting a
  password, and assigning roles remain CLI-only — this change adds no HTTP
  path for any of those three.

## Capabilities

### New Capabilities

- `admin-user-management`: the engine functions and `system:admin`-gated
  `/admin/users*` HTTP routes for listing users and toggling `disabled`. The
  only HTTP surface for user administration; creation, password changes, and
  role assignment remain CLI-only per `local-user-accounts`.

### Modified Capabilities

- `local-user-accounts`: the "Users are administered from a CLI, never over
  HTTP" requirement is narrowed to creation, password changes, and role
  assignment. Listing users and toggling `disabled` are now also reachable via
  the new `admin-user-management` HTTP route, gated by `system:admin`.
- `admin-app`: adds a "Users" screen to the operator shell (list + disable/
  enable), reusing the existing role-gated presentational pattern and refetch-
  on-focus/explicit-refresh convention.

## Impact

- `src/auth/users.ts` (new functions), `src/http/admin-routes.ts` (new
  handlers), `src/http/server.ts` (route wiring) — all existing files, no new
  modules.
- `packages/admin`: new screen + nav entry, following the existing Operations/
  Outbox/Timers screen shape.
- `openspec/specs/local-user-accounts/spec.md` and
  `openspec/specs/admin-app/spec.md` gain delta specs; no schema change (the
  `auth_users.disabled` column already exists).
