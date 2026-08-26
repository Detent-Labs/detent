## Why

Two planned features read the instances of one process on behalf of another.
The aggregated data source resolves a field's option list from the instances
of a target process. Its filters are a status set and a list of field
comparisons, as `docs/decisions.md` records them. The instance data table
reports over instance field values, over a date range. Both filter over
`Instance.data`. Nothing in the engine can do that today.

`listInstances` already carries the rest. It filters conjunctively by
`processId`, `status`, `currentStepId`, `startedBy`, `claimedBy`, `assignedTo`
and `assignedToRoles`, in one SQL `WHERE` over `body->>'…'`. It pages by
keyset, newest first. What it cannot do is compare against `data`. Its summary
also excludes the `data` payload on purpose.

So either feature has to widen that read or copy its predicate. A third
feature would copy it again. This change makes the predicate one thing. That
thing then gains what both consumers need.

## What Changes

- A shared predicate builder produces the instance `WHERE` fragment once.
  `listInstances` consumes it instead of holding its own clause. Its
  observable behaviour does not change. The inbox predicate keeps both halves,
  `assignedTo` and `assignedToRoles`. The degraded-item rule and keyset paging
  stay as they are.
- A new Runtime API Layer read, `queryInstances`. Each matched instance comes
  back as `instanceId`, `version`, `data` and `redactedAt`. The read resolves
  no process or step labels, and it applies no keyset cursor. The option-list
  path re-resolves on every form render, submission, timer fire and automatic
  transition. It discards labels it would pay to resolve.
- A `dataWhere` filter. Each comparison names a field id, an operator and a
  scalar right side. The comparisons join conjunctively, the way every
  existing filter joins. Both Runtime API Layer reads accept it. A `dataWhere`
  needs a `processId` beside it, since a field id anchors to one process.
- A `version` filter, with a `processId` beside it. `instances_selection_idx`
  already indexes `(processId, version, status)`, and no filter reaches its
  second column. A version number anchors to one process, and that second
  column is reachable only with the leading one bound. So both reads reject a
  `version` carrying no `processId`, the rule `dataWhere` already carries.
- An `excludeInstanceId` filter, so a caller reading its own process can omit
  the reading instance.
- A `createdAfter` and `createdBefore` pair. The instance-data-tables design
  names a date range, and `instances_created_idx` already indexes the
  `created_at` column the pair bounds. Both bounds include the instant they
  name, matching `src/engine/reporting.ts`. Both compare against the stored
  column, which carries microseconds. The summary's `createdAt` truncates to
  milliseconds, so it names a slightly earlier instant than the row holds.
- An index behind `currentStepId`, and one behind `startedBy`. Those are the
  two plain filters with no index today. Every `instances` index sits at
  `src/engine/store.ts:198-269`, and none touches either key. Both new indexes
  are expression indexes over `(body->>'…')`, the shape `instances` already
  carries.

Today the list read carries five plain filters. Of the five, `processId`
reaches `instances_selection_idx`'s leading column. A `status` filter reaches
its third column, which needs the two ahead of it bound to narrow a scan. A
`claimedBy` filter reaches `instances_claimed_by_idx`. The `currentStepId` and
`startedBy` filters reach no index.

This change adds a sixth plain filter, `version`, reaching that index's second
column with `processId` bound beside it. It also adds the two indexes above.

Nine things stay out of scope, each one belonging to a consumer. Paging over
`data`, an ordering comparison operator inside `dataWhere`, and result ordering
over a field value. An actor-scoped result set, and the `read` permission that
would gate one. The `instance.query` data source registry type, option and
label mapping, an HTTP route for `queryInstances`, and any `dataWhere` a route
would carry.

## Capabilities

### New Capabilities

- `instance-data-query`: a filtered read over instance field values. It
  compares against `Instance.data`, and it returns the matched instances' data
  without resolving process or step labels.

### Modified Capabilities

- `instance-query`: the existing list read gains `version`, `dataWhere`,
  `excludeInstanceId`, `createdAfter` and `createdBefore`. Its filter set is
  spec-level behaviour, so widening it changes a requirement. Its other
  requirements do not change. The inbox predicate, degraded summaries and
  keyset paging all stay as they are.
- `persistence`: that capability requires an index for every predicate the
  engine relies on, and enumerates the predicates identified so far. The
  `currentStepId` and `startedBy` predicates join that enumeration.
- `http-wrapper`: the `GET /instances` route enumerates the query parameters
  it reads. The four new query-parameter filters join that set. Three carry a
  rejection rule. An `excludeInstanceId` naming no instance is not an error.
  `dataWhere` does not join it. The route carries no `dataWhere` at all.
- `admin-app`: the instances-screen requirement says the screen exposes "the
  filters `InstanceListFilter` supports", then enumerates five. That reads as
  an equality, and the widened type falsifies it. The delta reframes the
  enumeration as five of the filters the type supports. The screen gains no
  control, and no frontend behaviour changes.

## Impact

- `src/runtime/api.ts` holds most of the work. `listInstances` gives up its
  inline `WHERE` to the shared builder. One new read, four new types and a set
  of new filter members land here too. The read is `queryInstances`, and the
  members widen `InstanceListFilter`. The types are `InstanceQueryFilter`, the
  `DataComparison` a `dataWhere` holds, and the data read's own
  `InstanceDataPage` and `InstanceDataItem`.
- `src/engine/store.ts` gains `instances_current_step_idx` and
  `instances_started_by_idx` in `initSchema`, each with the reader-naming
  comment every index there carries.
- `src/http/routes.ts` maps the new query parameters on the list route. The
  `scope=all`, `scope=mine` and `scope=started` gates do not change.
- `docs/current-state.md` enumerates the list read's filters by name around
  `:992-1005`. That enumeration changes, and the new `queryInstances` read joins
  the same passage. The same file narrates the `created_at` change's own three
  indexes at `:988-991`. That sentence stays as it is. The two new indexes join
  the passage as their own sentence. CLAUDE.md marks the file hand-maintained
  with no gate behind it, and that file names exported symbols by hand.
- `docs/openapi.yaml` documents `GET /instances` at `:239-288`. The
  `http-api-documentation` capability requires a route to state its request
  and response schemas, so the new parameters land there too.
- `docs/decisions.md` gains a note beside its promote-out-of-`body` entry. The
  note records two date ranges over instances. The reporting range bounds
  `startedAt`, and these filters bound `created_at`. The later promotion change
  then inherits the question.
- `packages/web/src/areas/admin/screens/instancesLogic.ts:4` claims one field
  per `InstanceListFilter` the server accepts. The widened type falsifies that
  comment. No frontend behaviour changes in this change.
- `openspec/specs/` gains `instance-data-query/spec.md` and takes the four
  modified requirements. The archive step performs that sync, not a task in
  this change.
- `test/` gains the suites for the shared predicate, the new filters, the data
  read and the route parameters.
- The definition contract does not change. `Instance` stays as it is, no
  published definition loses validity, and nothing touches `definitionHash`.
- The two consumers this change serves are `aggregated-data-source` and
  `instance-data-tables`. Neither exists yet. `docs/decisions.md` records a
  design for each, and both rest on a read beside `listInstances`. Other
  recorded needs point at a cross-process data query. This is not the whole of
  what such a read will serve.
