<!-- antislop: allow-file passive-voice -->
<!-- The SQL fragments and EXPLAIN excerpts below name planner nodes and index
     access paths in Postgres's own wording, which is passive by convention
     ("rows are returned", "the index is scanned"). -->

## Context

See `proposal.md` for motivation. The constraints that shape the approach:

`buildInstanceWhere` (`src/runtime/api.ts:1488`) carries no actor predicate. Its
callers narrow one layer up, in `handleListInstances`
(`src/http/routes.ts:441`), by deriving `assignedTo` or `startedBy` from the
credential. `parseScope` (`src/http/routes.ts:427`) resolves an omitted `scope`
to `"all"`.

Every step entry funnels through `applyStepEntry`
(`src/engine/transition.ts:369`), migration included
(`src/engine/migration.ts:532`). It already takes a transaction handle and
writes four relations in it. Migration passes `assignment: { carry: true }`
(`src/engine/migration.ts:520`), so it commits the assignment the instance
already held.

`listMyReports` (`src/runtime/api.ts:1942`) is the closest working precedent. It
builds `[actor.id, ...actor.roles, ...groupIds]` from `getGroupsForMember`
(`src/auth/groups.ts:132`) and joins a principal side table.

The instance list pages by keyset on `(created_at DESC, instance_id DESC)`,
with the cursor encoded from `created_at::text` at full precision.

Every measurement quoted below was run against Postgres 16 in the devcontainer,
over 200 000 instances and 601 000 principal rows.

## Goals / Non-Goals

**Goals:**

- One write point per event kind, so no execution path can miss an append.
- A read that holds its cost across the full range of reader breadth.
- A backfill that leaves no pre-existing instance invisible.
- No behaviour change for any caller that does not pass `scope=visible`.

**Non-Goals:**

- Bulk revocation. One administrator action targets one actor on one instance.
  Revoking a whole date range is a separate mechanism, sketched below and not
  built.
- Revoking a role or a group from an instance. A revocation names a person.
- A UI. No screen calls the new scope or the three admin routes in this
  change.
- Any authorization decision beyond the list. `getInstanceView` still answers
  from `loadInstanceForActor` alone.

## Decisions

### A side relation, not a column on `instances`

A `text[]` column on `instances` would avoid a join. It loses on three counts.
A GIN index over the array cannot also carry the keyset order, so every page
would sort. An append would rewrite the instance row, which contends with the
optimistic concurrency check on `transition_seq`. And the row is what
`redactInstance` clears. A principal list living there would tangle with the
redaction rules rather than sit beside them.

The side relation follows `report_principals`, which already solves the same
shape for reports.

### `created_at` is denormalized onto the principal row

The read filters on `principal` and pages by the instance's `created_at`. Those
live in two relations, and no index spans two relations. Copying `created_at`
onto the principal row buys the composite index
`(principal, created_at DESC, instance_id DESC)`, which serves the filter and
the order at once.

The copy is safe because `instances.created_at` never changes after insert. It
is set by a column default and no code path updates it.

Alternative rejected: join first, sort after. Measured at 13.8 ms and 25 618
buffers for a reader reaching 1 000 of 200 000 instances, growing as the
reader's share shrinks.

### The read is a `UNION ALL` per principal, merged

This is the decision the measurements drove, and the one most likely to be
undone by a later "simplification".

The obvious form is one lookup over the reader's whole principal list:

```sql
SELECT DISTINCT instance_id, created_at FROM instance_principals
WHERE principal = ANY($1)
ORDER BY created_at DESC, instance_id DESC LIMIT $2;
```

It reads correctly and it is slow in the one case that matters. Say the
reader's list holds a principal most instances carry. Postgres then cannot walk
the composite index in order, because the `= ANY` binds many values. Measured:
a parallel sequential scan over 601 000 rows, plus an external merge sort
spilling 2 640 kB to disk, 31.7 ms.

