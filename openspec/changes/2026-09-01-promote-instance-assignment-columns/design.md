<!-- antislop: allow synonym-rotation -->
<!-- "ALTER TABLE", "DROP INDEX" and "CREATE INDEX" are SQL statement names throughout this file, not rotated synonyms for "change". -->
## Context

See `proposal.md` - Why. `promote-instance-scalar-columns` (2026-08-30)
settled the mechanism. A `GENERATED ALWAYS AS (...) STORED` column sits
beside the jsonb, the key stays in `body`, and `parseInstance` reads the
body as before. This change applies that mechanism to the five remaining
keys and retires the three expression indexes those keys carry.

One property from Change 1 governs the whole design. The planner does not
substitute a generated column into a predicate naming the expression it was
generated from, and it does not substitute the other way either. A new
column and a new index over it therefore change nothing until the query is
rewritten too.

## Goals / Non-Goals

**Goals:**

- Promote `assignment.claimedBy`, `assignment.candidates`,
  `parent.instanceId`, `currentStepEnteredAt` and `chainedFrom` into
  generated columns, additive, with the key untouched in `body`.
- Retire the three expression indexes those keys carry, replacing each with
  a plain index over its new column, and rewrite each reader's predicate in
  the same commit.
- Measure the inbox predicate before and after, against a real Postgres 16
  and a row count high enough that the planner picks an index.

**Non-Goals:**

- `instances_selection_idx`, `instances_current_step_idx` and
  `instances_started_by_idx`. Each covers a key Change 1 already promoted,
  so retiring it needs no new column. That is Change 3.
- An index over `chained_from`. Nothing reads it.
- Any change to `src/schema/definition.ts`. All five keys already exist on
  `Instance`.
- Any change to `parseInstance` or to what a write path stores in `body`.

## Decisions

### `candidates` is a `jsonb` column, not a `text[]` column

`assignment.candidates` is an array, so a generated column over it is the
only one of the five that is not a scalar. Two shapes were tried against
this devcontainer's Postgres 16.15:

```
CREATE TABLE gen_probe_c (body jsonb NOT NULL,
  candidates text[] GENERATED ALWAYS AS
    (ARRAY(SELECT jsonb_array_elements_text(body->'assignment'->'candidates'))) STORED);
-- ERROR:  cannot use subquery in column generation expression

CREATE TABLE gen_probe_b (body jsonb NOT NULL,
  candidates jsonb GENERATED ALWAYS AS ((body->'assignment'->'candidates')) STORED);
-- CREATE TABLE
```

Postgres settles it. Unnesting a jsonb array into a `text[]` needs a
set-returning function, which needs a subquery, which a generation
expression forbids. `jsonb -> text` is immutable and returns jsonb, so the
column is jsonb and the index over it is GIN, the same operator class the
expression index already uses.

That shape also keeps both operators the inbox predicate needs. Both were
run against the probe table and both used the GIN index:

```
SELECT candidates FROM gen_probe_b WHERE candidates @> to_jsonb('user_1'::text);
SELECT candidates FROM gen_probe_b WHERE candidates ?| ARRAY['role:approver'];
```

A `text[]` column would have needed a rewrite of `@>` and `?|` into array
operators, on top of a trigger to populate it. The jsonb column needs
neither.

### `current_step_entered_at` is a `text` column

The same probe run confirms what Change 1 recorded:

```
CREATE TABLE gen_probe_d (body jsonb NOT NULL,
  entered_ts timestamptz GENERATED ALWAYS AS
    (((body->>'currentStepEnteredAt')::timestamptz)) STORED);
-- ERROR:  generation expression is not immutable
```

`text::timestamptz` reads session `DateStyle` and `TimeZone`, so Postgres
refuses it. Every writer produces `currentStepEnteredAt` as
`new Date().toISOString()`, a fixed-width ISO-8601 string in UTC, which
orders lexicographically the way it orders chronologically.

The retention sweep is the one reader. Its predicate compares
`COALESCE(currentStepEnteredAt, startedAt)` against a cutoff `now()` builds.
Comparing text to text needs the cutoff as an ISO-8601 string, and
`to_char` builds one in the same statement:

```
to_char((now() - make_interval(days => $1)) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
```

The probe returned `2026-08-02T09:01:10.652Z` for a 30-day window, matching
`toISOString()`'s shape exactly. Building the cutoff in SQL rather than in
TypeScript keeps the sweep's window semantics identical: `make_interval`
counts calendar days, and a `Date.now() - days * 86400000` in TypeScript
would count fixed 24-hour spans instead.

### The retention sweep keeps its jsonb `status` predicate

The rewritten sweep reads `COALESCE(current_step_entered_at, started_at)`
beside an unchanged `body->>'status' IN ('completed','cancelled')`. Mixing
the two shapes in one statement is deliberate. The `status` column is
Change 1's, and rewriting the predicates that read it is Change 3's scope.
Doing it here would move that scope line for no measured gain, since
`instances_redacted_idx` already narrows this scan before either predicate
runs.

### The three new indexes carry new names

`CREATE INDEX IF NOT EXISTS instances_claimed_by_idx` would not rebuild an
index of that name whose definition differs. Reusing the name means a
`DROP` on every `initSchema` run, or a definition check nobody wants in a
schema initialiser. New names avoid both:

| dropped | created |
| --- | --- |
| `instances_claimed_by_idx` | `instances_claimed_idx` over `claimed_by` |
| `instances_candidates_idx` | `instances_candidate_idx` over `candidates` |
| `instances_parent_idx` | `instances_parent_instance_idx` over `parent_instance_id` |

`DROP INDEX IF EXISTS` on the old name is a no-op from the second
`initSchema` run onward. A database that already holds the old three
converges in one run.

