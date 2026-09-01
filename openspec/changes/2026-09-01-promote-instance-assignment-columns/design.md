<!-- antislop: allow-file synonym-rotation -->
<!-- "ALTER TABLE", "DROP INDEX", "CREATE INDEX" and "DROP COLUMN" throughout this file are SQL statement names, not rotated synonyms for "change"/"alter". -->
## Context

See `proposal.md` - Why. `promote-instance-scalar-columns` (2026-08-30)
settled the mechanism. A `GENERATED ALWAYS AS (...) STORED` column sits
beside the jsonb. The key stays in `body`, and `parseInstance` reads the
body as before. This change applies that mechanism to the five remaining
keys. It also retires the three expression indexes those keys carry.

One property from Change 1 governs the whole design. The planner never
swaps a generated column for the expression behind it. It never swaps the
other way either. So a new column and a new index over it change nothing
until the query moves too.

## Goals / Non-Goals

**Goals:**

- Promote `assignment.claimedBy`, `assignment.candidates`,
  `parent.instanceId`, `currentStepEnteredAt` and `chainedFrom` into
  generated columns. The promotion stays additive, and the key stays
  untouched in `body`.
- Retire the three expression indexes those keys carry. Each gives way to a
  plain index over its new column, and each reader's predicate moves in the
  same commit.
- Measure the inbox predicate before and after. The measurement runs against
  a real Postgres 16, over enough rows that the planner picks an index.

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

`assignment.candidates` is an array. So a generated column over it is the
one of the five that is not a scalar. This devcontainer's Postgres 16.15
answered both candidate shapes directly:

<!-- antislop: allow sentence-length -->
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
set-returning function. That needs a subquery, and a generation expression
forbids one. The `jsonb -> text` operator is immutable and yields jsonb. So
the column is jsonb, and the index over it is GIN. That is the operator
class the expression index already uses.

The jsonb shape also keeps both operators the inbox predicate needs. The
probe table ran each one, and each used the GIN index:

```
SELECT candidates FROM gen_probe_b WHERE candidates @> to_jsonb('user_1'::text);
SELECT candidates FROM gen_probe_b WHERE candidates ?| ARRAY['role:approver'];
```

A `text[]` column would have needed a rewrite of `@>` and `?|` into array
operators. It would have needed a trigger to fill the column too. The jsonb
column needs neither.

### `current_step_entered_at` is a `text` column

The same probe run confirms what Change 1 recorded:

```
CREATE TABLE gen_probe_d (body jsonb NOT NULL,
  entered_ts timestamptz GENERATED ALWAYS AS
    (((body->>'currentStepEnteredAt')::timestamptz)) STORED);
-- ERROR:  generation expression is not immutable
```

A `text::timestamptz` cast reads session `DateStyle` and `TimeZone`, so
Postgres refuses it. Every writer creates `currentStepEnteredAt` as
`new Date().toISOString()`. That is a fixed-width ISO-8601 string in UTC,
and it orders lexicographically the way it orders chronologically.

The retention sweep is the one reader. Its predicate weighs
`COALESCE(currentStepEnteredAt, startedAt)` against a cutoff from `now()`.
Comparing text to text needs the cutoff as an ISO-8601 string too. The
`to_char` function builds one in the same statement:

```
to_char((now() - make_interval(days => $1)) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
```

The probe returned `2026-08-02T09:01:10.652Z` for a 30-day window. That
matches `toISOString()`'s shape exactly. The cutoff stays in SQL rather
than moving to TypeScript, which keeps the window semantics identical.
`make_interval` counts calendar days. A `Date.now() - days * 86400000` in
TypeScript would count fixed 24-hour spans instead.

### The retention sweep keeps its jsonb `status` predicate

The rewritten sweep reads `COALESCE(current_step_entered_at, started_at)`.
Beside it stands an unchanged `body->>'status' IN ('completed','cancelled')`.
Mixing the two shapes in one statement is deliberate. The `status` column is
Change 1's, and the predicates reading it belong to Change 3. Moving them
here would move that scope line for no measured gain, since
`instances_redacted_idx` already narrows this scan first.

### The three new indexes carry new names

A `CREATE INDEX IF NOT EXISTS instances_claimed_by_idx` will not rebuild an
index of that name whose definition differs. Reusing the name means a `DROP`
on every `initSchema` run. The alternative is a definition check nobody
wants in a schema initialiser. New names avoid both:

| dropped | created |
| --- | --- |
| `instances_claimed_by_idx` | `instances_claimed_idx` over `claimed_by` |
| `instances_candidates_idx` | `instances_candidate_idx` over `candidates` |
| `instances_parent_idx` | `instances_parent_instance_idx` over `parent_instance_id` |

A `DROP INDEX IF EXISTS` on the old name is a no-op from the second
`initSchema` run onward. A database already holding the old three converges
in one run.

### Measured: the promotion buys no speed

The inbox predicate is the hottest read in the product. So this change
measured it rather than arguing it. The bench seeds 200,000 `instances`
rows into a scratch database, across 20 processes, 5,000 actors and 40
roles. One fifth of the rows carry a claim.

The bench creates the table with every generated column present in both
phases. The heap is therefore byte-identical. Only the index shape and the
predicate vary. Each figure below is the median of nine
`EXPLAIN (ANALYZE, BUFFERS)` runs, after a warm-up. The host is Postgres
16.15 in this devcontainer.

