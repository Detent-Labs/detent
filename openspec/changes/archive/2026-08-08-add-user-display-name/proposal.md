## Why

A logged-in user has an opaque `user_id`. A logged-in user also has the email
they typed to log in, but only for that one request. Nothing in `auth_users`
holds a name a screen can display. The account area, and later the shell
header, needs a human-readable identity to display. Today no field holds one.

## What Changes

<!-- antislop: allow synonym-rotation -->
- Add a nullable `display_name` column to `auth_users` (an `ALTER TABLE ...
  ADD COLUMN IF NOT EXISTS` migration, additive, no forced backfill of
  existing rows).
- Resolve the human-readable name centrally in `src/auth/users.ts` as
  `COALESCE(display_name, email)`. This keeps the value non-null and
  non-empty wherever a caller reads it. One resolution point serves every
  caller, not two independent fallback checks that could drift apart.
- `POST /auth/login`'s response gains `actor.displayName` (the resolved
  value) alongside the existing `actor.id`/`actor.roles`.
- `GET /admin/users` gains a resolved `displayName` per user, same resolution
  rule.
- A new `PATCH /admin/users/:id/name` route lets an operator set an account's
  `display_name` over HTTP, gated by `system:admin`, mirroring the existing
  roles/manager routes.
- The CLI (`src/auth/cli.ts`) gains a `set-name <email> <display-name>`
  command mirroring `set-roles`/`set-password`/`set-manager`.
- Explicitly out of scope: wiring `displayName` into `packages/web`'s
  `Session` type or into the shell header UI. That is a deliberate follow-up
  change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

<!-- antislop: allow synonym-rotation -->
- `local-user-accounts`: the `auth_users` schema gains `display_name`.
  `verifyLogin` (and the CLI-facing `createUser`) resolve and expose a
  non-empty display name. `POST /auth/login`'s response shape gains
  `actor.displayName`. The CLI gains a `set-name` command. "Operator" names
  the administrator issuing a command here, distinct from "user", the account
  administered.
- `admin-user-management`: `GET /admin/users` gains a resolved `displayName`
  per row. A new `PATCH /admin/users/:id/name` route sets `display_name`,
  gated by `system:admin` like the existing roles/manager routes.

## Impact

- `src/engine/store.ts`: `initSchema`'s `auth_users` DDL gains one column.
- `src/auth/users.ts`: a resolution helper. `verifyLogin`/`listUsers` use it,
  alongside `setRolesById`/`setDisabled`/`setManagerById`, which share the
  same row mapping. A new `setDisplayName` function, keyed by `user_id`, plus
  its email-keyed sibling `setDisplayNameByEmail` for the CLI.
- `src/auth/login.ts`: response shape gains `actor.displayName`.
- `src/auth/cli.ts`: new `set-name` command.
- `src/http/admin-routes.ts`: new `PATCH /admin/users/:id/name` route.
- `src/http/server.ts`: that route's entry in the route table, alongside the
  existing `/admin/users/:userId/manager` entry.
- `scripts/seed.ts`: its `createUser` call site, which passes `db`
  positionally today and needs the new parameter accounted for.
- `docs/openapi.yaml`: `LoginResponse.actor` gets its own schema carrying
  `displayName`. The shared `Actor` schema stays as it is, since it also
  documents the trusted authorization identity.
- `docs/current-state.md`: the `auth_users` schema entry and the `listUsers`
  field list.
- `openspec/specs/admin-user-management/spec.md`: the Purpose paragraph at
  lines 5-9 names listing, the `disabled` toggle and roles. It gains manager
  and display name (task 7.3). Purpose carries no requirement text, so no
  delta spec covers it. The edit lands at sync or archive time, not during
  implementation.
- `test/auth-users.test.ts`, `test/auth-login.test.ts`,
  `test/http-admin.test.ts`, `test/auth-cli.test.ts`: new coverage, plus
  three existing `toEqual` literals that the new `UserSummary`/`verifyLogin`
  fields break.
- No change to the `Actor { id, roles }` shape used for authorization
  (`src/cel/eval.ts`, `jwt-authentication`, `actor-resolution`). The display
  name is a presentation field on the login and admin HTTP responses only. It
  never reaches the trusted `Actor` CEL evaluation sees.
- No change to `packages/web` in this change.
