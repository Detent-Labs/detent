## Context

See proposal.md for motivation. The state that shapes the approach:

`listInstances` in `src/runtime/api.ts` holds one SQL statement. Its `WHERE`
carries six filters, a keyset cursor predicate, and the inbox predicate. That
is the hottest read in the product.

Every filter is a null-guarded pair, in the form
`${x ?? null}::text IS NULL OR body->>'k' = ${x ?? null}`. So an absent filter
costs a constant-folded comparison. It does not branch the query text.

`instances_selection_idx` indexes
`((body->>'processId'), (body->>'version'), (body->>'status'))`.
The `currentStepId` filter reaches no index. The `data` key is neither
filtered nor indexed. Its key set belongs to a process version, so it never
becomes a column.

`Instance.data` is `Record<FieldId, Literal>`. `Literal` is a recursive union
over string, number, boolean, null, array and object.

## Goals / Non-Goals

**Goals:**

- One predicate definition, two result shapes.
- No observable change to the existing list read for a caller passing no new
  filter. The inbox predicate keeps its current SQL and its current plan.
- The option-list path pays for no work it discards.

**Non-Goals:**

- Ordering comparisons over `data`. The `instance-data-query` spec carries the
  reasoning.
- An index over `data`. Nobody knows any consumer's selectivity yet. A GIN
  index over the whole payload guesses at which one matters.
- Any change to what `parseInstance` reads. The body stays canonical.

## Decisions

### The predicate is a SQL fragment builder, not a query builder

`buildInstanceWhere(filter)` returns the fragment both reads interpolate. It
builds no statement, chooses no projection, and knows nothing about paging.

One read with a mode flag was the alternative. The two reads diverge in three
places at once: projection, label resolution and paging. A flag would branch
the whole function body rather than parameterize it.

Leaving `listInstances` untouched and writing a second `WHERE` was the other
alternative. The inbox predicate is subtle enough to define once. It already
spans a claim check, a candidates containment and a role-array overlap.

### `dataWhere` compiles to jsonb containment where it can

An equality comparison over a scalar compiles to
`body->'data' @> jsonb_build_object(fieldId, value)`. Containment is what a GIN
index over `body->'data'` would serve. So an equality-only query stays
indexable if a later change adds that index.

Inequality and membership carry no containment form. They compile to
`body->'data'->fieldId <> $n` and `body->'data'->fieldId = ANY($n)` against a
jsonb array.

Comparing at the jsonb level, rather than through `->>`, matters for the
non-string literals. The `->>` operator casts everything to text. So `1` and
`"1"` stop being distinguishable, and `null` collapses into a missing key. The
engine writes `Literal` values with their JSON types intact. The comparison has
to preserve that.

A field id is an opaque, type-prefixed id from the definition contract. The
query binds it as a value. It never interpolates one as text.

### An absent field does not match, and does not fail

For an absent key, `body->'data'->fieldId` is SQL `NULL`. Every comparison
against `NULL` is unknown. So the row drops out of a conjunctive `WHERE` with
no special handling. That behaviour falls out of the operators rather than
needing a guard. It is also what the spec requires. An instance that has not
yet reached the step writing a field is normal, not an error.

Inequality is the case needing care. When F is absent, `data->F <> 'x'` is
unknown, so an instance missing F does not match `F != x`. That reading is
correct here: a filter naming F asks about instances that have F. The spec
states it as its own scenario, rather than leaving a reader to find it.

### Postgres derives `current_step_id`, the engine never writes it

The `persistence` spec carries the mechanism and its reasoning. The
design-level constraint is immutability. A generated column's expression must
be immutable, and `jsonb ->> text` is. So `currentStepId` qualifies directly.

A timestamp key would not qualify, because `text::timestamptz` reads
`DateStyle` and `TimeZone`. That constraint binds any later key promotion. It
does not bind this one, since `currentStepId` needs no cast.

The filter keeps reading `body->>'currentStepId'` in the SQL text. Postgres
matches a `STORED` generated column's expression against a query predicate the
way it matches an expression index. So the predicate finds the column without
the query naming it. Confirm that on Postgres 16 with `EXPLAIN`. If it does not
hold, the filter names the column directly, which is a one-line change.

### The data read bounds rather than pages

A cursor exists to walk a result set larger than one response, across several
requests. A caller resolves an option list whole, in one call, inside a
transaction about to render a form.

Handing that caller a cursor leaves two bad options. It loops internally, which
is a cursor walk pretending to be a single read. Or it returns a partial list
that a picker renders as complete.

A maximum count with an explicit truncation flag says the thing that matters.
This list is short because it is short, or short because something cut it. The
consumer decides what to do with a cut one. CLAUDE.md's no-silent-caps rule
asks for exactly that: a bound that drops rows stays visible to its caller.

## Risks / Trade-offs

- The column add rewrites the table → It takes an `ACCESS EXCLUSIVE` lock
  throughout. And `initSchema` runs at server start. Nothing runs this engine
  pre-1.0, so no production table is at risk today. Measure the rewrite against
  a seeded table before a second key follows this pattern. Record the finding in
  the change's verification.
- This widens the hottest read → `listInstances` serves the inbox. Refactoring
  its `WHERE` can change a plan, not just a result. The spec keeps every
  existing scenario, so the suite catches a behaviour change. For the plan, run
  `EXPLAIN` on the inbox predicate before and after. A filter-free call must
  produce the plan it produces today.
- `dataWhere` has no index → A comparison over `data` scans the rows the other
  filters leave. That stays acceptable while its companion filters stay
  selective and indexed. An option list names one `processId` and one
  `currentStepId`. This change indexes both. It stops being acceptable once a
  consumer filters on `data` alone. That is the signal to add the GIN index the
  equality form already targets.
- `includeData` widens a narrow payload → A caller that turns it on over an
  unfiltered list pulls every instance's data. It stays off by default. The
  route's existing `scope=all` admin gate does not change either. The narrowing
  this wants is the `read` permission, which is its own change.

## Migration Plan

Every step is additive. The column uses `ADD COLUMN IF NOT EXISTS`, the index
uses `CREATE INDEX IF NOT EXISTS`, and each new filter is optional with today's
behaviour as its absent case. An older engine running against a database this
change initialised sees one extra column it never selects. Rollback drops the
column and the index. No data lives only there.

## Open Questions

- Whether the data read's default maximum count should differ from the list
  read's `DEFAULT_LIST_LIMIT`. An option list and an instance page are not the
  same size. No consumer exists yet to measure against, and changing a default
  later invalidates no definition.
