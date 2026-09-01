## Context

See proposal.md, section Why, for the motivation. The state this design starts
from:

- `instances` carries `process_id`, `version`, `status`, `current_step_id`,
  `started_by` and `started_at`. All six are `GENERATED ALWAYS ... STORED`,
  added by Change 1 on 2026-08-30.
- `instances_selection_idx`, `instances_current_step_idx` and
  `instances_started_by_idx` still index the jsonb expressions those six
  columns duplicate. `instances_started_idx` over `started_at` is the one
  column index Change 1 built. `selectInRange`'s range predicate is the one
  reader Change 1 rewrote.
- Change 1's lesson holds here unchanged. Postgres substitutes an expression
  index into a query naming that expression. It substitutes a plain index into
  a query naming that column. It crosses neither way. So a rebuilt index that
  no reader names serves nobody.

The measurements live in `tmp/instance-column-promotion-messung.md`, dated
2026-09-01. Every number below comes from that report. Its setup: PostgreSQL
16.15, 200.000 `instances` rows, nine `EXPLAIN (ANALYZE, BUFFERS)` runs per
figure after a warm run, medians reported. A `VACUUM ANALYZE` ran before each
phase. One table served each comparison, so heap width never moved between two
measurements.

Change 2 (`promote-instance-assignment-columns`) promoted five further keys.
The same report rejected it, and `docs/decisions.md` carries that verdict. This
design depends on none of its columns and builds none of them.

## Goals / Non-Goals

**Goals:**

- Every predicate that reaches one of the three rebuilt indexes reads a plain
  column through a plain index.
- The rebuild survives a re-run of `initSchema` against a database that holds
  the old indexes.
- The `version` comparison stops going through `text`.

**Non-Goals:**

- The assignment indexes. `instances_claimed_by_idx`,
  `instances_candidates_idx` and `instances_parent_idx` stand over keys that
  have no column. This change adds none.
- A predicate that reaches no index. `countInstancesByStatus` scans the whole
  relation today and still will. No index over a bare `status` exists in
  either form.
- Removing a key from `body`. `parseInstance` reads the jsonb, unchanged.

## Decisions

### This change replaces the three indexes rather than dropping them

The benchmark ran a variant with the three indexes removed and nothing in
their place. All six queries that use them fell to a sequential scan. That is
18 to 21 ms, against 0,3 to 6 ms with an index. `liveVersionCounts` alone went
from 1,549 ms to 18,027 ms. Removal would cost far more than it saves, so this
change replaces.

The benchmark measured two narrower shapes, and both lost. A leading
`process_id` alone saves 104 kB and triples the migration scan, 4,771 ms
against 1,548 ms. An
index over `(process_id, version, status) INCLUDE (current_step_id)` costs
9736 kB against 1472 kB, a factor of 6,6, and brings no query forward.
`listInstances` selects `body`. So an index-only scan stays out of reach for
the hottest query, whatever the index covers.

The column triple wins everywhere at the same size:

| Query | expression triple | column triple |
|---|---|---|
| `listInstances`, processId + status | 0,450 ms | 0,325 ms |
| `listInstances`, + version + status | 1,405 ms | 1,023 ms |
| migration population scan | 2,568 ms | 1,548 ms |
| `findOrphanKeys` scan | 5,990 ms | 2,816 ms |
| `liveVersionCounts` | 1,549 ms | 0,343 ms |
| bottlenecks work-in-progress | 1,603 ms | 1,492 ms |
| index size | 1472 kB | 1472 kB |

Writes get cheaper too. Seeding 200.000 rows takes 1834 ms with no selection
index, 2289 ms with the expression triple and 2147 ms with the column triple.
The overhead falls from +24,8 % to +17,1 %. An insert extracts three values
from the jsonb per row for the expression form. For the column form it reads
three ready columns.

### Where the largest gain comes from: the `version` cast

`migration.ts` writes `(body->>'version')::int = $1`. The second column of
`instances_selection_idx` is `(body->>'version')`, of type `text`. A cast
around an indexed expression is not that expression. So the planner cannot use
that column for this predicate. It uses the leading `process_id` column and
filters the rest away.

The estimate shows it. Before the rebuild the planner guessed 49 rows against
500 actual, after it guessed 500 against 500. The generated `version integer`
column compares directly, with no cast, so the second column becomes usable.
That one mismatch is most of the migration scan's 2,568 → 1,548 ms. It is most
of the orphan scan's 5,990 → 2,816 ms too.

`liveVersionCounts` gains for a second reason. Its projection, its filter and
its `GROUP BY` all become columns of one index. So the plan turns into an
index-only scan: 1,549 ms → 0,343 ms, a factor of 4,5.

### The three new indexes carry new names

