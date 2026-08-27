## Context

See proposal.md for motivation. The state that shapes the approach:

`listInstances` in `src/runtime/api.ts` holds one SQL statement. That
statement is the hottest read in the product. Its `WHERE` carries five plain
filters: `processId`, `status`, `currentStepId`, `startedBy` and `claimedBy`.
Beside them sit the inbox pair and the keyset cursor predicate.

A plain filter here means one over a single `body` key. The date bounds and
`excludeInstanceId` this change adds read columns instead, so they join no such
count.

The inbox pair is `assignedTo` and `assignedToRoles`. The first matches a
claimant or a candidate id. The second matches a candidate role through
`body->'assignment'->'candidates' ?| ${assignedToRolesArr}`. And `scope=mine`
rests on that second half.

Most filters are a null-guarded pair. Its form is
`${x ?? null}::text IS NULL OR body->>'k' = ${x ?? null}`. Exactly three of the
five match it: `processId`, `currentStepId` and `startedBy`.

The other two plain filters differ. A `status` filter guards a `::text[]`
array and compares with `= ANY`. A `claimedBy` filter guards `::text` and reads
a nested path. The `assignedTo` half is a three-branch disjunction. An absent
filter costs a constant-folded comparison in every shape. It does not branch
the query text.

`instances_selection_idx` indexes
`((body->>'processId'), (body->>'version'), (body->>'status'))`. Of the five
plain filters, `processId` reaches its leading column. A `status` filter
reaches its third column, which needs the two ahead of it bound to narrow a
scan. A `claimedBy` filter reaches `instances_claimed_by_idx`. The
`currentStepId` and `startedBy` filters reach no index. This change adds a
sixth plain filter, `version`, reaching that index's second column with
`processId` bound beside it.

The `data` key is neither filtered nor indexed. Its key set belongs to a
process version, so it never becomes a column.

`Instance.data` is `Record<FieldId, Literal>`. `Literal` is a recursive union
over string, number, boolean, null, array and object.

## Goals / Non-Goals

**Goals:**

- One predicate definition, two result shapes.
- No observable change to the existing list read for a caller passing no new
  filter. The inbox predicate keeps its current SQL and its current plan.
- The option-list path pays for no work it discards.

**Non-Goals:**

- Ordering comparisons over `data`. A field id's declared type belongs to a
  process version, so two versions can declare one id under two types. A `>`
  or a `<` inside `dataWhere` then carries no version-independent meaning. That
  reasoning stays in this document, not in a published requirement.
- Result ordering over `data`. That is `ORDER BY body->'data'->F`, a separate
  mechanism from the operator above. The data read fixes
  `created_at DESC, instance_id DESC`, and the list read keeps its keyset
  order. So neither read sorts over a field value today. Sorting a report table
  over field values stays open in `docs/decisions.md`. A later sorting change
  should widen a scope, not overturn a rule.
- An index over `data`. Nobody knows any consumer's selectivity yet. A GIN
  index over the whole payload guesses at which one matters.
- Any change to what `parseInstance` reads. The body stays canonical.
- Any `dataWhere` a route would carry. Nothing over HTTP reads `data` until the
  instance data table lands. Its encoding, its rejection rules and its scenarios
  ship with that consumer.
- An HTTP route for `queryInstances`. The aggregated data source resolves
  inside the engine, on the option-list path, so it reaches the read
  in-process. The instance data table is a `packages/web` feature and does
  need a route. That route belongs to its own change, beside the saved-report
  object it reads.

## Decisions

### The predicate is a SQL fragment builder, not a query builder

`buildInstanceWhere(filter)` returns the fragment both reads interpolate. It
builds no statement, chooses no projection, and knows nothing about paging.

Bun.sql nests tagged fragments. Measured in this devcontainer on Bun 1.3.11:
``db`SELECT * FROM t WHERE ${db`x = ${2}`}` `` runs and binds correctly. So the
fragment carries its own parameters into the outer statement.

Folding a variable number of comparisons measured clean. A `dataWhere` of N
comparisons composes N fragments, so the comparison compilation is what needs
the fold. The extraction itself folds nothing variable.

