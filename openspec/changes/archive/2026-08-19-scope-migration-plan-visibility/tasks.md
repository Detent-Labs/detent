## 1. Server: compute and expose canPlanMigration

- [x] 1.1 In `src/http/studio-routes.ts`'s `handleGetDraft`, read the
      resolved actor and compute `canPlanMigration` via `can(actor,
      "migrate", processId as ProcessId, db)`.
- [x] 1.2 Attach `canPlanMigration` to the response body `handleGetDraft`
      returns, beside the existing draft fields.
- [x] 1.3 Shape `handleGetDraft`'s response locally in
      `src/http/studio-routes.ts` as `{ ...draft, canPlanMigration }`,
      typed as `Draft & { canPlanMigration: boolean }` (or a small
      locally-declared response type). Do NOT add `canPlanMigration` to
      the `Draft` type in `src/engine/drafts.ts` — it is a computed,
      request-scoped field, not a persisted column, and `toDraft()` has
      no actor context to populate it.

## 2. Server: widen the two other migration-plan routes and the scan route

- [x] 2.1 Confirm `handleGetMigrationPlan`, `handlePutMigrationPlan` (or
      their equivalents, `src/http/studio-routes.ts` lines ~190-220) and
      the orphan-keys handler already call `requirePermission(actor,
      "migrate", processId, db)`. No server-side change is expected here;
      this task is a verification checkpoint, not a code change.
- [x] 2.2 Correct the two stale inline comments above
      `handleGetMigrationPlan` and `handleGetOrphanKeys`
      (`src/http/studio-routes.ts`) that still claim "`DEVELOPER_ROLE`
      alone" — restate the rule the module's own header comment (lines
      13-17) already gives correctly: `system:developer` or a scoped
      `migrate` grant naming the process.

## 3. Studio client: read canPlanMigration instead of a role

- [x] 3.1 Add `canPlanMigration: boolean` to `DraftRecord` in
      `packages/web/src/areas/studio/api/types.ts`.
- [x] 3.2 In `packages/web/src/areas/studio/screens/VersionsScreen.tsx`,
      source the `mayPlanMigration` value (or rename it to
      `canPlanMigration` for clarity) from the `getDraft` response already
      loaded in `load()`, instead of the `mayPlanMigration` prop.
- [x] 3.3 Update the JSDoc comment on `VersionsScreenProps.mayPlanMigration`
      (or its replacement) to describe the new source and drop the
      superseded "That screen is developer-only" reasoning.
- [x] 3.4 Remove `mayPlanMigration` from `VersionsScreenProps` and from the
      call site that renders `VersionsScreen` (find it via the `Route`
      switch in `packages/web/src/areas/studio/root.tsx` or `EditScreen`,
      whichever renders it).
- [x] 3.5 Remove the now-unused `ROUTE_ROLE`-derived boolean that fed the
      old prop, if nothing else in `root.tsx` still needs it.

## 4. Studio client: widen the migrate route gate

- [x] 4.1 In `packages/web/src/areas/studio/routing.ts`, widen
      `ROUTE_ROLE.migrate` from `["system:developer"]` to `AUTHORING`.
- [x] 4.2 Update the comment above `ROUTE_ROLE` that currently groups
      `migrate` with `tools` under "Developer-only" reasoning, since
      `migrate` no longer belongs to that group.
- [x] 4.3 Update `packages/web/test/studio-routing.test.ts`: move
      `"migrate"` from `DEVELOPER_ONLY_ROUTES` into `AUTHORING_ROUTES`,
      correct the group comments, and rewrite the test that asserted an
      author never reaches `migrate` (and its stale "does not migrate"
      comment) to cover Tools alone. Done during the openspec-review-change
      pass that found this test would otherwise break.

## 5. Spec sync

- [x] 5.1 Confirm the three delta spec files under
      `openspec/changes/scope-migration-plan-visibility/specs/` match the
      implementation once tasks 1-4 land (no drift between the MODIFIED
      requirements and the shipped behavior).

## 6. Tests

- [x] 6.1 In `test/http-studio.test.ts`, add a case asserting `GET
      /drafts/:processId` returns `canPlanMigration: true` for an actor
      holding `system:developer`.
- [x] 6.2 Add a case asserting `canPlanMigration: false` for an actor
      holding only `system:author`, with no scoped `migrate` grant for
      that process.
- [x] 6.3 Add a case asserting `canPlanMigration: true` for an actor
      holding only `system:author`, with a scoped `migrate` grant for that
      process (seed the grant via `src/auth/grants.ts`'s store function or
      the existing grant-administration route).
- [x] 6.4 Extend the existing migration-plan and orphan-keys route tests
      in `test/http-studio.test.ts` with one case per route: an author
      holding a scoped `migrate` grant, and no `system:developer`,
      succeeds.

## 7. Docs

- [x] 7.1 Update `ROADMAP.md` stage 40: mark the third open piece closed
      by this change, and add its row detail the way stage 43 records its
      own closing change.
- [x] 7.2 Run the antislop linter on every Markdown file this work
      touches, including the `ROADMAP.md` edit.
- [x] 7.3 Update `docs/decisions.md`'s stage-40 "Decided, not yet built"
      entry: replace the sentence about "resource views carry
      server-computed permissions booleans" with the narrower, audited
      finding — Migration Plan was the only real gap; Publish, Cancel and
      area entry already degrade gracefully without one. Mark the matching
      row in `tmp/open-work-priority.md` (~line 1268) closed.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`. Clean: engine, form-ui and web all
      exited 0.
- [x] 8.2 Run `bun run build`. Clean.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set. 2801
      pass, 1 unrelated skip (a pre-existing timezone test), 0 fail,
      across 154 files. The DB-backed suites ran (realistic per-test
      timings, no mass skip); every test added by this change passed.
- [x] 8.4 In a real browser: `demo-author@example.test`
      (`system:author` only) with a scoped `migrate` grant on
      `expense_approval` saw and used "Plan migration" — the plan landed
      in `migration_plans`, confirmed via the database and removed after.
      The same actor on `purchase_requisition` (no grant) saw no "Plan
      migration" control, and a direct navigation to that process's
      migrate route mounted the screen (per design) but showed a graceful
      "Failed — You don't have permission to do that." banner from the
      server's 403, not a crash.