The second tempting form states the whole rule as one predicate over
`instances`: a principal `EXISTS`, minus a denial, `OR` the live assignment.
It composes with every filter and it is the slowest of the three. The
alternation cannot use either side's index. Measured 59 ms for a broad reader,
61 ms for a narrow one, with 199 996 instances walked to fill one page.

The form that holds is one ordered, bounded branch per principal, plus one for
the live assignment, combined by `Merge Append`:

```sql
SELECT DISTINCT ON (created_at, instance_id) instance_id, created_at FROM (
  (SELECT p.instance_id, p.created_at
     FROM instance_principals p JOIN instances i USING (instance_id)
    WHERE p.principal = $1 AND <every filter the request carries>
      AND NOT EXISTS (SELECT 1 FROM instance_principals_denied d
                      WHERE d.instance_id = p.instance_id AND d.actor_id = $actor)
    ORDER BY p.created_at DESC, p.instance_id DESC LIMIT $n)
  UNION ALL
  ... one such branch per principal ...
  UNION ALL
  (SELECT i.instance_id, i.created_at FROM instances i
    WHERE <every filter> AND <the scope=mine predicate>
    ORDER BY i.created_at DESC, i.instance_id DESC LIMIT $n)
) u ORDER BY created_at DESC, instance_id DESC LIMIT $n;
```

Measured 1.85 ms for a broad reader and 1.51 ms for a narrow one. A deep
cursor costs 0.21 ms. Each returned a full page of 21.

### Every branch carries the filters, and nothing filters after a branch bound

This rule is load-bearing and easy to lose. An earlier draft of this design put
the filters outside the union, which is how anyone would write it first.

A branch bounded at `$n` whose rows are then filtered returns fewer than `$n`.
Measured: a 21-row branch, filtered afterwards by the test-instance exclusion
alone, returns 19. `keysetPage` (`src/runtime/api.ts:385`) derives `hasMore`
from `rows.length > limit`, so 19 of 21 produces no cursor and the walk ends
while visible instances remain.

`buildInstanceWhere` always contributes at least that test-instance exclusion,
so there is no request for which the outside-the-union shape is safe.

Joining `instances` inside each branch costs a primary-key probe per branch
row. That is the whole difference between 0.08 ms and 1.85 ms, and it buys a
page that is correct.

The branch list is variable, one per principal the reader holds, plus the
assignment branch. It folds the way `buildDataWhere`
(`src/runtime/api.ts:1555`) already folds a variable comparison list.

Each branch carries the same bound as the page. That is sound, on two counts.
A page of `n` cannot draw more than `n` rows from any single branch. And
`DISTINCT ON` collapses an instance two branches both reach.

### The write is one statement in `applyStepEntry`

An `INSERT ... ON CONFLICT DO NOTHING` beside the `history_entries` insert. The
plan already carries the entered step's resolved assignment, so the applier
needs no extra read.

`createInstance` (`src/engine/store.ts:1041`) adds the starter.
`updateAssignment` (`src/engine/transition.ts:1002`) adds the claimant on claim
and delegation. The subprocess spawn copies the parent's rows with an
`INSERT ... SELECT`.

Alternative rejected: derive the set on read from `history_entries`. It needs a
scan per instance. It also cannot see a candidate who never acted, and that is
most of the point.

### A revocation names the person, not the principal they matched by

This is the decision the owner's rejection forced, and the obvious
implementation does not work.

Anna sees a request because the instance carries `group_hr` and Anna is in HR.
There is no Anna row to delete. Deleting the `group_hr` row revokes the instance
for all of HR. Measured on the fixture: 200 000 instances carry `group_hr`, and
Anna matches every one of them through it.

So a revocation is its own relation, `(actor_id, instance_id)`, subtracted at
read time. It removes the person regardless of which principal admitted them,
and it leaves every other holder of that principal alone. Verified: 3 030
denials against 200 000 group matches leave 196 970 visible.

Restoring is deleting the denial row. Nothing else has to unwind.

### The denial is subtracted inside each branch, not after the page

Two placements exist and only one is correct.