On Bun 1.3.11 in this devcontainer, a left-nested reduce binds correctly and
in order at N of 0, 1 and 3. It holds on out to 100 comparisons. It holds
under two levels of nesting. Bound parameters sit on both sides of the nested
fragment, and one fragment appears twice in one statement. An empty fragment
is not valid SQL inside `WHERE ${...}`, so the zero case reduces from a
``db`TRUE` `` fragment.

`buildInstanceWhere` takes the shared filter without `dataWhere`, and the
comparisons compile separately. The probe below needs that first half alone.

One read with a mode flag was the alternative. The two reads diverge in three
places at once: projection, label resolution and paging. A flag would branch
the whole function body rather than parameterize it.

Leaving `listInstances` untouched and writing a second `WHERE` was the other
alternative. The inbox predicate is subtle enough to define once. It already
spans a claim check, a candidates containment and a role-array overlap.

### A `dataWhere` right side is a scalar literal

Equality and inequality take one scalar literal: string, number, boolean or
null. Membership takes a list of scalar literals. The read rejects an array or
an object right side.

The reason is jsonb containment. Measured in psql:
`'{"F":[1,2,3]}'::jsonb @> '{"F":[3,2,1]}'::jsonb` is true, and
`'{"F":{"a":1,"b":2}}'::jsonb @> '{"F":{"a":1}}'::jsonb` is true. So a
containment comparison over an array or an object is subset matching, not
equality. A caller writing `F == [1,2,3]` would get supersets back, in any
order.

Both named consumers compare scalars. An option list's value field holds one,
and a report filter compares one. So the restriction costs nothing today.
Widening it later is additive, and it lands with the compilation the wider
right side needs.

`docs/decisions.md` records the `instance.query` comparison right side as a
literal or a field of the reading instance. Here it is literal-only, and that
is the whole of it. The reading-instance field resolves to a literal in the
caller, before it reaches this read.

### Equality compiles to jsonb containment

An equality comparison compiles to
`body->'data' @> jsonb_build_object(fieldId::text, value::text::jsonb)`. The
key argument carries an explicit `::text` cast. The function is
`VARIADIC "any"`, so a bound key with no cast has no type to resolve against.
Measured in this devcontainer: the uncast form raises
`could not determine data type of parameter $2`. The cast form selects
correctly for a string, a number, a boolean and a JSON null.

Containment is what a GIN index over `body->'data'` would serve. So an
equality-only query stays indexable if a later change adds that index.

Inequality compiles to `body->'data'->fieldId <> $n`. Membership compiles to
`body->'data'->fieldId IN (SELECT jsonb_array_elements($n::text::jsonb))`. A
plain array right side does not work. Measured: `= ANY` over a jsonb array
raises `op ANY/ALL (array) requires array on right side`. It needs a Postgres
array of jsonb values, which a bound JSON array is not.

Binding the list as one JSON string and unnesting it with
`jsonb_array_elements` needs no array cast and no `db.array`. So it reuses the
`::text::jsonb` cast measured below, and it binds one value whatever the
list's length. A `db.array` with a `text[]::jsonb[]` cast was the alternative.
That cast is the one form here nobody has measured.

Every bound JSON value casts as `::text::jsonb`, never as `::jsonb` alone.
Measured in this devcontainer on Bun 1.3.11:
``db`SELECT ${JSON.stringify([1,2,3])}::jsonb AS x` `` returns the jsonb string
`"[1,2,3]"`, not the array. The driver sends the value as text, so a bare
`::jsonb` cast reads it as a JSON string. With `::text::jsonb` on both sides,
equality and containment return the expected values.

Comparing at the jsonb level, rather than through `->>`, matters for the
non-string literals. The `->>` operator casts everything to text. So `1` and
`"1"` stop being distinguishable, and `null` collapses into a missing key. The
engine writes `Literal` values with their JSON types intact. The comparison has
to preserve that.

A field id is an opaque, type-prefixed id from the definition contract. The
query binds it as a value. It never interpolates one as text. A bound field id
landing in a `VARIADIC "any"` argument carries a `::text` cast. Postgres has no
other way to type it.

### An absent field does not match, and does not fail

Two mechanisms produce that, one per operator shape. Equality compiles to
containment. A jsonb object lacking the key contains nothing under it, so `@>`
returns false. Inequality and membership read `body->'data'->fieldId`, which is
SQL `NULL` for an absent key, so each comparison is unknown.