### Measured: the promotion buys no speed

The inbox predicate is the hottest read in the product, so this change was
measured rather than argued. `tmp/bench-inbox.ts` (scratch database
`inbox_bench`, dropped and recreated per run) seeds 200,000 `instances`
rows across 20 processes, 5,000 actors and 40 roles, one fifth of them
claimed. It creates the table with every generated column present in both
phases, so the heap is byte-identical and only the index shape and the
predicate vary. Each figure is the median of nine `EXPLAIN (ANALYZE,
BUFFERS)` runs after a warm-up, on Postgres 16.15 in this devcontainer.

| query | before | after | plan |
| --- | --- | --- | --- |
| inbox, actor with rows | 1.336 ms | 1.323 ms | BitmapAnd, buffers 68 |
| inbox, actor with none | 1.264 ms | 1.287 ms | BitmapAnd, buffers 28 |
| retention sweep, 500 rows | 0.424 ms | 0.445 ms | pkey scan, buffers 211 |
| child sweep by parent | 0.011 ms | 0.011 ms | index scan, buffers 4 |

The plans match node for node. Before, the bitmap ORs
`instances_claimed_by_idx` with two scans of `instances_candidates_idx` and
ANDs the result against `instances_selection_idx`. After, the same shape
reads `instances_claimed_idx` and `instances_candidate_idx` instead. Buffer
counts are identical. The index sizes are identical too: 2456 kB for the
GIN index either way, 1384 kB for the btree.

The cost side does move. `tmp/bench-heap.ts` builds the same 200,000 rows
twice, once with Change 1's six columns and once with all eleven:

| table | heap | 200,000 inserts |
| --- | --- | --- |
| Change 1 columns only | 104 MB | 1852 ms |
| plus this change's five | 116 MB | 1960 ms |

That is 11.6% more heap, about 63 bytes per row, and 5.8% more insert time.
`candidates` carries most of it: a duplicated jsonb array is wider than the
four text scalars beside it.

So the honest verdict is that this change buys no runtime gain and costs
real storage. What it buys is a single predicate vocabulary. Every
predicate over a standardized instance key reads a column, and no reader
has to know which keys got an expression index and which did not.
`docs/decisions.md` settled that direction on 2026-08-25, and this measures
its price rather than assuming it away.

One earlier measurement is worth recording because it looks like a result
and is not. Running the two phases against tables of different width
(columns added by `ALTER TABLE` between phases) produced 1.334 ms before
and 37.345 ms after, a plan flip onto `instances_created_idx` with 199,960
rows filtered. The flip came from the wider heap changing the cost of the
`ORDER BY created_at DESC LIMIT 50` path, not from the index shape. It
reproduces in either direction once the widths differ, so the paired
measurement above holds both widths equal.

## Risks / Trade-offs

- [The heap grows 11.6% for no measured speed] → Accepted, and recorded
  above rather than buried. Pre-1.0, no deployment holds production data,
  and the alternative is a permanent split where some standardized keys
  read as columns and others as jsonb paths.
- [`DROP INDEX` on a live table takes an `ACCESS EXCLUSIVE` lock] → The
  three drops run inside `initSchema`, at server start, before the poll
  loops begin. `CLAUDE.md`'s stage note rules out a rolling deployment that
  would need `DROP INDEX CONCURRENTLY`.
- [A rewritten predicate changes which rows match] → Each of the four
  rewrites replaces an expression with the column generated from that exact
  expression, so the two are equal by construction for every row. The
  retention rewrite is the one exception, since it also moves the
  comparison from `timestamptz` to text. `tasks.md` covers it with a
  boundary test.
- [`chained_from` has no reader and no index] → It is the one column here
  added on `docs/decisions.md`'s judgment rather than on a present need.
  The alternative is a second `ALTER TABLE` change later. The column costs
  a few bytes per row and `parseInstance` never sees it.
- [The retention cutoff's `to_char` format drifts from `toISOString`] →
  Both produce `YYYY-MM-DDTHH:MM:SS.sssZ`, verified against the probe. A
  boundary test in `tasks.md` pins it, and a drift would show as a sweep
  that redacts an instance one window early or late.
- [A `currentStepEnteredAt` in some other ISO-8601 form sorts wrong against
  the cutoff] → `timestamp` in `src/schema/definition.ts:160` is a bare
  `z.string()`, so the schema does not pin the form. Two forms would
  misorder. A value with no milliseconds sorts after one with, inside the
  same second, because `Z` is above `.`. A value carrying an offset such as
  `+02:00` sorts by its wall clock rather than its instant. Every engine
  writer produces `new Date().toISOString()`, confirmed at
  `src/engine/store.ts:1107` and `src/engine/transition.ts:203` and `:215`,
  so neither form reaches the column from the engine. A hand-written body
  can still carry one, and `test/retention.test.ts:181` already writes a
  no-millisecond `startedAt`. The window is measured in days, so a
  sub-second misorder changes no outcome, and an offset form was already
  mis-sorted by Change 1's `started_at` column. `tasks.md` covers the
  no-millisecond case with an assertion rather than a schema change.

## Migration Plan

`initSchema` runs the five `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
statements, the three `DROP INDEX IF EXISTS` and the three `CREATE INDEX IF
NOT EXISTS`, in that order. Every statement is idempotent. A database
holding the old three indexes converges on its next run, which is a server
start or the user-administration CLI. `GENERATED ALWAYS ... STORED`
populates every existing row as part of the `ALTER TABLE` itself, so no
backfill script exists. Pre-1.0, rollback is a plain `DROP COLUMN` plus
recreating the three expression indexes.

## Open Questions

None. The two questions this change turned on, the array column's shape and
the timestamp column's type, are answered under Decisions against a real
Postgres 16.15.
