## Why

`GET /reporting/cycle-time/:processId`, `.../bottleneck/:processId` and
`.../sla/:processId` gate on `requireRole(actor, REPORTS_ROLE)` alone. Each
already takes a `processId`. A `system:reports` holder therefore reads any
process's aggregates, with no per-process grant.

A hundred lines below in the same file, `handleExecuteReport` and
`handlePreviewReport` gate the same kind of read differently. Both check
`REPORTS_ROLE` plus `can(actor, "read", processId, db)`. Same file, same
question, two answers.

The `read` permission this needs already exists. It sits at
`src/auth/authorize.ts:78`, mapped to `ADMIN_ROLE`. The
`process-read-permission` change shipped it. That change named these three
routes as out of scope on purpose, pending their own change.

`docs/decisions.md` already settles the shape, not as an open question. The
entry is "Process-scoped permissions", paragraph "Shape decided
2026-08-25".

`REPORTS_ROLE` stays "may use the reporting area". `read` becomes a second,
independent check, for exactly these three routes.

## What Changes

- The three reporting aggregate routes (`handleReportingCycleTime`,
  `handleReportingBottleneck`, `handleReportingSla`, all routed through the
  shared `handleView` in `src/http/reporting-routes.ts`) gain a second gate:
  `requirePermission(actor, "read", processId, db)`. It runs after the
  existing `requireRole(actor, REPORTS_ROLE)`. The two checks stay
  independent. Neither implies the other, matching the "two questions"
  shape `docs/decisions.md` already settled.
- **BREAKING**: take a `system:reports` holder with no `read` grant and no
  `system:admin` over the named process. All three routes now answer `403`
  for them, instead of the view's data. An operator restores access with a
  `read` grant scoped to that process, or by granting `system:admin`.
- A shared helper next to `handleView` runs both gates. A future fourth
  process-scoped reporting route then inherits both checks by construction,
  not by copying two lines.

The other nine `/reporting/*` routes stay exactly as they are:
`handleReportingListProcesses`, the five saved-report CRUD handlers,
`handleExecuteReport`, `handlePreviewReport`, and
`handleReportColumnChoices`. The first six need no process-scoped check: no
process id names one, or report membership already governs. The last three
already check `can(actor, "read", processId, db)`.

Two things stay out of this change. One is `scope=all` as a result-set
predicate. The other is how an operator stores or administers a `read`
grant. Both stay exactly as `process-read-permission` left them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authorization`: the requirement "The reports role gates every reporting
  route" gains a rule. The three process-scoped aggregate views need the
  `read` permission on the named process, in addition to the reports role.
  The other nine `/reporting/*` routes keep exactly the gate they have
  today.
- `reporting-analytics-api`: the requirement "The reporting routes expose
  the three views and the process list" gains a rule. The three per-process
  views need the process's own `read` permission, in addition to the
  reports role. A new scenario states the breaking tightening for a
  `REPORTS_ROLE`-only caller holding no grant.

## Impact

- `src/http/reporting-routes.ts`: `handleView`'s gate closure, plus a new
  shared helper.
- `test/`: one new test. A `system:reports`-only actor, holding no `read`
  grant, calls one of the three aggregate routes. They hold no grant over
  the named process. The engine rejects the call. This test joins the
  existing HTTP reporting-route suite.
- `test/reporting-routes.test.ts`: three existing tests call the three
  aggregate routes with a `REPORTS_ROLE`-only actor and expect success.
  They gain an `ADMIN_ROLE`-holding actor instead, matching the
  `adminReports`/`owner` split `test/http-reporting-reports.test.ts`
  already uses for the sibling execute/preview/columns routes.
- `docs/decisions.md`: the "Process-scoped permissions" entry gets a status
  line once this lands, closing the paragraph that named this change as
  pending.
- No schema, definition-contract, or UI change.