Either way the row drops out of a conjunctive `WHERE` with no special handling.
That behaviour falls out of the operators rather than needing a guard. It is
also what the spec requires. An instance that has not yet reached the step
writing a field is normal, not an error.

Inequality is the case needing care. When F is absent, `data->F <> 'x'` is
unknown, so an instance missing F does not match `F != x`. That reading is
correct here: a filter naming F asks about instances that have F. The spec
states it as its own scenario, rather than leaving a reader to find it.

### The two new indexes are expression indexes

`instances_current_step_idx` indexes `((body->>'currentStepId'))`, and
`instances_started_by_idx` indexes `((body->>'startedBy'))`. That matches the
treatment `instances_selection_idx`, `instances_claimed_by_idx`,
`instances_candidates_idx` and `instances_parent_idx` already get.

`startedBy` joins this change because the same requirement covers it.
`src/http/routes.ts:460` sets that filter for every `scope=started` request,
which is a participant-facing screen. Leaving it out would land a requirement
that its own enumeration falsifies.

A `STORED` generated column was the alternative, and it does not serve the
predicate. Measured on Postgres 16 over 50k rows, each index measured on its own:
`WHERE body->>'currentStepId' = 'step_7'` against an indexed generated column
plans a `Seq Scan`. The same predicate against
`CREATE INDEX ON instances ((body->>'currentStepId'))` plans a
`Bitmap Index Scan`. Postgres substitutes an expression index into a
predicate. It does not substitute a generated column.

The expression index also costs less. It persists no state, forces no table
rewrite, and takes no `ACCESS EXCLUSIVE` lock on `instances`.

It leaves a recorded plan intact too. The owner's 2026-08-25 note in
`docs/decisions.md` suggests promoting six keys out of `body` into real
columns. Two of the six are `currentStepId` and `startedBy`.

That move retires the expression indexes standing in for those keys. It would
also have to drop a generated column and repeal the requirement declaring one.

The note's count does not map onto the indexes, and this change does not make
it map. After this change `instances` carries six expression indexes. One of
them, `instances_selection_idx`, covers three of the note's six fields at once.
Two more, the ones added here, cover one field each.

The remaining three stand in for keys the note does not name. Those are the
claim, candidates and parent indexes. The inbox predicate reads the first two,
and the child sweep reads the third. So a promotion change retires three
indexes, not six. They are the two added here, and `instances_selection_idx`,
whose three expression columns all sit among the note's six fields. The sixth
field, `startedAt`, retires nothing.

The bottlenecks view is not a second reader. It groups by
`body->>'currentStepId'` at `src/engine/reporting.ts:320-323`. Its `WHERE`
filters `processId` and `status`, which `instances_selection_idx` serves.

Measured on Postgres 16 over 80k rows, with both indexes in place. The plan is a
bitmap scan on the selection index. A hash aggregate runs over the reduced set.
The current-step index is never touched.

### The `version` filter compares as text

`instances_selection_idx` indexes `(body->>'version')` as text. So the filter
compares `body->>'version'` against the version written as text. A `::int`
comparison, of the kind `src/engine/migration.ts:582-584` writes, misses that
index. The filter's own value stays a number in the TypeScript type.

The filter also needs a `processId` beside it. A bare `version` reaches no
index, since `instances_selection_idx` leads with `processId`. A version number
also anchors to one process, the way a field id does. So both reads reject a
`version` carrying no `processId`, the rule `dataWhere` already carries.

### The data read bounds rather than pages

A cursor exists to walk a result set larger than one response, across several
requests. A caller resolves an option list whole, in one call, while a form
waits on it.

Handing that caller a cursor leaves two bad choices. It loops internally, which
is a cursor walk pretending to be a single read. Or it returns a partial list
that a picker treats as complete.

A maximum count with an explicit truncation flag says the thing that matters.
This list is short because it is short, or short because something cut it. The
consumer decides what to do with a cut one.

The bound is a default plus an enforced maximum, the pair the list read already
carries as `DEFAULT_LIST_LIMIT` and `MAX_LIST_LIMIT`. A read with no cursor
needs the cap more than a paged one, not less.

