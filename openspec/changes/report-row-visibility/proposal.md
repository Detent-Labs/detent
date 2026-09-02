## Why

`executeReport` checks report membership, then the process-wide `read` grant,
then returns every matching row. It hands out instance ids and field values.
A viewer with `read` on the process sees every instance of it. That includes
the ones the visible list and the direct read now withhold. Change 1 built the
principal set and change 2 put the direct read on it. The report is the third
reader, and today it is the widest one.

## What Changes

- `executeReport` and `previewReportDraft` filter per row. A row the viewer
  may not see is absent. There is no error and no marker, the rule the empty
  table already follows when the grant is missing.
- The row rule is the one the visible list applies. A live assignment on the
  current step, or participation with no revocation. The engine reuses the
  measured `UNION ALL` row set rather than a second predicate.
- An `ADMIN_ROLE` caller reads unfiltered, as they do on the direct read and
  on `scope=all`.
- `truncated` reports the filtered set. The bound applies after the filter,
  so a viewer never gets a short table reported as complete.
- The CSV export inherits it, since it renders `executeReport`'s result.
- `queryInstances` accepts the visibility filter, opt-in. The `instance.query`
  data source passes none and keeps today's unfiltered read. It runs inside
  the engine with no actor, so it has no principal set to match.
- The three aggregate views stay unfiltered permanently. Nothing in this
  change touches them.
- `reporting-data-tables` needs no delta. Its CSV rule is equality with the
  JSON route, which the narrowing preserves.
- No definition contract change, no new relation, no UI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instance-data-tables`: the requirement on sharing narrowing access states
  the per-row rule, and the preview requirement states it too.
- `instance-data-query`: the data read accepts a stated principal set. A
  caller passing none keeps today's unnarrowed result.
- `instance-visibility-set`: a new requirement. The report reads by the same
  rule, and the aggregates stay out of it.

## Impact

- `src/runtime/api.ts`: `queryInstances`, `runReportQuery`, `executeReport`,
  `previewReportDraft`.
- `test/`: new tests for a filtered row set and an unfiltered operator.
  More for a revoked viewer, the CSV twin and the untouched data source.
- `docs/decisions.md`, `docs/current-state.md`, `ROADMAP.md` and
  `tmp/offene-items.md`.
- Cost: a report for a non-administrative viewer runs the visible row set
  instead of a plain filtered scan. An operator's report keeps today's plan.
