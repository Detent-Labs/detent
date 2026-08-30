## Context

<!-- antislop: allow synonym-rotation -->
<!-- "ALTER TABLE" below is the SQL statement name, not a rotated synonym for "change". -->
See `proposal.md` - Why. `initSchema` (`src/engine/store.ts`) already
follows one additive convention for every prior `instances` column: `ALTER
TABLE instances ADD COLUMN IF NOT EXISTS`. Each statement is idempotent. None
rewrites a running deployment's assumptions. `redacted_at` is the one
precedent for a promoted scalar that also stays in `body`. This change adds
a second mechanism, `GENERATED ALWAYS AS (...) STORED`, beside the first,
for the six keys `docs/decisions.md` already named.

## Goals / Non-Goals

**Goals:**
- Promote `processId`, `version`, `status`, `currentStepId`, `startedAt`,
  `startedBy` to real generated columns, additive, with the key untouched in
  `body`.
- Resolve the `reporting.ts:89-95` ponytail marker. Give `startedAt` a real
  index and a query that can use it.
- Confirm which generation expressions Postgres accepts against a real
  Postgres 16 instance, not by inference.

**Non-Goals:**
- Rebuilding `instances_selection_idx`, `instances_current_step_idx`, or
  `instances_started_by_idx`. Those expression indexes still serve every
  predicate but the one this change rewrites.
- Touching `assignment.claimedBy`, `assignment.candidates`,
  `parent.instanceId`, `currentStepEnteredAt`, `chainedFrom`, or the indexes
  at `src/engine/store.ts:267,268,276,282,283`. That is Change 2.
- Any change to `src/schema/definition.ts`. All six keys already exist on
  `Instance`.

## Decisions

**Six `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... GENERATED ALWAYS AS
(...) STORED` statements, not one migration touching the CREATE TABLE.**
This matches the existing convention. `created_at`, `kind`, and
`redacted_at` all arrived the same way. Each statement stays independently
idempotent and independently readable in a diff.

**Column types: `text` for `process_id`, `status`, `current_step_id`,
`started_by`, `started_at`; `integer` for `version`.** Verified directly
against this devcontainer's Postgres 16.15:

```
CREATE TABLE gen_probe1 (body jsonb NOT NULL,
  started_at_ts timestamptz GENERATED ALWAYS AS (((body->>'startedAt')::timestamptz)) STORED);
-- ERROR:  generation expression is not immutable

CREATE TABLE gen_probe2 (body jsonb NOT NULL,
  started_at_txt text GENERATED ALWAYS AS ((body->>'startedAt')) STORED);
-- CREATE TABLE

CREATE TABLE gen_probe3 (body jsonb NOT NULL,
  version integer GENERATED ALWAYS AS (((body->>'version')::integer)) STORED);
-- CREATE TABLE
```

The `timestamptz` input path reads session `DateStyle`/`TimeZone`. Postgres
refuses it as a generation expression on that ground. `jsonb ->> text` and
`text::integer` read no session state, so both succeed. Every write site
sets `startedAt` to `new Date().toISOString()` (confirmed by grep), a
fixed-width ISO-8601 string in UTC. A `text` column therefore sorts and
ranges the same way a `timestamptz` column would, with no cast needed.

**Column names use `snake_case`, not a literal lowercase of the jsonb key.**
`process_id`, `current_step_id`, `started_by`, `started_at`, `status`,
`version` follow every other column in the table: `instance_id`,
`transition_seq`, `created_at`, `redacted_at`. A camelCase column name would
need quoting on every reference.

**`selectInRange` filters on `started_at` as text, not on a cast
`timestamptz`.** The function `parseRange` in `reporting-routes.ts` already
builds `DateRange.from`/`.to` as ISO-8601 UTC strings, using `toISOString`.
The rewrite drops a cast instead of adding one.

A plain btree index, `instances_started_idx`, backs this new predicate. It
covers `started_at`. `persistence/spec.md` already notes that an index over
the original `(body->>'startedAt')` expression would not serve a query
naming the generated column. Neither substitution direction happens
automatically, so index and query change together here.

**No other predicate is rewritten in this change.** `processId` in the same
`selectInRange` query stays `body->>'processId'`. `instances_selection_idx`
still serves it. Rewriting it to `process_id` would need a new plain index
on that column, to avoid losing coverage. That work belongs to Change 2,
which measures it.

## Risks / Trade-offs

- [`ALTER TABLE ... ADD COLUMN ... STORED` rewrites the table on an
  already-populated `instances` relation] → Pre-1.0, no deployment holds
  production data to migrate (`CLAUDE.md`'s stage note). The devcontainer
  test database stays small. No rollout plan exists beyond a normal
  `initSchema` run.
- [A promoted column drifts from `body`, if a write bypasses the generated
  expression] → Construction rules this out. A `GENERATED ALWAYS` column has no
  independent write path. Postgres rejects a direct `INSERT`/`UPDATE` naming
  it.
- [Text comparison on `started_at` differs from `timestamptz` comparison at
  the edge] → `parseRange` (`reporting-routes.ts`) is the one production caller
  building a `DateRange`. It always emits `toISOString()`'s canonical
  millisecond form. `test/reporting.test.ts`'s fixture range already
  matches that form, and this change adds no second `DateRange` producer
  with different formatting.
- [Five of the six generated columns gain no new index] → They are additive
  infrastructure for Change 2's query rewrites. They also
  serve an ad hoc admin script wanting `SELECT process_id, status, ... FROM
  instances` with no `jsonb` scan. `docs/decisions.md` already records this
  two-change split as settled.

## Migration Plan

`initSchema` runs the six `ALTER TABLE` statements and the one `CREATE
INDEX`, all `IF NOT EXISTS`. A database that already has the schema gains
the six columns and the index on its next `initSchema` run. That run is
either a server start or the user-administration CLI. A fresh database
gains them on its first
run. No backfill script exists: `GENERATED ALWAYS ... STORED` populates
every existing row as part of the `ALTER TABLE` itself. Pre-1.0, no rollback
plan goes beyond a plain `DROP COLUMN`/`DROP INDEX`.

## Open Questions

None remain. This change turned on one immutability question, and the
Decisions section above verifies the answer.
