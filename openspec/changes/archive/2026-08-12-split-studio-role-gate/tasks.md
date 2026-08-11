## 1. The reserved role

- [x] 1.1 Add `AUTHOR_ROLE = "system:author"` to `src/auth/authorize.ts`, with a
  doc comment naming what it admits and what it implies (nothing).
- [x] 1.2 Extend `test/auth-authorize.test.ts`: the constant's value, and that
  `system:author` implies none of publish, admin, developer or templates.
- [x] 1.3 Add the reverse case: no other reserved role implies `system:author`.

## 2. The server gate

- [x] 2.1 In `src/http/studio-routes.ts`, add `requireAuthoring(actor)`
  admitting `AUTHOR_ROLE` or `DEVELOPER_ROLE`.
- [x] 2.2 Rename `requireEitherStudioRole` to `requireStudioRead` and add
  `AUTHOR_ROLE` to the roles it admits. Update its doc comment to name all
  three roles and the reads it gates. The rename is file-local: nothing outside
  `src/http/studio-routes.ts` names that helper.
- [x] 2.3 Swap `requireRole(actor, DEVELOPER_ROLE)` for `requireAuthoring` on
  the four draft handlers: `handleListDrafts`, `handleGetDraft`,
  `handleSaveDraft`, `handleDeleteDraft`.
- [x] 2.4 Swap it for `requireAuthoring` on `handlePublishDraft`, keeping the
  separate `requireRole(actor, PUBLISH_ROLE)` call.
- [x] 2.5 Swap it for `requireAuthoring` on `handleGetRegistry`.
- [x] 2.6 Leave `requireRole(actor, DEVELOPER_ROLE)` on
  `handleGetMigrationPlan`, `handlePutMigrationPlan` and `handleGetOrphanKeys`.
  Add a comment stating that those three stay developer-only on purpose.
- [x] 2.7 Update the file's header comment: it still says every handler requires
  `DEVELOPER_ROLE`.
- [x] 2.8 In `src/http/admin-routes.ts`, add `AUTHOR_ROLE` to the data list read
  predicate beside the existing `DEVELOPER_ROLE` branch. Leave every write on
  `DATALISTS_ROLE`.
- [x] 2.9 In `src/runtime/api.ts`, widen `getInstanceRecord`'s starter fallback
  to admit `DEVELOPER_ROLE` or `AUTHOR_ROLE`. Keep the
  `instance.startedBy === actor.id` condition unchanged.

## 3. Server-side tests

- [x] 3.1 In `test/http-studio.test.ts`, cover each of the four draft routes for
  an actor holding only `system:author` (admitted) and only `system:templates`
  (403).
- [x] 3.2 Cover `GET /registry` for `system:author` (200) and for an actor
  holding neither authoring role (403).
- [x] 3.3 Cover the two migration-plan routes and the orphan-key scan for
  `system:author` (403) and `system:developer` (admitted).
- [x] 3.4 Cover the publish route: `system:author` alone (403),
  `system:author` plus `system:publish` (admitted).
- [x] 3.5 Cover the three studio reads for `system:author`, all admitted: `GET
  /templates`, `GET /templates/:key` and `GET
  /processes/:processId/versions/:version`.
- [x] 3.6 Cover the two template writes for `system:author` (403).
- [x] 3.7 Confirm every existing `system:developer` case in the file still
  passes unchanged. No test may lose a route.
- [x] 3.8 Cover `GET /admin/data-lists` for `system:author` (admitted) and a
  data list write for `system:author` (403).
- [x] 3.9 In `test/runtime-api.test.ts`, cover `getInstanceRecord` for
  `system:author`. Assert the instance that actor started (admitted), and one
  they did not start (`AuthorizationError`).

## 4. The area gate

- [x] 4.1 Add `"system:author"` to `REQUIRED_ROLE.studio` in
  `packages/web/src/shell/areas.ts` and update the comment above it, which
  currently explains two roles.
