## Why

A process owner today reads instance data through three time-based reporting
views: cycle time, bottleneck, and SLA. The other option is opening one
instance at a time. Neither answers a request like "list every onboarding
from the last twelve months with these three fields as columns." That
request needs a saved, shareable table over instance field values.

`docs/decisions.md` settled this design on 2026-08-25. It named two
prerequisites: a process-scoped `read` permission and a shared instance-query
core. Both shipped and archived on 2026-08-27 (`process-read-permission`,
`instance-query-core`). The report/table feature itself is the next
unblocked piece of that sequence.

## What Changes

- A saved report object holds a target process and status/date-range/field
  filters, the same shape `queryInstances` already accepts. It holds an
  ordered list of columns. Each column is either a direct field reference or
  a `merge` column. A `merge` column collects the first non-empty value from
  an ordered list of source fields.
- The report object also holds an `owner` and two principal lists, `viewers`
  and `editors`. Each list holds actor ids, role names, and group ids.
  Before that membership test runs, a group id expands to its current
  member ids. That test is the same id-or-role membership test
  `isEligibleCandidate` already applies to assignment candidates.
- `isEligibleCandidate` itself has no notion of a group. See `design.md`.
- A read executes a saved report, or an unsaved draft. It runs the query. It
  resolves the union of field catalogs across every process version in the
  date range, for column selection. It renders each cell as a value, an
  empty-because-no-value, an empty-because-field-didn't-exist, or a redacted
  marker. The read keeps these three empty states distinct and never
  collapses them into one.
- Two source fields in one `merge` column can both hold a value. The read
  then concatenates them and marks the row as a collision, rather than
  silently picking one. The read enforces process `read` grants on top of
  report `viewers`/`editors`. A viewer without a process-level `read`
  permission sees an empty table. Sharing a report can therefore only
  narrow access, never grant it.
- CRUD for saved reports (build, change, delete, list-mine, share), gated by
  ownership/`editors` membership. The owner always stays in `editors`.
- A new reporting-area screen lets an author build a report. The author
  picks a process, filters, and columns, including the merge-column editor
  with its collision count. The author then saves and names the report,
  shares it, and views its table. This screen is new and separate from the
  existing read-only cycle-time/bottleneck/SLA views. Those views accept no
  user-authored persistent object and mutate nothing. This screen instead
  builds, changes, and shares a report.
- This gives it its own capability, `reporting-data-tables`, rather than
  folding into `reporting-app`'s read-only views. It still shares
  `reporting-app`'s directory and access gate. `reporting-app`'s own spec
  states the "issues only read requests" requirement at that directory's
  scope. Narrowing it to name the report builder as the one confined
  exception is a MODIFIED requirement on `reporting-app` itself. This
  change cannot leave that capability's spec silent about the narrowing.

Several things stay explicitly out of scope for this change. See
`docs/decisions.md` for the full reasoning.

- The report editor gets no expression language. The `merge` column only
  collects values. It does not compute them.
- It gets no aggregates, groupings, or charts.
- This change adds no report-driven grant of process access.
- It adds no validation that blocks a share to someone lacking the process
  grant. A hint is fine. An error is not.
- It adds no as-of or historical values and no CSV/NDJSON download.
- It does not try to index `body->'data'` for sort/filter performance.

## Capabilities

### New Capabilities
- `instance-data-tables`: the saved-report data model, its CRUD, and the
  read that executes a report's query against `queryInstances`. It renders
  the result as columns, using the three-way empty-cell rule and
  merge-column collision handling. It enforces report sharing together with
  the existing process-scoped `read` permission.
- `reporting-data-tables`: the reporting-area screen that builds, saves,
  shares and views a report table. It consumes the `instance-data-tables`
  API over HTTP only, per the existing reporting-area boundary rules.

### Modified Capabilities

- `reporting-app`: narrows "The frontend offers no way to change anything"
  to the three existing views. It names the report builder as the one
  exception, confined to the `/reporting/reports` routes. No other
  requirement in this capability changes. `instance-data-query`/
  `instance-query` and `authorization` gain no requirement change. Their
  `queryInstances`, `buildInstanceWhere`/`buildDataWhere`, and `can`/`read`
  stay as they are. See `design.md`'s "Reusing
  `buildInstanceWhere`/`buildDataWhere` needs an export, not a requirement
  change" for the reasoning. This change needs only that one small,
  requirement-free export from `instance-data-query`'s implementation.

## Impact

- This adds new engine-side storage for saved reports. A new
  `report_principals` join table holds a list of mixed id/role/group
  principals per report. That table has a different shape from
  `permission_grants`' single-grantee-per-row table. See `design.md`'s
  "Reports are a new table, not a row shape borrowed from
  `permission_grants`" for why. This also adds new Runtime API Layer reads
  that reuse `queryInstances`. It adds new HTTP routes under `/reporting`
  for report CRUD and execution.
- This adds a new reverse group-membership lookup in `src/auth/groups.ts`,
  `getGroupsForMember`. It lets "list my reports" find a report shared only
  through a group the caller belongs to. See `design.md`.
- `buildInstanceWhere`/`buildDataWhere` (`src/runtime/api.ts`) become
  exported. This lets the new report-execution code build the same instance
  predicate `queryInstances` uses for its own distinct-in-range-version
  query. The new code does not duplicate that predicate.
- This adds a new screen and API client calls in
  `packages/web/src/areas/reporting/`. They reuse the shared date-range
  control and catalog-driven i18n conventions the existing reporting views
  already follow. This is also the first mutating traffic that area's
  client has ever issued.

<!-- Why: quotes packages/web/test/reporting-boundaries.test.ts's own canary title verbatim, on purpose -->
<!-- antislop: allow passive-voice -->
- `packages/web/test/reporting-boundaries.test.ts`'s "no mutating HTTP
  method is issued" canary narrows along with `reporting-app`'s own
  requirement above.

- `docs/decisions.md`'s "Instance data tables" entry gets marked shipped,
  matching the convention `process-read-permission` and `instance-query-core`
  each followed for their own entries.
- This change makes no change to the process definition contract, and no
  change to `src/schema/definition.ts`. It makes no change to how the three
  existing reporting views compute their numbers.
