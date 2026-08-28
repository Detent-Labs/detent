## Why

A process owner today reads instance data through three time-based reporting
views (cycle time, bottleneck, SLA) or by opening one instance at a time. None
of that answers "list every onboarding from the last twelve months with these
three fields as columns" — a saved, shareable table over instance field
values. `docs/decisions.md` settled this design on 2026-08-25 and named its
two prerequisites: a process-scoped `read` permission and a shared
instance-query core. Both shipped and archived on 2026-08-27
(`process-read-permission`, `instance-query-core`), so the report/table
feature itself is the next unblocked piece of that sequence.

## What Changes

- A saved report object: target process, status/date-range/field filters (the
  same shape `queryInstances` already accepts), an ordered list of columns
  (direct field references or a `merge` column collecting the first
  non-empty value from an ordered list of source fields), an `owner`, and two
  principal lists, `viewers` and `editors` (actor ids, role names, and group
  ids — a group id expands to its current member ids before the same
  id-or-role membership test `isEligibleCandidate` already applies to
  assignment candidates runs; `isEligibleCandidate` itself has no notion of
  a group, see `design.md`).
- A read that executes a saved report (or an unsaved draft configuration):
  runs the query, resolves the union of field catalogs across every process
  version in the date range for column selection, and renders each cell as a
  value, an empty-because-no-value, an empty-because-field-didn't-exist, or a
  redacted marker — three distinct empty states, never collapsed into one.
  Two source fields both holding a value in one `merge` column concatenate
  and mark the row as a collision rather than silently picking one.
  Enforces process `read` grants on top of report `viewers`/`editors`: a
  viewer without a process-level `read` permission sees an empty table, so
  sharing a report can only narrow access, never grant it.
- CRUD for saved reports (create, update, delete, list-mine, share), gated by
  ownership/`editors` membership. The owner can never be removed from
  `editors`.
- A new reporting-area screen: build a report (pick process, filters,
  columns, including the merge-column editor with its collision count),
  save/name it, share it, and view its table. This is a new, separate screen
  from the existing read-only cycle-time/bottleneck/SLA views — those views
  accept no user-authored persistent object and mutate nothing, while this
  screen creates, updates and shares one, so it gets its own capability,
  `reporting-data-tables`, rather than folding into `reporting-app`'s
  read-only views. It shares `reporting-app`'s directory and access
  gate, though, and `reporting-app`'s own "issues only read requests"
  requirement is written at that directory's scope — narrowing it to name
  the report builder as the one, confined exception is therefore a MODIFIED
  requirement on `reporting-app` itself, not a fact this change can leave
  that capability's spec silent about.

Explicitly out of scope for this change (see `docs/decisions.md` for the
full reasoning): no expression language in the report editor (merge collects,
it does not compute), no aggregates/groupings/charts, no report-driven grant
of process access, no validation blocking a share to someone lacking the
process grant (a hint is fine, an error is not), no as-of / historical
values, no CSV/NDJSON download, and no attempt to index `body->'data'` for
sort/filter performance.

## Capabilities

### New Capabilities
- `instance-data-tables`: the saved-report data model, its CRUD, and the
  read that executes a report's query against `queryInstances` and renders
  the result as columns with the three-way empty-cell rule and merge-column
  collision handling. Enforces report sharing plus the existing process-scoped
  `read` permission together.
- `reporting-data-tables`: the reporting-area screen that builds, saves,
  shares and views a report table, consuming the `instance-data-tables` API
  over HTTP only, per the existing reporting-area boundary rules.

### Modified Capabilities

- `reporting-app`: narrows "The frontend offers no way to change anything" to
  the three existing views, naming the report builder as the one exception,
  confined to the `/reporting/reports` routes. No other requirement in this
  capability changes; `instance-data-query`/`instance-query` and
  `authorization` gain no requirement change (their `queryInstances`,
  `buildInstanceWhere`/`buildDataWhere` and `can`/`read` stay as they are —
  see `design.md`'s "Reusing `buildInstanceWhere`/`buildDataWhere` needs an
  export, not a requirement change" for the one small, requirement-free
  export this change does need from `instance-data-query`'s implementation).

## Impact

- New engine-side storage for saved reports (a new `report_principals` join
  table holding a list of mixed id/role/group principals per report — a
  different shape from `permission_grants`' single-grantee-per-row table; see
  `design.md`'s "Reports are a new table, not a row shape borrowed from
  `permission_grants`" for why), new Runtime API Layer reads reusing
  `queryInstances`, and new HTTP routes under `/reporting` for report CRUD
  and execution.
- A new reverse group-membership lookup in `src/auth/groups.ts`
  (`getGroupsForMember`), needed so "list my reports" can find a report
  shared only through a group the caller belongs to — see `design.md`.
- `buildInstanceWhere`/`buildDataWhere` (`src/runtime/api.ts`) become
  exported, so the new report-execution code can build the same instance
  predicate `queryInstances` uses for its own distinct-in-range-version
  query, rather than duplicating it.
- New screen and API client calls in `packages/web/src/areas/reporting/`,
  reusing the shared date-range control and catalog-driven i18n conventions
  the existing reporting views already follow. This is also the first
  mutating traffic that area's client has ever issued, so
  `packages/web/test/reporting-boundaries.test.ts`'s "no mutating HTTP
  method is issued" canary narrows along with `reporting-app`'s own
  requirement above.
- `docs/decisions.md`'s "Instance data tables" entry gets marked shipped,
  matching the convention `process-read-permission` and `instance-query-core`
  each followed for their own entries.
- No change to the process definition contract, no change to
  `src/schema/definition.ts`, and no change to how the three existing
  reporting views compute their numbers.