The read orders by `created_at DESC, instance_id DESC`, the order the list read
already uses and `instances_created_idx` already indexes. Without an order a
truncated result is an arbitrary subset. An option list then reshuffles from
one call to the next.

### The data read takes its own filter type and rejects a borrowed key

The shared builder `buildInstanceWhere` takes a filter widened to the union of
what both reads pass. That is nine of the ten shared members, every one but
`dataWhere`, which compiles separately. It also takes the inbox pair the list
read alone sets. The flag `includeDegraded` stays out, since it selects no row
and drops one after the fact. Every member is optional, and an absent one costs
a constant-folded comparison.

The data read takes `InstanceQueryFilter`, which declares the ten members its
requirement enumerates and nothing else. The list read's own
`InstanceListFilter` keeps the inbox pair and `includeDegraded`, which only it
resolves.

The read's signature mirrors the list read's:
`queryInstances(filter: InstanceQueryFilter, page: { limit?: number },
db?: SQL)`. The bound sits in the second argument, beside where the list read's
`limit` sits. That argument declares no `cursor`, so a caller writing the page
argument as a literal gets a type error. A spread wider object compiles, and
the read drops the key.

The denylist covers the four rejected keys for two reasons. Dropping
`assignedTo`, `assignedToRoles` or `scope` silently would widen the result set.
Dropping `includeDegraded` would answer a question the caller did not ask. A
dropped `cursor` does neither. It returns the first page, which is all this
read hands back.

The read returns `InstanceDataPage`, which is
`{ items: InstanceDataItem[]; truncated: boolean }`. An `InstanceDataItem`
carries `instanceId`, `version`, `data` and an optional `redactedAt`. It is not
`Page<T>`: that type's `cursor` is what this read must not hand back, and
`truncated` is what takes its place.

The runtime check is a denylist, not a whitelist. It raises on `assignedTo`,
`assignedToRoles`, `scope` and `includeDegraded`. It ignores any other
unrecognized key, the way `listInstances` already ignores one.

Three of the four name the list read's inbox predicate. Those three are
`assignedTo`, `assignedToRoles` and `scope`. The HTTP layer derives `scope`
into the first two at `src/http/routes.ts:460-463`, before the read runs. No
Runtime API Layer filter type declares `scope` at all. So that entry guards a
hand-built object rather than a spread one. The fourth key, `includeDegraded`,
names a summary the data read never resolves.

A whitelist was the alternative. It makes every later additive filter a
breaking change for a caller spreading a wider object into the call. This
read's one consumer builds its filter that way. No read in this layer validates
a key set today, so a whitelist here would be the only one.

The rule is a guard for the consumer's own route, which arrives with the
instance data table. One layer up, `src/http/account-routes.ts:82` already
rejects an unknown key by name.

### `excludeInstanceId` names one id and filters in SQL

The recorded consumer is one instance reading its own process. It omits itself,
one id. A list serves no consumer today, and widening one id to a list later is
additive.

The predicate compares the `instance_id` column, not `body->>'instanceId'`.
That column is the table's key. Comparing it costs a column read per scanned
row rather than a jsonb extraction. Measured: `instance_id <> $1` plans
as a `Filter`, never an index condition, since `<>` is not indexable. So the
saving is the extraction, not a lookup. It takes the null-guarded shape the
other filters take.

The predicate joins the `WHERE`, the way every other filter does. So it costs
no post-filter pass. It also never shortens a page below its `limit`, the way a
dropped degraded item does. An id matching no instance is not an error. That is
the ordinary case for a filter naming a row the other filters already exclude.

### `DataComparison` is a Runtime API Layer type

The type lives in `src/runtime/api.ts`. The definition contract does not
change, and no schema in `src/schema/definition.ts` gains a comparison.

A later `instance.query` data source carries its comparison list in its own
`configSchema`, behind the plugin envelope `{ type, config }`.
`.claude/rules/process-contract.md` states that rule. The core validates the
envelope, and each plugin ships its own schema. Publish checks that schema
through `checkConfigOnly` (`src/engine/registry-check.ts:70`), the way it
already parses `db.list`'s `listKey` against `dbListDataSourceConfigSchema`
(`src/engine/host.ts:70`).