A `CREATE INDEX IF NOT EXISTS <name>` statement does nothing when an index of
that name exists. Its definition does not matter. Reusing a name would
therefore leave every already-initialised database on the expression form.
This project has exactly one schema path, `initSchema`.

Both alternatives are worse. An unconditional `DROP INDEX` before each
`CREATE INDEX` rebuilds all three indexes on every startup. A definition check
reading `pg_index.indexprs` puts query logic into a schema initialiser.

So each new index gets a `_col_idx` name. `initSchema` drops the old name with
`DROP INDEX IF EXISTS`:

| dropped | created | over |
|---|---|---|
| `instances_selection_idx` | `instances_selection_col_idx` | `(process_id, version, status)` |
| `instances_current_step_idx` | `instances_current_step_col_idx` | `(current_step_id)` |
| `instances_started_by_idx` | `instances_started_by_col_idx` | `(started_by)` |

One suffix serves all three. A reader then meets one rule, rather than three
names that each differ from their predecessor in a different way.

The drops stay in `initSchema` permanently. They cost three catalog lookups
per startup against a database that has already run them once. Removing them
would strand any database that had not.

Two concurrent `initSchema` runs cannot race over them. After this change no
code path builds the three old names again. So each run's
`DROP INDEX IF EXISTS` is a no-op, whichever wins.

A `DROP INDEX` takes an `ACCESS EXCLUSIVE` lock on `instances`. `initSchema`
runs at startup, before the pollers, and this project has nothing deployed. So
the lock window is a fresh process against an idle table.

### Only a predicate that reaches one of the three indexes moves

A `status` comparison already narrowed to one row by `instance_id` gains
nothing from a column. The primary key has found the row already, and the
comparison filters one tuple. Rewriting it would touch working code for no
measured effect. The same holds where another index selects and `status` is
the residual filter.

The measurement names the queries that use these three indexes. Those are what
this change rewrites:

| Site | predicate today | after |
|---|---|---|
| `api.ts::buildInstanceWhere` | `body->>'processId'`, `body->>'version'`, `body->>'status'`, `body->>'currentStepId'`, `body->>'startedBy'` | the five columns |
| `api.ts::resolveVersionCoverage` | `SELECT DISTINCT (body->>'version')::int` | `SELECT DISTINCT version` |
| `migration.ts` population scan | `processId`, `(version)::int`, `status` | the three columns |
| `migration.ts::findOrphanKeys` | `processId`, `(version)::int` | the two columns |
| `definitions.ts::liveVersionCounts` | `processId`, `status`, `GROUP BY version` | the three columns |
| `reporting.ts::selectInRange` | `body->>'processId'` | `process_id` |
| `reporting.ts` bottlenecks WIP | `processId`, `status`, `GROUP BY currentStepId` | the three columns |

These keep the jsonb expression, each for a stated reason:

| Site | why it stays |
|---|---|
| `outbox.ts` field-value patch | `WHERE instance_id = $1` has found the row already |
| `outbox.ts` process-id projection | a projection behind that same key lookup |
| `store.ts` outbox `field_version` backfill | a one-shot `UPDATE` above the `ADD COLUMN` block; the column does not exist yet |
| `subprocess.ts` parent re-check | same, plus a `FOR UPDATE` on that one row |
| `transition.ts::sweepCancelledChildren` | `instances_parent_idx` selects; `status` filters |
| `migration.ts` live-child gate | same index, same role |
| `retention.ts::sweepRetention` | `instances_redacted_idx` selects; `status` filters |
| `timers.ts`, `admin-queries.ts` timer reads | `instances_timer_idx` selects; `status` filters |
| `resolution.ts::drainResolutions` | selects on `resolve_state`; none of the three applies |
| `admin-queries.ts::countInstancesByStatus` | a full scan in either form; no index over a bare `status` exists |

`selectInRange` is the one entry in the first table the measurement does not
list. The benchmark carried no cycle-time query. It moves anyway, as the
sibling half of a predicate Change 1 already rewrote. Its range half reads
`started_at` today while its process half reads `body->>'processId'`. Leaving
that split in place would keep one query naming both forms of the same
rewrite.

### The `version` filter compares as an integer

`buildInstanceWhere` builds `versionText = String(filter.version)` and emits
`body->>'version' = '2'`. The comment above it names the reason: the index
column is `text`. With the column index that reason is gone.
`InstanceListFilter.version` is a `number` already, so the filter binds the
number and compares `version = 2`.

The comparison type changes, and it changes in one direction. Every value the
engine writes is a JSON number. So `body->>'version'` yields a canonical
decimal string, and the two forms agree on every stored row. They part on a
caller value the column cannot hold.

Two classes qualify, and only one of them raises. Measured against Postgres
16.15, not assumed:

