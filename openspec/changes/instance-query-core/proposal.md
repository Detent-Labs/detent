## Why

Two planned features read the instances of one process on behalf of another.
The aggregated data source resolves a field's option list from the instances
of a target process. It filters them by the step each one stands on.
The instance data table reports over instance field values. Both filter over
`Instance.data`. Nothing in the engine can do that today.

`listInstances` already carries the rest. It filters conjunctively by
`processId`, `status`, `currentStepId`, `startedBy`, `claimedBy` and
`assignedTo`, in one SQL `WHERE` over `body->>'…'`. It pages by keyset,
newest first. What it cannot do is compare against `data`. Its summary also
excludes the `data` payload on purpose.

So either feature has to widen that read or copy its predicate. A third
feature would copy it again. This change makes the predicate one thing. That
thing then gains what both consumers need. It compares over `data`, and it
returns the compared values.

## What Changes

- A shared predicate builder produces the instance `WHERE` fragment once.
  `listInstances` consumes it instead of holding its own clause. Its
  observable behaviour does not change. The inbox predicate, the
  degraded-item rule and keyset paging all stay as they are.
- A new Runtime API Layer read, `queryInstances`, returns
  `{ instanceId, data }` for each matched instance. It resolves no process or
  step labels, and it applies no keyset cursor. The option-list path
  re-resolves on every form render, submission, timer fire and automatic
  transition. It discards labels it would pay to resolve.
- A `dataWhere` filter. It carries comparisons whose left side is a field id
  and whose right side is a literal. The comparisons join conjunctively, the
  way every existing filter joins. Both reads accept it.
- A `version` filter. `instances_selection_idx` already indexes
  `(processId, version, status)`, and no filter reaches its second column.
- An `excludeInstanceId` filter, so a caller reading its own process can omit
  the reading instance.
- An index behind `currentStepId`. That filter has none today, and the
  aggregated data source makes it the only filter that feature has. A
  Postgres generated column carries it:
  `GENERATED ALWAYS AS ((body->>'currentStepId')) STORED`. Postgres derives
  the value rather than the engine writing it. So it cannot drift from the
  body, and it changes no write site.
- An opt-in `includeData` on `listInstances`, so the report table can read the
  values it filters over. It stays off by default. The summary's existing
  contract excludes `data`, and the inbox path must not start carrying it.

Five things stay out of scope, each one belonging to a consumer. Paging or
sorting over `data`. An actor-scoped result set. The `read` permission that
would gate one. The `instance.query` data source registry type. Option and
label mapping.

## Capabilities

### New Capabilities

- `instance-data-query`: a filtered read over instance field values. It
  compares against `Instance.data`, and it returns the matched instances' data
  without resolving process or step labels.

### Modified Capabilities

- `instance-query`: the existing list read gains `version`, `dataWhere`,
  `excludeInstanceId` and an opt-in `includeData`. Its filter set is
  spec-level behaviour, so widening it changes a requirement. Its other
  requirements do not change. The inbox predicate, degraded summaries and
  keyset paging all stay as they are.
- `persistence`: the schema gains a generated `current_step_id` column and an
  index on it. That capability requires an index for every predicate the
  engine relies on, and this predicate has none.

## Impact

- `src/runtime/api.ts` holds most of the work. `listInstances` gives up its
  inline `WHERE` to the shared builder. Three additions land here too:
  `queryInstances`, the new members of `InstanceListFilter`, and the
  `dataWhere` type.
- `src/engine/store.ts` gains the column and the index in `initSchema`. Both
  follow the additive `ADD COLUMN IF NOT EXISTS` convention every other
  `instances` column already follows.
- `src/http/routes.ts` maps the new query parameters on the list route. The
  `scope=all` admin gate does not change.
- The definition contract does not change. `Instance` stays as it is, no
  published definition loses validity, and nothing touches `definitionHash`.
- Two consumers wait on this read: `aggregated-data-source` and
  `instance-data-tables`. Neither exists yet. `docs/decisions.md` designs both
  against it.