### The date range reads the `created_at` column

`createdAfter` and `createdBefore` bound `instances.created_at`. Postgres writes
that column as `DEFAULT now()` (`src/engine/store.ts:248`).
`instances_created_idx` indexes it, and both reads already order by it.

`Instance.startedAt` was the alternative. It is a body key
(`src/schema/definition.ts:1167`), written by JavaScript as
`new Date().toISOString()` (`src/runtime/api.ts:901`). No index covers it. The
two values can differ by the writing clock.

The body's own record stays `startedAt`. The reporting date range reads it in
`src/engine/reporting.ts`. It is also one of the keys `docs/decisions.md` names
for promotion out of `body`.

Both bounds include the instant they name. `src/engine/reporting.ts:31` already
documents its own range as inclusive on both ends. One convention across two
date ranges beats two.

The comparison runs in SQL against `created_at` itself, never against a
driver-converted `Date`. This repo has paid for that distinction once. The
`fix-instance-list-cursor-precision` change (ROADMAP.md stage 6) derived the
keyset cursor from the driver's `Date` value. That value is
millisecond-precise, and boundary rows fell out of the walk. Its fix selects
`created_at::text`, which carries Postgres's full microsecond precision.
`listInstances` still carries that comment at `src/runtime/api.ts:1255-1263`. A
test naming a stored instant reads that same `created_at::text` value.

The granularity the read exposes is not the granularity it compares. The
summary computes `createdAt` as `new Date(createdAt).toISOString()`
(`src/runtime/api.ts:344`), so it truncates to milliseconds. Postgres writes
that column with `DEFAULT now()` (`src/engine/store.ts:248`), which carries
microseconds. Measured in this devcontainer: `now()` returned
`2026-08-26 21:39:35.61618+02`, and its `toISOString()` returned
`2026-08-26T19:39:35.616Z`. Comparing the stored value against the truncated
one with `<=` returns false.

So a `createdBefore` carrying a summary's `createdAt` omits the instance it
came from, unless that stored value carries no sub-millisecond part. A
`createdAfter` carrying it returns that instance in both cases. The spec states
both. It promises no exact-instant round trip the returned value cannot
support.

### A comparison names a scalar-valued field

`src/schema/definition.ts:202-204` declares ten field types. Seven hold a
scalar: `string`, `number`, `boolean`, `date`, `datetime`, `select` and
`reference`. `multiselect` holds `string[]` (`:368`). `file` and `group` are
opaque.

An array left side is the silent case. Containment against a scalar never
matches an array, and a membership list of scalars never matches one either. So
a filter over a `multiselect` would return nothing and look like a real answer.

The read raises instead. It checks each compared field id against the rows its
other filters select. That check sees only those rows, which the risks below
name.

A comparison compiled into the main `WHERE` never sees an array-valued row.
Containment does not match one, so it drops out.

The check is its own statement, one per compared field id. It stops at the
first offending row rather than returning one row per selected instance:

    SELECT 1 FROM instances
    WHERE <the other filters>
      AND jsonb_typeof(body->'data'->${fieldId}) IN ('array', 'object')
    LIMIT 1

A returned row raises before the main query runs. No row means every selected
instance holds a scalar there, or none holds the field at all. The predicate is
still unindexed, so it still reads the rows the other filters leave. It
transports at most one of them.

The probe excludes the cursor predicate. So every page of one walk evaluates
the same probe query, over the same filter set.

### A `dataWhere` needs a `processId`

A field id anchors to one process's field catalog. A comparison with no
`processId` compares an opaque id across every process. No index covers `data`,
so that call scans the whole relation.

Requiring the `processId` makes the scan argument below true rather than
conditional. Both recorded consumers name a target process anyway.

### The data read needs no actor

Authorization settles at publish, so runtime resolution needs no actor. A timer,
an outbox delivery, an automatic transition, a migration and a participant's
open form all resolve one list.

`docs/decisions.md` parks the question of whose view an actor-free path uses,
should per-instance visibility land. So the spec states the narrow property
alone: the read does not scope to the caller implicitly. The wider property
stays here, not in a published requirement.

### The data read resolves no labels