After the page is cut, the denial is an outer filter. It can hand back a page
shorter than the limit, because rows leave after the count is fixed. Measured
at 0.370 ms, with a sequential scan of the denial relation.

Both placements returned a full page on the fixture. The short page is a
property of the shape, not something the measurement reproduced at 1.5% denial
density.

Pushed inside each `UNION ALL` branch, the denial is a `NOT EXISTS` against the
denial relation's own primary key. The branch still returns its full limit, so
no denial shortens a page. Measured at 0.083 ms, index-only on both sides.

That is a statement about this predicate alone. A `scope=visible` page can
still come back short for a reason the `instance-query` capability already
names. An unresolvable summary drops out, and the read pulls no extra row to
replace it.

The second placement is both correct and four times faster, so there is no
trade to make.

### A live assignment overrides a revocation at read time, and clears nothing

Three shapes were measured. Two of them cost the same, so the choice is
semantic rather than mechanical.

Clearing the denial on the commit path is affordable, contrary to the first
estimate. A probe on the entered instance costs 0.009 ms per step entry
holding no denial. That is nearly every step entry, and the probe is
index-only.

The objection to it is not cost. Any assignment then erases an administrative
revocation permanently. Migration runs through the same path, so a bulk
relocation can undo an operator's decisions with nothing recorded.

Leaving the denial alone costs the same and writes nothing. It adds the
live-assignment set as a third `UNION ALL` branch. Measured 0.082 ms for an
actor assigned across the population. Measured 0.067 ms for an actor assigned
to five instances of 200 000.

The sparse case does not degrade. Postgres reaches it by a BitmapOr over
`instances_claimed_by_idx` and the candidates GIN, rather than walking
`instances_created_idx` and filtering.

That third branch is the predicate `scope: "mine"` already runs, so it needs no
new index and no new shape.

Clearing only the cases available without a group lookup was the third shape,
and it is rejected. In the fixture 432 of 3 000 revocations name an actor
currently assigned through a group. Those stay invisible while being live work,
and the gap turns into a refusal once `loadInstanceForActor` consults the set in
Change 2.

The chosen shape makes a revocation conditional rather than absolute. A revoked
actor sees the instance while assigned it and loses it again afterwards. That is
the intended reading: an administrator revoked deliberately, and a routing
decision should not overwrite that.

### `visibility` is a fifth Permission, not a role check

`requireRole(actor, ADMIN_ROLE)` would gate the three admin routes in one line.
It would also have to be rewritten the day someone wants a per-process
administrator.

`src/auth/authorize.ts` already carries the mechanism. It has a `Permission`
union, a `PERMISSION_ROLE` map to a global role, and `hasGrant`. The last one
answers whether a role holds that permission over one process. Adding `"visibility"` mapped to `ADMIN_ROLE` gives
today's answer, and a `permission_grants` row gives the per-process
administrator later with no code change.

This is the shape the 2026-08-16 rejection of `system:publish@proc_...`
preserved, and it is not a reopening of it. The role string stays a plain
principal name. The scope lives in the grant row, never inside the role.

`permission_grants.permission` is a text column, so the fifth value needs no
schema change. Only `grantSchema`'s enum and `PERMISSION_ROLE` grow.

### `scope=visible` is a fourth scope, not a new route

It reuses `handleListInstances`, its paging, its summary shape and its
test-instance exclusion. A separate route would duplicate all four.

`parseScope`'s existing contract holds: an omitted `scope` still means `"all"`.
Nothing changes for a caller that does not name the new value.

### The backfill is a script, not an `initSchema` step

`initSchema` runs on every server start and every CLI invocation. A backfill
over every instance and every history entry does not belong there.

It ships as a script under `scripts/`, idempotent through the same
`ON CONFLICT DO NOTHING`, safe to re-run. The deployment runbook gains a step.

## Risks / Trade-offs

**A migration widens nothing, and an administrator grants by hand.**

A migration carries the instance's existing assignment rather than resolving
the target step's (`migration.ts:520`, `assignment: { carry: true }`).
Relocating instances onto a step whose candidates are somebody else therefore
leaves those people unable to list them.

