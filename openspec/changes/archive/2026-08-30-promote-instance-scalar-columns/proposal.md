## Why

Every one of the six standardized `Instance` scalars (`processId`, `version`,
`status`, `currentStepId`, `startedAt`, `startedBy`) lives only inside the
jsonb `body` today. A predicate over one of them reads an expression index
where one exists, or none at all. The expression
`(body->>'startedAt')::timestamptz` has no index. The ponytail marker at
`src/engine/reporting.ts:89-95` names the gap and its own one-line fix.

`docs/decisions.md`'s "Promoting standardized instance keys out of `body`
into columns" entry settled which keys qualify on 2026-08-25. It settled the
mechanism the same day: a `GENERATED ALWAYS AS (...) STORED` column,
additive beside the jsonb, on the `redacted_at` precedent. This change
builds the first half of that entry.

## What Changes

- Add six `GENERATED ALWAYS AS (...) STORED` columns to `instances`:
  `process_id`, `status`, `current_step_id`, `started_by` (all `text`),
  `version` (`integer`), and `started_at` (`text`, not `timestamptz`). This
  devcontainer's Postgres 16.15 confirms `((body->>'startedAt')::timestamptz)`
  raises "generation expression is not immutable". The timestamptz input path
  reads session `DateStyle`/`TimeZone`. `(body->>key)` as text and
  `(body->>'version')::integer` are both immutable and succeed. The key stays
  in `body`. Nothing reads a promoted column instead of the body except the
  one query below.
- Add `CREATE INDEX IF NOT EXISTS instances_started_idx ON instances
  (started_at)`. Rewrite `selectInRange` (`src/engine/reporting.ts`) to
  filter `started_at >= range.from AND started_at <= range.to`. Both are
  already ISO-8601 UTC strings. Drop the `timestamptz` cast on
  `body->>'startedAt'`.
- This resolves the ponytail marker. The planner uses a generated column's
  index only when the query names that column. It does not substitute the
  column for the expression it came from. The index needs this query
  rewrite to do anything.
- No other query changes. Three existing expression indexes
  (`instances_selection_idx`, `instances_current_step_idx`,
  `instances_started_by_idx`) keep serving every other predicate unchanged.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `persistence`: `instances` gains six generated columns and one new index.
  `initSchema`'s idempotence and additive-migration guarantees cover them too.

## Impact

<!-- antislop: allow synonym-rotation -->
<!-- "ALTER TABLE" below is the SQL statement name, not a rotated synonym for "change". -->
- `src/engine/store.ts` (`initSchema`): six `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS ... GENERATED ALWAYS AS (...) STORED` statements, one new index.
- `src/engine/reporting.ts` (`selectInRange`): predicate rewrite. This
  removes the ponytail marker.
- `src/schema/definition.ts`: unchanged. All six keys already exist on
  `Instance`, so this is a storage-only projection.
- `docs/decisions.md`: the "Promoting standardized instance keys" entry
  updates from "Not started" to record this change's scope.
- Deferred, out of scope here: `assignment.claimedBy`, `assignment.candidates`,
  `parent.instanceId`, `currentStepEnteredAt`, and `chainedFrom`. Also
  deferred: rebuilding the five existing expression indexes. Both are a
  separate change, per `tmp/offene-items.md` item 25 ("Change 2"), which
  needs its own before/after measurement.
