## 1. Storage and principal matching (process-access-roles)

- [ ] 1.1 Add the process-access-roles table, keyed `(processId, kind,
      principal)` with `kind IN ('developer', 'owner', 'reader')` and
      `principal` a `user_xxx`/`group_xxx` id, created by
      `src/engine/store.ts::initSchema`. Verify: the table exists after a
      fresh `initSchema` run, checked by a `bun:test` assertion.
- [ ] 1.2 Implement the shared principal-match function, mirroring
      `actorPrincipals`/`getGroupsForMember`, plus the Developer/Owner role
      filter (`DEVELOPER_ROLE`/`AUTHOR_ROLE` for Developer, `OWNER_ROLE` for
      Owner) and the Reader no-role rule. Verify: `bun test` covers every
      scenario in `process-access-roles/spec.md`'s "Matching a principal
      resolves from the actor's credential" requirement.
- [ ] 1.3 Implement add/delete for each list, gated per
      `process-access-roles/spec.md`'s Developer- and Owner-management
      requirements (`ADMIN_ROLE` always succeeds; a Developer manages
      Developer and Owner; an Owner manages Reader). Verify: `bun test`
      covers every scenario in both requirements.
- [ ] 1.4 Confirm a write never checks the named principal's current
      eligibility. Verify: the "A Developer entry succeeds ahead of the
      role" scenario passes.
- [ ] 1.5 Wire process creation (`CREATE_ROLE` + `DEVELOPER_ROLE`/
      `AUTHOR_ROLE`, per Task 3.1) to write the creator's Developer-list
      entry in the same write as the draft insert. Verify: the "The
      creator lands on the Developer list" scenario passes, and a forced
      failure between the two writes leaves neither behind.

## 2. Rollout migration

- [ ] 2.1 Write the one-time, idempotent migration that adds every account
      holding `system:developer` or `system:author` to the Developer list
      of every process already carrying a draft or a published version.
      Verify: both migration scenarios in `process-access-roles/spec.md`
      pass, and running it twice in `bun test` leaves the same row set.
- [ ] 2.2 Run the migration against the devcontainer's own seeded/demo
      data and confirm every process still has at least one Developer.
      Verify: a manual query, or a `bun:test` check, over the seeded
      database.

## 3. New reserved roles

- [ ] 3.1 Add `CREATE_ROLE = "system:create"` and `OWNER_ROLE =
      "system:owner"` to `src/auth/authorize.ts`'s reserved role set.
      Verify: `bun test` covers every new scenario in `authorization/
      spec.md`'s "Reserved role constants gate process-admin operations"
      requirement (exports, implies-nothing, no-other-role-implies).

## 4. Process creation and draft-route gating

- [ ] 4.1 Gate `PUT /drafts/:processId` for a processId with no draft and
      no published version behind `CREATE_ROLE` (alongside
      `DEVELOPER_ROLE`/`AUTHOR_ROLE`). Verify: the three creation
      scenarios in `process-drafts/spec.md` pass.
- [ ] 4.2 Gate `GET`/`PUT`/`DELETE /drafts/:processId` for an existing
      draft or published process behind the process's Developer list (or
      `ADMIN_ROLE`), alongside the existing role check. Verify: the
      developer/author-edits, unlisted-refused and admin-unconditional
      scenarios in `process-drafts/spec.md` pass.
- [ ] 4.3 Narrow `GET /drafts` to the drafts of the actor's own
      Developer-listed processes, unnarrowed for `ADMIN_ROLE`. Verify:
      the two drafts-list scenarios in `process-drafts/spec.md` pass.

## 5. The read permission's third test

- [ ] 5.1 Add the process's Reader-list match as a third, additive test
      inside `can(actor, "read", processId, db)`, after the global role
      and the stored grant. Verify: every scenario in `authorization/
      spec.md`'s "A process-scoped gate asks one function over two tests"
      requirement passes, including the two new Reader-list scenarios and
      the unchanged existing ones.

## 6. Studio UI

- [ ] 6.1 Add a read that returns the actor's own Developer- and
      Owner-listed process ids, for the Studio frontend to intersect with
      `GET /processes` and `GET /drafts`. Verify: an integration test (or
      manual check) confirms the read returns only the calling actor's own
      lists.
- [ ] 6.2 Narrow the `/processes` screen's combined rows to that set in
      the browser, unnarrowed for `ADMIN_ROLE`. Verify: the two new
      scenarios in `studio-app/spec.md`'s process-list requirement, via a
      component test or a manual browser check.
- [ ] 6.3 Hide the create-new-process action from an actor lacking
      `CREATE_ROLE` (presentational only; the server enforces it per Task
      4.1). Verify: the "screen hides the create action" scenario in
      `studio-app/spec.md`.
- [ ] 6.4 Build the Access surface on a process's edit screen: Developer,
      Owner and Reader lists, with add/delete controls gated per role as
      `studio-app/spec.md`'s new Access-surface requirement states.
      Verify: its four scenarios pass, via a component test or a manual
      browser check with `/impeccable critique`/`audit` on the new screen.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` and confirm it exits clean.
- [ ] 7.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes with no silent
      skip, per `scripts/gates/silent-green.sh`.