Accepted. Resolving fresh at migration time is a decision of its own, taken
against, and this change does not reopen it. Grant is the escape hatch. It
works per person per instance, so opening a large relocation to a new team is
laborious.

Principals only ever accumulate. No workflow event removes one. The reverse
risk therefore does not arise. A migration cannot cost anybody the sight of an
instance they took part in.

**A revocation over a long contiguous run is slow to read past.**

The read walks the ordering index and skips denied rows. A long run of denials
at the front of that order forces the branch through all of them. It has to, to
fill one page. Measured: one actor denied on the 100 000 newest instances, first page,
100 021 index rows scanned for 21 survivors, **257 ms**.

Per-instance revocation by hand does not produce runs that long. This is not a
risk for the shipped feature. It is a hard limit on any future bulk revocation.

The same revocation expressed as a date cutoff costs 0.056 ms. It becomes an
index range condition rather than rows to skip. Produce that shape
if bulk revocation is ever asked for. Do not extend the row form to cover it.

**A subprocess child sees a stale parent set.**

The spawn copies a snapshot. A principal the parent gains afterwards never
reaches the child.

Accepted and specified. A live parent link needs a recursive predicate, which
forfeits the flat index walk the read depends on.

**Redaction silently removes an instance from a participant's list.**

The participant did nothing to lose it.

The `data-retention` delta states it, and the runbook should mention it. No
mitigation in code. The alternative leaves personal data behind.

**The read regresses to the slow form under later edits.**

A reader who sees `= ANY` in `buildDataWhere` may reasonably reach for it here.

The spec states the requirement in behavioural terms. The task list adds a test
asserting no external sort for a reader holding a widely held role.

**The relation grows with instances times steps.**

At 200 000 instances and three principals each, 600 000 rows.

Measured at that size and fast. Growth is linear and the index is small.
Revisit on a measured problem, not before.

**The scheduled retention sweep removes visibility in bulk.**

`redactInstance` has two callers. One is the admin route. The other is the
`DATA_RETENTION_DAYS` sweep (`src/engine/retention.ts:105`), which runs
unattended.

Every instance that sweep redacts leaves every participant's list at once, with
no notice to anyone. The manual case is one operator acting on one instance.
This one is a schedule acting on a population.

Accepted, and the same reasoning applies: a redacted instance holds nothing a
participant could want. The deployment runbook should say it, so an operator
enabling the sweep knows lists will shrink.

**A reader in many groups costs more than a group with many members.**

Each group the reader belongs to adds one `UNION ALL` branch.

A reader in dozens of groups adds dozens of index-only scans, each bounded by
the page limit. Cheap, but not free. Bound the branch count if a real directory
produces one.

## Migration Plan

1. `initSchema` creates both relations and the index. Idempotent, so an
   existing database picks them up on the next start.
2. Deploy the engine. From this point every new event appends principals. The
   new scope answers, and answers incompletely for pre-existing instances.
3. Run the backfill script. It is idempotent and re-runnable.
4. No step depends on a quiet system. The backfill's `ON CONFLICT DO NOTHING`
   makes it safe to run while the engine writes.

Rollback: stop calling `scope=visible`. The relations and their writes are
inert for every other caller, so a rollback needs no schema change. Dropping
them is possible but unnecessary.

## Open Questions

- Does bulk revocation ever get asked for? The row form has a measured ceiling
  (see Risks). A date cutoff answers the same ask in 0.056 ms. Neither is built,
  and building the wrong one first is the only real cost here.
- Where does the participant screen land? This change ships the read and no UI.
  The app area's "cases I took part in" list needs its own `end-user-app` delta.
  Whether it is a third tab or a filter on My-tasks is a design question, not an
  engine one.
- How should the admin record render `visibility.changed`?
  `describeRecordElement` (`packages/web/src/api/record.ts:9`) falls through to
  the kind name plus a raw JSON payload. That is safe and it reads poorly. A
  label belongs in whichever change first touches that screen.

Neither of the first two blocks this change. The third is cosmetic.