`queryInstances` returns no `processLabel` or `stepLabel`, and it opens no
definition store. Its first consumer, the option-list path, re-resolves on
every form render, every submission, every timer fire and every automatic
transition. Label resolution reads the pinned version's process body from
the cached definition store. None of those call sites displays a label, so
each would immediately discard that work. The list read
keeps resolving labels because a caller there renders them.

### The data read returns `redactedAt`

`redactInstance` writes `redactedAt` into the body beside `data: {}`
(`src/engine/retention.ts:38`). The field already sits on the parsed instance,
so returning it costs no lookup.

It exposes that redaction erased a value, and when. It returns none of what
redaction erased. A report cell needs that to tell redaction from a field
nobody filled.

A redacted instance's `data` is `{}`, so it stops matching every comparison. In
the worked option-list case it releases its laptop back into the list.
Redaction requires a non-running instance (`src/engine/retention.ts:27`), so
that case is safe today.

### `admin-app`'s filter enumeration is the binding half

`openspec/specs/admin-app/spec.md:133-135` says the instances screen exposes
"the filters `InstanceListFilter` supports", then enumerates five of them. The
enumeration is what binds. Widening the type adds no control to that screen.

The sentence still reads as an equality with the type. A delta rewords it to
name five of the filters. No frontend behaviour changes here. One stale comment
in `instancesLogic.ts` does, and tasks.md carries it.

## Risks / Trade-offs

- This widens the hottest read → `listInstances` serves the inbox. Refactoring
  its `WHERE` can change a plan, not just a result. The spec keeps every
  existing scenario, so the suite catches a behaviour change. For the plan, run
  `EXPLAIN` on the inbox predicate before and after. A filter-free call must
  produce the plan it produces today.
- The inbox predicate has two halves → the role half is `assignedToRoles`.
  Dropping it breaks `scope=mine`. The extraction carries both halves. A test
  asserts the role match survives.
- Two date ranges over instances → the reporting range bounds `startedAt`, and
  these filters bound `created_at`. The two clocks differ. So one twelve-month
  question can answer differently on the two surfaces. Promoting `startedAt`
  into a column would close the gap.
- An array-valued field raises late → the read learns of an array value from the
  rows its other filters select. A narrow filter set can pass a comparison that
  a wider one rejects. The same comparison also passes until the first selected
  instance writes that field, and then raises. The option-list path re-resolves
  on every automatic transition and every timer fire, so the raise lands there.
  The alternative is a definition-store lookup, which this read exists to
  avoid. The type-level check belongs at the consumer's publish step instead,
  which this change does not add.
- `dataWhere` has no index → A comparison over `data` scans the rows the other
  filters leave. That stays acceptable while its companion filters stay
  selective and indexed. An option list names one `processId` and one
  `currentStepId`. This change indexes both. It stops being acceptable once a
  consumer filters on `data` alone. That is the signal to add the GIN index the
  equality form already targets.
- The probe is work the happy path discards → it runs on every resolution.
  Every successful one throws its answer away. That is the cost the
  label-resolution decision refused, paid back on the same path. It buys a
  raise where a silent empty result would otherwise read as an answer. The
  bounded form caps the transport, not the scan. The type-level check at the
  consumer's publish step retires it.
- The probe's verdict can change between pages → the list read pages by
  keyset, and the probe excludes that cursor. So no page evaluates a narrower
  probe than another. A walk still spans time. An instance writing an array
  under a compared field between two pages turns a passing verdict into a
  raise mid-walk. No HTTP route carries a `dataWhere` today, so no paged consumer
  reaches this. The consumer adding one inherits it.

## Migration Plan

Every step is additive. Both indexes use `CREATE INDEX IF NOT EXISTS`, and each
new filter is optional with today's behaviour as its absent case. This change
adds no column, so `instances` takes no rewrite and no `ACCESS EXCLUSIVE` lock.

Rollback is reverting the commit. The two indexes stay behind on any database
that already ran the new `initSchema`. They are additive, and no code path
depends on their absence.

## Open Questions

- Whether a later change lets a report table sort over `data`. This change
  leaves ordering comparisons out, and states the reason here rather than in a
  requirement. So the tension with the recorded merge-column design stays
  visible without a published rule to repeal.
