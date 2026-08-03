## 1. Engine

- [x] 1.1 Add `setRolesById(userId, roles, db)` to `src/auth/users.ts`, mirroring
      `setDisabled`: keyed on `user_id`, returning the updated
      `{ userId, email, roles, disabled }` or `undefined`. Leave
      `setRoles(email, ...)` alone.
- [x] 1.2 Add `handleAdminSetUserRoles` to `src/http/admin-routes.ts`: resolve
      the actor, `requireRole(actor, ADMIN_ROLE)`, parse the body, validate and
      normalize it, apply the self-strip guard, then call `setRolesById`. Map
      `undefined` to 404. Return the 409 inline, the way
      `handleSetUserDisabled` returns its 404. Add no class to
      `src/http/errors.ts`.
- [x] 1.3 Register `PATCH /admin/users/:id/roles` in `src/http/server.ts`, plus
      its `OPTIONS` preflight entry beside the existing `/admin/users*` ones.

## 2. Engine tests

Route cases go in `test/http-admin.test.ts`, beside the disable and enable
cases. Direct `setRolesById` cases go in `test/auth-users.test.ts`.

- [x] 2.1 Assign roles as `system:admin`: 200, the row holds exactly the sent
      set, and an omitted role is gone.
- [x] 2.2 Reject each of the six malformed bodies with 400 and no write.
- [x] 2.3 Trim and deduplicate entries, preserving first-occurrence order.
- [x] 2.4 Accept a role string that matches no `system:*` shape.
- [x] 2.5 404 for an unknown `userId`; 403 without `system:admin`.
- [x] 2.6 409 when the actor strips `system:admin` from its own id, with no
      write. 200 when the actor changes its own other roles. 200 when it strips
      another user's `system:admin`.
- [x] 2.7 An actor whose own id sits in no `auth_users` row gets 409, not 404,
      when it sends a set omitting `system:admin` for that id. The guard runs
      before the read.
- [x] 2.8 A token issued before a grant keeps its old roles; the next login
      carries the new ones.
- [x] 2.9 `setRoles` (by email) and `setRolesById` (by id) write the same
      column: set through one, read the value back through `listUsers`.

## 3. Admin area

- [x] 3.1 Invoke `/frontend-design:frontend-design` and the Vercel UI skills
      before touching the screen, per the repo convention for
      `packages/web` work.
- [x] 3.2 Add `setUserRoles(userId, roles, token)` to
      `packages/web/src/areas/admin/api/client.ts`, plus any type it needs in
      `api/types.ts`.
- [x] 3.3 Add per-row role editing to `screens/UsersScreen.tsx`: a control that
      swaps the roles cell for a text input with save and cancel, the reserved
      `system:*` roles named beside it, and the same-caveat note the disable
      action already carries. The input carries an accessible name identifying
      the user whose roles it holds.
- [x] 3.4 Keep the open editor's pending text across a reload. `useRefresh`
      bumps `reloadToken` on window focus, and the fetch effect replaces
      `items`; the editor's text is local state that reload must not reset.
- [x] 3.5 Show a 409 as its own message, naming the self-strip rule.

## 4. Documentation

- [x] 4.1 Extend the `/admin/users*` route list in `docs/current-state.md`, and
      correct the sentence there that says roles are CLI-only. Leave
      `docs/openapi.yaml` alone: `http-api-documentation` requires that it
      document no `admin/*` path.
- [x] 4.2 Correct the file comment in `src/auth/cli.ts` claiming that no HTTP
      route sets roles, and the comment in `src/auth/users.ts` above `setRoles`.
- [x] 4.3 Change the Purpose section of
      `openspec/specs/admin-user-management/spec.md` directly. A delta cannot
      carry a Purpose change for an existing capability. Narrow its CLI-only
      sentence to two actions: creating a user and setting a password.
- [x] 4.4 Mark stage 25a DONE in `ROADMAP.md`, naming this change and the specs
      it touches. Correct its wording "over the existing `setRoles`": the route
      runs over a new `setRolesById`, for the reason `design.md` records.

## 5. Verification

- [x] 5.1 `bun run typecheck` in the devcontainer.
- [x] 5.2 The full `bun test` in the devcontainer with `DATABASE_URL` set.
      Report the pass, fail and skip counts.
- [x] 5.3 The antislop linter on every Markdown file this change touched.
- [x] 5.4 `git diff --check`.
- [x] 5.5 Drive the Users screen in a real browser: assign a role, cancel an
      edit, leave and re-focus the window with the editor open, and trigger the
      409 by stripping your own `system:admin`.
