# Tasks

## 1. The grant store

- [x] 1.1 Add the `permission_grants` table to `initSchema`
      (`src/engine/store.ts`), beside `auth_users`: `role text NOT NULL`,
      `permission text NOT NULL`, `scope jsonb NOT NULL`, `PRIMARY KEY (role,
      permission, scope)`. No tenant column.
- [x] 1.2 Add no second index. The primary key is a btree on `(role,
      permission, scope)`, and it leads with the selective column the lookup
      filters on. `permission` holds three values. Add one only where a
      profile shows the primary key unused, and say so in the comment.
- [x] 1.3 Comment both statements the way the neighbouring tables carry
      comments. State what a row means. State why the triple is the key.
- [x] 1.4 Create `src/auth/grants.ts` with the `PermissionGrant` row type and
      the strict write-path Zod schema. `role` is non-empty and length-bounded.
      `permission` is the three-value union. `scope` is a discriminated union on
      `type` whose one member is `{ type: "process", config: { processId } }`,
      with the `proc_` prefix enforced.
- [x] 1.5 Add `hasGrant(roles, permission, processId, db)`. Its body is the
      `SELECT 1 … LIMIT 1` from design.md, matching `scope->>'type'` and
      `scope->'config'->>'processId'`. Return false before the query where
      `roles` is empty. An actor with no roles matches no grant, and the
      empty-array binding then never reaches Postgres.
- [x] 1.6 Add `listGrants(db)`, ordered by `(permission, role, scope)`. It
      returns the stored `scope` and parses it again nowhere.
- [x] 1.7 Add `writeGrant(grant, db)` as `ON CONFLICT DO NOTHING`, and
      `revokeGrant(grant, db)` as an exact three-column `DELETE`.

## 2. The seam's body

- [x] 2.1 Change `can` in `src/auth/authorize.ts` to `async can(actor,
      permission, processId, db: SQL): Promise<boolean>`.
- [x] 2.2 Test 1: return true where `actor.roles` holds
      `PERMISSION_ROLE[permission]`, before any query.
- [x] 2.3 Test 2: `return hasGrant(actor.roles, permission, processId, db)`.
      Read no scope out of a role string.
- [x] 2.4 Change `requirePermission` to `async` and `await can`. Keep the
      existing `AuthorizationError` and its message.
- [x] 2.5 Rewrite the module header comment. The seam now carries a body.
      `PERMISSION_ROLE` stays private. The SQL sits in `grants.ts`, so this file
      still holds none.
- [x] 2.6 Delete the `void processId` line and its comment.

## 3. The six call sites

- [x] 3.1 `await requirePermission(actor, "publish", …, db)` in `handlePublish`
      (`src/http/routes.ts`). It stays behind the body parse and the shape
      check, for the reason the `http-wrapper` spec already carries.
- [x] 3.2 `await requirePermission` in `handlePublishDraft`
      (`src/http/studio-routes.ts`).
- [x] 3.3 `await requirePermission` in `handleGetMigrationPlan`,
      `handlePutMigrationPlan` and `handleGetOrphanKeys`. Update the module
      header comment at `src/http/studio-routes.ts:13`, which states the
      three-argument synchronous form.
- [x] 3.4 `await can(actor, "cancel", instance.processId, db)` in
      `cancelInstance` (`src/runtime/api.ts`), in the loaded branch, beside the
      `startedBy` test. Keep the two tests independent.
- [x] 3.5 Run `bun run typecheck` and confirm no other caller exists.

## 4. The operator routes

- [x] 4.1 Add `handleListPermissionGrants`, `handleWritePermissionGrant` and
      `handleRevokePermissionGrant` to `src/http/admin-routes.ts`. Each calls
      `requireRole(actor, ADMIN_ROLE)` directly, like every neighbour.
- [x] 4.2 Parse each write body and each revoke body with the strict schema
      from 1.4. Answer `400` naming the field that failed.
- [x] 4.3 Register the three routes in `src/http/server.ts`'s route table:
      `GET /admin/permission-grants`, `POST /admin/permission-grants`,
      `POST /admin/permission-grants/revoke`.
