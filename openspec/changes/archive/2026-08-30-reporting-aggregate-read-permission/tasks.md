## 1. Gate implementation

- [x] 1.1 In `src/http/reporting-routes.ts`, add a shared helper named
  `requireReportingAccess`, over `(actor: Actor, processId: ProcessId, db:
  SQL): Promise<void>`. It calls `requireRole` with `REPORTS_ROLE` first.
  It then awaits `requirePermission` with `"read"` and `processId`. Add
  the `Actor` type import, and `requirePermission`, to the existing
  `authorize.js` import. Verify with `bun run typecheck`.
- [x] 1.2 In `handleView`, compute `id = processId as ProcessId` before the
  `route()` call. Use the new helper as the gate:
  `(actor) => requireReportingAccess(actor, id, db)`. Verify the three
  routes still return `200` for an actor holding `ADMIN_ROLE` and
  `REPORTS_ROLE`, via the new test in section 2.

## 2. Test coverage

- [x] 2.1 In `test/reporting-routes.test.ts`, add an `adminReports` actor:
  `{ id: "user_admin_reports", roles: [REPORTS_ROLE, ADMIN_ROLE] }`. This
  mirrors the existing pattern in `test/http-reporting-reports.test.ts`.
  Repoint three tests at `adminReports` instead of `owner`, since `owner`
  alone no longer clears the new `read` gate:
  - "every reporting route answers 200 for an actor holding the reports
    role"
  - "an unknown process id with the role gets 404"
  - "a malformed range gets 400"

  Verify with `bun test test/reporting-routes.test.ts`. A single-file run
  here only confirms the change compiles and the renamed actor resolves;
  section 4 runs the real full-suite verification.
- [x] 2.2 Add a test asserting a `system:reports`-only actor, with no
  `read` grant and no `ADMIN_ROLE`, gets `AuthorizationError`/`403`. The
  actor calls `handleReportingCycleTime` (or one of its siblings) for a
  process the store holds no grant over. Place it beside the existing HTTP
  reporting-route tests.
- [x] 2.3 Add a test for the same actor, now holding a `read` grant
  scoped to the process. It asserts `200` with the view's result. This
  mirrors the existing `executeReport`/`previewReportDraft` grant-path
  test.
- [x] 2.4 Confirm an existing test already covers an `ADMIN_ROLE` plus
  `REPORTS_ROLE` actor reaching all three views with no grant row. That's
  the short-circuit path. Add one if none exists.
- [x] 2.5 Run `bun test` with `DATABASE_URL` set. Confirm the new tests
  pass, and no existing reporting-route test regresses.

## 3. Documentation

- [x] 3.1 Add a status line to the "Process-scoped permissions" entry in
  `docs/decisions.md`. This closes the paragraph that named this change as
  pending, once the change lands.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm zero errors.
- [x] 4.2 Run `bun run build` and confirm it succeeds.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set, not a
  single-file rerun. Confirm every test passes, with no unexpected skip
  count rise. Pipe the log through `sh scripts/gates/silent-green.sh` to
  confirm.
