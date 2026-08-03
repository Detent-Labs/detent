## Why

Only `src/auth/cli.ts` writes a user's roles. A process names roles such as an
approver or a department manager. Each one reaches a person only through a
shell on the server. Whoever runs the admin area has no such shell.

Stage 10b left that gap on purpose. The only roles in play then were the six
reserved `system:*` ones, and a deployment set them once. Roadmap stage 25
changes that. Business roles multiply per process, and stage 25c adds an
assignment strategy that reads organizational facts. The gap becomes untenable
before either one lands.

## What Changes

- A `PATCH /admin/users/:userId/roles` route behind `system:admin`. It takes
  `{ roles: string[] }` and returns the updated user row. It is the fourth
  `/admin/users*` route, beside the existing list, disable and enable.
- `src/auth/users.ts` gains `setRolesById(userId, roles, db)`, which mirrors
  `setDisabled`'s shape. It keys on `user_id` and returns the updated row, or
  `undefined` for an unknown id. The existing `setRoles(email, ...)` stays for
  the CLI, unchanged.
- The admin area's Users screen edits the roles cell in place and saves over
  the new route.
- No contract change. The change leaves `src/schema/definition.ts` alone, adds
  no column to any table, and reaches no published body.

## Capabilities

### New Capabilities

None. The behaviour extends two capabilities that already exist.

### Modified Capabilities

- `admin-user-management`: adds the role-assignment route. Its purpose
  statement says today that assigning roles stays CLI-only. That sentence and
  its carve-out wording narrow to two actions: creating a user and changing a
  password.
- `local-user-accounts`: the same narrowing on the CLI-only requirement and on
  its scenario. That scenario asserts today that no route assigns roles.
- `admin-app`: the Users screen gains role editing, beside the existing
  enable/disable control.

## Impact

- `src/auth/users.ts`: one new exported function.
- `src/http/admin-routes.ts`: one new handler.
- `src/http/server.ts`: one route entry plus its `OPTIONS` preflight entry.
- `packages/web/src/areas/admin/`: `api/client.ts`, `errors.ts`, `app.css`,
  `screens/UsersScreen.tsx` and a new `screens/usersLogic.ts`.
- `packages/web/src/api/types.ts`, whose `ClientError` union names every
  server error type.
- `docs/current-state.md`, which enumerates the `/admin/users*` routes.
  `docs/openapi.yaml` stays untouched: `http-api-documentation` requires that it
  document no `admin/*` path.
- `openspec/specs/admin-user-management/spec.md`, whose Purpose says today that
  assigning roles stays CLI-only. A delta cannot carry a Purpose change.
- `ROADMAP.md`, where stage 25a becomes DONE.
- `src/auth/cli.ts` carries a comment claiming that no HTTP route sets roles.
- `test/http-admin.test.ts`, `test/auth-users.test.ts` and
  `test/auth-server.test.ts`, which hold the sibling cases for the other three
  user routes and for the JWT round trip. A new
  `packages/web/test/admin-usersLogic.test.ts` covers the browser-side parser.
- No dependency, migration or environment variable changes.