- [x] 4.4 Confirm the new paths collide with no existing `/admin/*` row.

## 5. Tests

- [x] 5.1 `test/auth-authorize.test.ts`: keep the exported-name canary exactly
      as it stands. This change adds no export to `src/auth/authorize.ts`, so
      that assertion passes unedited. Do not export `hasGrant` from there.
- [x] 5.1a Split that file. The role constants, `requireRole` and the export
      canary stay pure and need no database. Move every `can` and
      `requirePermission` test behind `test.skipIf(!DB)`, `await` each call
      and pass `sql`. Test 2 reads the store on every false answer, so those
      tests need one. Replace the "process id does not change the answer"
      test with its opposite: a grant makes two process ids disagree.
- [x] 5.1b Correct the file's header comment. It claims purity today, and
      that claim holds for the `requireRole` half alone.
- [x] 5.2 A grant of one permission over one process admits exactly that pair.
      It answers true for that pair. It answers false for another process, for
      another permission, and for an actor holding a different role.
- [x] 5.3 A role string carries no scope: an actor whose only role is
      `system:publish@` + processId answers false over that process, with no
      grant row present.
- [x] 5.4 The global role answers true with no grant row present.
- [x] 5.5 `requirePermission` rejects with `AuthorizationError` where `can`
      answers false. It resolves where `can` answers true. Each of the six
      gated operations rejects an actor who holds no role and no grant. This
      test catches a missed `await`.
- [x] 5.6 `test/http-admin.test.ts`: write then list. Write twice and list one
      row. Revoke then list. Revoke an absent grant. Revoke one grant and leave
      a sibling grant over another process alone.
- [x] 5.7 The list order is stable across two calls.
- [x] 5.8 Each of the four malformed-body cases answers `400`, stores no row,
      and names the failing field.
- [x] 5.9 All three routes answer `403` to an actor without `system:admin`.
      Cover an actor whose only permission comes from a grant.
- [x] 5.10 A grant holder publishes their own process over `POST /processes`,
      and the engine refuses the same actor on another. A grant holder cancels
      an instance of their own process, and the engine refuses the same actor
      on another's.
- [x] 5.10a `POST /drafts/:processId/publish`: an actor holding
      `system:author` and a matching grant publishes, and the engine refuses
      that actor on another process. An actor holding the grant and no
      authoring role still gets `403`, because the studio route's own gate
      stands beside the permission.
- [x] 5.11 A grant takes effect and a revoke stops admitting, both inside one
      unchanged session.
- [x] 5.12 A grant naming an unpublished process id is storable. It admits the
      first publish under that id.

## 6. Documentation and verification

- [x] 6.1 `docs/current-state.md`: the authorization subsystem's paragraph, and
      the exported-symbol list for `src/auth/authorize.ts` and the new
      `src/auth/grants.ts`.
- [x] 6.2 `ROADMAP.md` stage 40: the storage half lands. State what the
      `scope=all` filter, the draft scope and the `permissions` booleans still
      owe, and that they keep the stage open. The 2026-08-16 corrections to
      the stage text (draft id, `@` fallback, enumerable scopes, Entra GUIDs,
      the web areas) are already in place; keep them.
- [x] 6.3 `docs/decisions.md`: retire the line naming the seam as the piece
      that carries no body yet. Replace the `system:publish@proc_...`
      sentence, which records that form as a documented fallback. The owner
      dropped it 2026-08-16. Leave the `scope=all` filter as what the bullet
      still owes.
- [x] 6.4 `tmp/open-work-priority.md`: the stage 40 deferral now covers the
      filter alone.
- [x] 6.5 `bun run typecheck`, then `bun run build`, then the full `bun test`
      with `DATABASE_URL` set. Report the skip count, not the pass count alone.
- [x] 6.6 The antislop linter over every Markdown file this change touched.
- [x] 6.7 `git diff --check`, and `git ls-files --eol` for the `w/` column.
- [x] 6.8 No browser check. This change adds no screen and alters no rendered
      state.