- [x] 4.2 Widen the studio `ROUTE_ROLE` in
  `packages/web/src/areas/studio/routing.ts` to
  `Record<Route["name"], readonly string[]>`. Set `processes`, `edit`,
  `versions` and `play` to both authoring roles. Set `migrate` and `tools` to
  `system:developer` alone, and `templates` to `system:templates`. Update the
  doc comment above it.
- [x] 4.3 In `packages/web/src/areas/studio/root.tsx`, add the `AUTHOR_ROLE`
  constant and make `may` test membership against a role list.
- [x] 4.4 Give `MissingRole` the screen's role list, and name every role that
  admits the screen.
- [x] 4.5 Split the nav: render the Processes button for either authoring role,
  and the Tools button for `system:developer` alone.
- [x] 4.6 Confirm the stranded-on-default redirect still fires for a curator
  and does not fire for an author.

## 5. The offered-then-refused control

- [x] 5.1 In `packages/web/src/areas/studio/screens/VersionsScreen.tsx`, render
  the migration-plan button only for an actor holding `system:developer`.
- [x] 5.2 Pass the roles the screen needs for that check from `root.tsx`, using
  the same source the nav reads.

## 6. Browser-package tests

- [x] 6.1 Rewrite the `ROUTE_ROLE` assertions in
  `packages/web/test/studio-routing.test.ts` for the set-valued map. Assert that
  every route names at least one role. Assert that the four authoring screens
  admit both authoring roles. Assert that `migrate` and `tools` admit
  `system:developer` alone, and `templates` admits `system:templates` alone.
- [x] 6.2 Add the case this work exists for: an actor holding only
  `system:author` reaches no migration screen and no tools screen.
- [x] 6.3 Keep the curator case: an actor holding only `system:templates`
  reaches no authoring screen.
- [x] 6.4 Update the area-entry assertions in
  `packages/web/test/studio-routing.test.ts` for the third role.
- [x] 6.5 Update `packages/web/test/session.test.ts`, which holds the
  `mayEnter`, `permittedAreas` and `landingArea` assertions. Add
  `mayEnter("studio", ["system:author"])` and
  `landingArea(["system:author"]) === "studio"`.

## 7. Seed and CLI

- [x] 7.1 Add the `system:author` row to `DEMO_USERS` in `scripts/seed.ts`.
- [x] 7.2 Update `test/seed-demo-users.test.ts` for eight demo accounts.
- [x] 7.3 Check `scripts/dev-up.ps1` and `scripts/dev-up.sh` for a role list and
  update it where one exists.
- [x] 7.4 Add `"system:author"` to `RESERVED_ROLES` in
  `packages/web/src/areas/admin/screens/UsersScreen.tsx`. Correct the doc
  comment above it, which says "six" over a list of seven.

## 8. Docs

- [x] 8.1 Update `docs/current-state.md` in three places. It states a two-role
  studio area entry, a seven-role reserved list, and a `ROUTE_ROLE` map of one
  role per screen.
- [x] 8.2 Update `README.md` where it lists the reserved roles.
- [x] 8.3 Update `openspec/config.yaml`, whose context block says "seven flat
  roles".
- [x] 8.4 Update `ROADMAP.md` stage 27a: it records this as an open question,
  and the answer now exists.
- [x] 8.5 Check `docs/authoring-guide.md` for a rule this work makes false, and
  update it in the same commit if one exists.
- [x] 8.6 Move item 2 in `tmp/open-work-priority.md` through its status column.

## 9. Verification

- [x] 9.1 `bun run typecheck`, then `bun run build`.
- [x] 9.2 Full `bun test` with `DATABASE_URL` set, inside the devcontainer.
  Report the pass count and the skip count.
- [x] 9.3 Run the antislop linter over every Markdown file this work touched.
- [x] 9.4 `git diff --check`, plus `git ls-files --eol` for CRLF in the worktree.
- [x] 9.5 Browser walk, four accounts: `system:author` alone,
  `system:developer` alone, `system:templates` alone, and `system:author` plus
  `system:publish`. Check the nav, each screen, the refusal state's wording,
  and the migration button on the versions screen.