| query | before | after | plan |
| --- | --- | --- | --- |
| inbox, actor with rows | 1.336 ms | 1.323 ms | BitmapAnd, buffers 68 |
| inbox, actor with none | 1.264 ms | 1.287 ms | BitmapAnd, buffers 28 |
| retention sweep, 500 rows | 0.424 ms | 0.445 ms | pkey scan, buffers 211 |
| child sweep by parent | 0.011 ms | 0.011 ms | index scan, buffers 4 |

The plans match node for node. Before, the bitmap ORs
`instances_claimed_by_idx` with two scans of `instances_candidates_idx`. It
ANDs that against `instances_selection_idx`. After, the same shape reads
`instances_claimed_idx` and `instances_candidate_idx` instead. Buffer counts
are identical. The index sizes match too: 2456 kB for the GIN index either
way, and 1384 kB for the btree.

The cost side does move. A second bench builds the same 200,000 rows twice.
The first table carries Change 1's six columns. The second carries all
eleven:

| table | heap | 200,000 inserts |
| --- | --- | --- |
| Change 1 columns only | 104 MB | 1852 ms |
| plus this change's five | 116 MB | 1960 ms |

That is 11.6% more heap, about 63 bytes per row. Insert time rises 5.8%.
The `candidates` column carries most of that width. A duplicated jsonb
array is wider than the four text scalars beside it.

So the honest verdict is plain. This change buys no runtime gain, and it
costs real storage. What it buys is a single predicate vocabulary.

Every predicate over a standardized instance key reads a column. No reader
has to know which keys got an expression index and which did not.
`docs/decisions.md` settled that direction on 2026-08-25. This bench prices
it rather than assuming it away.

One earlier reading is worth recording. It looks like a result and is not.
An early run put the two phases against tables of different width, because
`ALTER TABLE` added the columns between phases. It read 1.334 ms before and
37.345 ms after. The plan had flipped onto `instances_created_idx`,
filtering 199,960 rows.

The wider heap caused that flip. It changed the cost of the
`ORDER BY created_at DESC LIMIT 50` path. The flip reproduces in either
direction once the widths differ. So the paired bench above holds both
widths equal.

## Risks / Trade-offs

- [The heap grows 11.6% for no measured speed] → Accepted. The verdict sits
  above rather than buried. Pre-1.0, no deployment holds production data.
  The alternative is a permanent split, where some standardized keys read as
  columns and others as jsonb paths.
- [A `DROP INDEX` on a live table takes an `ACCESS EXCLUSIVE` lock] → The
  three drops run inside `initSchema`. That is server start, ahead of the
  poll loops. `CLAUDE.md`'s stage note rules out a rolling deployment. Only
  such a deployment would need `DROP INDEX CONCURRENTLY`.
- [A rewritten predicate changes which rows match] → Each of the four
  rewrites swaps an expression for the column behind it. The two are equal
  by construction, on every row. The retention rewrite is the one
  exception. It also moves the comparison from `timestamptz` to text, and
  `tasks.md` covers that with a boundary test.
- [Another ISO-8601 form sorts wrong] → The `timestamp` schema at
  `src/schema/definition.ts:160` is a bare `z.string()`. It pins no form. Two forms would misorder. A value
  with no milliseconds sorts after one with, inside the same second. That is
  because `Z` is above `.`. A value carrying an offset such as `+02:00`
  sorts by its wall clock rather than its instant.

  Neither form reaches the column from the engine. Every engine writer emits
  `new Date().toISOString()`, at `src/engine/store.ts:1107` and
  `src/engine/transition.ts:203` and `:215`. A hand-written body can still
  carry one, and `test/retention.test.ts:181` already writes a
  no-millisecond `startedAt`. The window counts in days, so a sub-second
  misorder changes no outcome. Change 1's `started_at` column already
  mis-sorts an offset form. `tasks.md` covers the no-millisecond case with
  an assertion, rather than tightening the schema.
- [`chained_from` has no reader and no index] → It is the one column added
  on `docs/decisions.md`'s judgment, not on a present need. The alternative
  is a second `ALTER TABLE` change later. The column costs a few bytes per
  row, and `parseInstance` never sees it.
- [The retention cutoff's `to_char` format drifts from `toISOString`] → Both
  emit `YYYY-MM-DDTHH:MM:SS.sssZ`, as the probe confirms. A boundary test in
  `tasks.md` pins it. A drift would read as a sweep redacting an instance
  one window early or late.

## Migration Plan

`initSchema` runs three statement groups, in order. First the five
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements. Then the three
`DROP INDEX IF EXISTS`. Then the three `CREATE INDEX IF NOT EXISTS`. Every
statement is idempotent.

A database holding the old three indexes converges on its next run. That run
is a server start or the user-administration CLI. `GENERATED ALWAYS ...
STORED` fills every existing row as part of the `ALTER TABLE` itself, so no
backfill script exists. Pre-1.0, rollback is a plain `DROP COLUMN` plus
recreating the three expression indexes.

## Open Questions

None. This change turned on two questions: the array column's shape, and the
timestamp column's type. The Decisions section above answers each one
against a real Postgres 16.15.