| value | `1.5` | `3000000000` |
|---|---|---|
| `::int` cast | rounds to `2` | raises `integer out of range` |
| `version = <value>` | promotes to numeric, no row | promotes to numeric, no row |
| under the old text comparison | empty page | empty page |
| under the shipped predicate | empty page | **raises** |

So the regression is the out-of-range class alone. The cast that fails is the
leading `::int` on the filter's own null test, which `buildInstanceWhere`
emits. An unmapped `PostgresError` maps to a 500 with no message
(`src/http/errors.ts`). So the rewrite turns one empty page into a 500, unless
the guard widens with it.

The fractional class never raised and never will. Rejecting it is still worth
doing, for the smaller reason: a 400 naming the problem beats a silently empty
page. Two rules, two reasons. An earlier draft of this section gave both the
same reason, and that wording is what hid the range case.

The read therefore rejects both before it builds any SQL. The old guard
`assertVersionHasProcessId` carried this filter's other rule, and becomes
`assertVersionFilter` carrying all of them. It bounds the value to
`[-2147483648, 2147483647]`, the range an int4 column holds. Verified against
Postgres 16.15 that both edges bind and that one step past either raises.

No sign check, so the floor is int4's rather than zero. `createDraftSnapshot`
mints a negative, per-process-decrementing sentinel version. A test instance
pins it, so a positive-only guard would reject a draft-test-instance filter.

`parseVersion` in `src/http/routes.ts` checks `Number.isInteger` and no range.
So the HTTP surface carries the same out-of-range hole on its publish and
migration-plan paths. Those write to other `integer` columns and predate this
change, so they stay outside its scope. The `GET /instances` path needs no
second guard: its filter reaches `assertVersionFilter` after `parseVersion`.

The rule that a `version` filter needs a `processId` beside it stays. Its
first reason never depended on the index: a bare version names version 2 of
every process at once. Its second reason survives the rebuild too, since the
new index still leads with `process_id`.

### The stale claim in the persistence spec

One requirement states that a `STORED` generated column does not serve the
current-step predicate. Its ground is that Postgres substitutes an expression
index into a predicate and substitutes no generated column. The ground is
true. The conclusion drawn from it is not. A generated column serves the
predicate once the predicate names the column. The delta replaces that
paragraph with the substitution rule in both directions, which is what governs
the rewrite.

## Risks / Trade-offs

**A well-formed value only the datastore can reject.** → The guard bounds int4
explicitly. It does so in `assertVersionFilter` and in `parseVersion`, so every
route reading a version shares the bound. Tests drive both edges plus one step
past each, at the runtime layer and over HTTP.
The wider lesson outlives this change. Swapping a `text` comparison for a
typed column narrows what the datastore accepts. A behavioural test does not
catch that: the rows come back either way, until a value goes out of range.

**A rewritten predicate that nothing re-measures.** → The last task measures
all three indexes. It runs `EXPLAIN ANALYZE` against a seeded table and
records the chosen plan. A green `bun test` proves the rows come back. Only a
plan readout proves the index carries them.

**A plan flip under `ORDER BY ... LIMIT`.** → The report calls this the
schema's largest planning hazard. A small cost shift moves the query between
an index-scan plan and a sort plan. It appeared three times, once looking like
a 28-fold regression that was a heap-width artefact. So the verification
measurement holds heap width, `VACUUM` state and hit count constant across the
two sides. It reads `listInstances` as a plan shape, not as a duration.

**An older build re-creates a dropped index.** → That needs an old build
running after a new one. This database has one schema path, pre-1.0, nothing
deployed. The `DROP INDEX IF EXISTS` statements make the repair a restart.

**Half a rewrite is slower than none.** → A half-rewritten query reaches
neither index well. It would name a column the new index covers and an
expression the old index covered. The rewrite is per query, and the two tables
above enumerate every query on both sides. So no query ends up split.
`selectInRange` is in the change for exactly this reason.

**The suffix `_col_idx` reads as a temporary name.** → It is not temporary. A
comment in `store.ts` says why the old name could not serve. A later rename
back would cost a second drop-and-build round, for a cosmetic gain.

## Migration Plan

1. `initSchema` drops the three old indexes, then builds the three new ones.
   The order matters inside the function, so the table never carries both
   forms. The whole block moves down, to sit after the `ADD COLUMN` statements
   Change 1 added. A fresh database has no column to index before them, and
   the three old statements sat above that block.
2. No data migrates. The columns exist and hold their values already, and no
   generation expression changes.
3. Rollback is the inverse `initSchema`. Reverting this change restores the
   three expression indexes and the expression predicates together. Reverting
   the schema alone, or the readers alone, leaves every rewritten query on a
   sequential scan. That is the "half a rewrite" risk above.
4. This change reads and writes no definition, instance or outbox row.

## Open Questions

None.
