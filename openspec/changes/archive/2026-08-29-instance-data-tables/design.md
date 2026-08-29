## Context

See `proposal.md` for the motivation and `docs/decisions.md`'s "Instance data
tables" entry for the 2026-08-25 design pass this change implements.

Both prerequisites the decisions entry named are already shipped and
archived. `process-read-permission` added `Permission = "publish" | "cancel"
| "migrate" | "read"`, with `read` mapped to `ADMIN_ROLE` and checked
through `can(actor, "read", processId, db)` / `requirePermission`
(`src/auth/authorize.ts:78,90,109,115`). `instance-query-core` added
`queryInstances` (`src/runtime/api.ts:1512`) with its own
`InstanceQueryFilter` (`processId`, `version`, `status`, `currentStepId`,
`startedBy`, `claimedBy`, `excludeInstanceId`, `createdAfter`,
`createdBefore`, `dataWhere`) and its own bounding behavior. It returns
`{ items, truncated }` rather than a cursor. A caller resolving an option
list, or a report, wants the whole matching set in one call.

`isEligibleCandidate(actor, candidates)` (`src/engine/transition.ts:93`)
runs `candidates.includes(actor.id) || actor.roles.some(r =>
candidates.includes(r))`. It is the existing id-or-role membership test
this change reuses for `viewers`/`editors`, rather than inventing a second
one. It resolves an id or a role. It has no notion of a group.

The one existing group-aware caller, the `org.group-members` assignment
strategy (`src/engine/assignment-strategies.ts`), never passes a group id
through it either. It expands `groupId` to `getGroupMembers(groupId, db)`
(`src/auth/groups.ts:116`) first, so only resolved member ids ever reach
the check. This change's own group-shaped principals need the same
expansion. See "Group principals expand before the membership check" below.

## Goals / Non-Goals

**Goals:**
- Reuse `queryInstances` for the query half and `can(actor, "read",
  processId, db)` for the process-level gate. Add no second query engine
  and no second process-access model.
- Keep report visibility (`viewers`/`editors`) and process `read` access as
  two independent checks. Both must pass, matching the proposal's
  "sharing can only narrow, never widen" rule.

**Non-Goals:** see `proposal.md`'s "Explicitly out of scope" list. No
expression language, no aggregates/charts, no report-granted access, no
as-of values, no download formats, no `body->'data'` indexing.

## Decisions

**Reports get a new table, not a `permission_grants` row.**
`permission_grants` maps one role to one permission on one process. That is
a single grantee per row. A report's `viewers`/`editors` are each a list
mixing ids, roles and groups against one report. `isEligibleCandidate`'s
test matches them (plus the group-expansion step below), not `hasGrant`'s
test. Modeling that as a `report_principals` join table keeps the
membership test a single indexed lookup rather than an array-contains scan.
Each row in that table names one principal, for one list, on one report.

That is not this repo's existing convention for "a list of principal
strings on one row," however. `groups.members` (`src/engine/store.ts:429`)
is exactly a `text[]` column. Nothing here currently uses a join table for
a per-row principal list otherwise. The two access patterns differ.

`groups` reads one group's members whole. A report instead needs "which
reports name me," filtered by principal. That is the opposite direction.
It is what favors an indexed join table here, even though `groups.members`
did not need one.

**Group principals expand to member ids before the membership check runs.**
`isEligibleCandidate` sees only an actor's own id and roles. A group id
placed straight into its `candidates` array matches nothing. No actor's
`roles` array ever contains a group id.

Every access check against `viewers`/`editors` (change, delete, execute)
therefore first partitions the report's stored principal strings by shape.
An id or role passes through unchanged. A group id carries the existing
`group_` prefix minted by `src/auth/groups.ts:51` (no new column needed to
tell the three apart). It resolves through `getGroupMembers(groupId, db)`
into its current member ids. The resulting expanded list, not the raw
stored one, is what `isEligibleCandidate(actor, expanded)` checks.

This makes group membership live, the same property `org.group-members`
assignment already has. Adding someone to a group grants them a shared
report immediately, with no report change needed. The check costs one
`groups` read per group principal, bounded by how many groups the report
names as principals.

**`listMyReports` needs the reverse group lookup, not the one above.** The
expansion just described starts from one report's own stored principals.
It asks "does this actor belong to any of these groups." That is the right
direction for a point-check (change, delete, execute) where the report is
already known.

Listing "my reports" starts from the actor instead. It has to ask "which
reports name a group I belong to," a question `getGroupMembers(groupId,
db)` cannot answer. That function takes a group id and returns members,
never the reverse. Nothing else in `src/auth/groups.ts` resolves "groups
containing member X" either. `Actor` (`src/cel/eval.ts:21`) carries only
`{ id, roles }`, no group list. The listing code cannot skip this step by
reading it off the actor.

Without it, a report shared only through a group would be invisible to
`listMyReports`. Executing that same report directly by id would still
correctly succeed for that actor. "Group membership grants access the same
as an id" would hold for execution and silently not hold for discovery.

The fix is a new function beside `getGroupMembers`:
`getGroupsForMember(actorId, db)`. It runs `SELECT group_id FROM groups
WHERE ${actorId} = ANY(members)`. `listMyReports` calls it once per
request. It expands its own match set to `[actor.id, ...actor.roles,
...groupIds]` before querying `report_principals(principal, list)`. That
is the same three-shape match `isEligibleCandidate` makes per-report, just
run in the opposite direction, once, up front.

The `groups` table is small and operator-managed, created through the
`system:admin`-gated `/admin/groups*` routes. A plain scan filtered by
`= ANY(members)` needs no new index to start.

**Column resolution walks only in-range published versions.** A process
can accumulate many published versions over its life. Only the versions
with an instance in the report's own date range matter. Those are the
versions that could carry a candidate field.

The read walks two steps. The first step runs the report's own
`queryInstances`-shaped filter. That filter learns which `(processId,
version)` pairs matched. It adds a cheap `DISTINCT version` alongside the
existing query, not a second full scan. The second step resolves each
matched version's body through the existing definition store. That store
uses the same `createDefinitionStore` mechanism `reporting.ts`'s own
traversal-building already relies on. It unions their field catalogs and
tags each field with the version set that declares it.

Each execution builds its own fresh store. `createDefinitionStore(db)`
mints a new, call-scoped `Map` for it. That `Map` is not the persistent
per-`db`-handle one `listInstances` reaches via `getStore`'s module-level
`WeakMap` in `api.ts`. The saving is per-execution: it resolves no version
twice within one report's own row set. Nothing about the store persists
across requests.

The union comes from `leafFields` (`src/schema/definition.ts:361`), not the
raw field tree. A `type: "group"` container carries no value of its own.
`leafFields`'s own doc comment makes the same point. "Every group container
drops out, since CEL's `data` namespace has no entry for one," it says.
Offering one as a column choice would only ever show an empty cell.

**Reusing `buildInstanceWhere`/`buildDataWhere` needs an export, not a
requirement change.** The distinct-in-range-version query above must reuse
`queryInstances`'s own predicate exactly. That predicate covers process,
status, date range, `dataWhere`. Otherwise the two could silently disagree
about which instances match.

`queryInstances` builds that predicate from two functions private to
`src/runtime/api.ts`, `buildInstanceWhere` (`api.ts:1304`) and
`buildDataWhere` (`api.ts:1362`), neither exported today. Re-implementing
the predicate inside the new report code would skip reuse. That recreates
exactly the "second query engine" this change's own goal rules out. It
would also drift the moment either function's logic changes for an
unrelated reason.

The fix is mechanical: export both from `src/runtime/api.ts`. Neither
`instance-data-query`'s nor `instance-query`'s observable behavior changes,
and no requirement in either spec moves. This stays an implementation-level
export, not a capability change, matching the proposal's "no requirement
change to either" claim precisely. The claim is about requirements, not
about what a sibling module may import.

**The engine computes the three empty-cell reasons at read time. It stores
none of them.** These reasons are no-value, not-in-this-version, and
redacted. All three derive from data already available per instance.
Either `queryInstances` itself, or a small extension of it, already
returns that data.

The engine checks three things. It checks whether the pinned version's
catalog declares the field id at all, using the version resolution above.
It checks whether `data[fieldId]` carries a value. And it checks whether
`instance.redactedAt` carries a value.

That last check is instance-level, not field-level, and it takes priority
over the other two. `redactInstance` (`src/engine/retention.ts:49`)
unconditionally clears the WHOLE `data` object once retention redacts an
instance. It clears every field. This is not limited to the fields a
process author marked `redactable`.

`redactable-field-flag/design.md`'s own Non-Goals say so directly. It
calls the `instances.body.data` wipe "unconditional today and stay
unconditional." It adds that "`redactable` scopes only the audit-log
entries."

So `field.redactable` plays no part in a cell's state. Once retention sets
`instance.redactedAt`, every direct-field cell on that instance reads
"redacted," never "no value." That holds even for a field the author never
marked `redactable`. The same clear already wiped that field's current
value.

`redactable` only narrows which fields' *prior audit-log entries*
`redact_instance_fields` scrubs. That is a fact about history, not about
this read. A separate "why is this blank" value per cell per row would
need its own write-time bookkeeping. This feature has no other reason to
add one.

**Merge columns compute over the same per-instance row.** The engine
persists no field-level value for them. A report execution computes a
merge column's value, collision flag and text-sort key at execution time.
It derives them from the column's ordered source-field list against one
instance's resolved `data`. The report definition stores nothing about a
merge column beyond its own source-field order.

**A report execution shows truncation directly.** It does not page around
it. Bounding wins over cursor paging here, the same choice `queryInstances`
already makes for exactly this kind of read. Its own doc comment says as
much. Bounding fits a caller who wants the whole matching set in one call.
A report execution inherits that shape and that trade-off, so it adds no
pagination.

Pagination sits outside a first shape's scope: "No aggregates, groupings
or charts in the first shape." A paginated table would also cut against
the same "just a table" goal. A truncated result says so directly.
Building an actual export path is the already-identified "Open,
deliberately" follow-up.

**HTTP routes live under `/reporting`, gated by `REPORTS_ROLE`.** Report
CRUD and execution are new routes beside the three existing reporting
routes. They follow `reporting-analytics-api`'s existing gating convention:
`REPORTS_ROLE` at the route.

`can(actor, "read", processId, db)` runs as one more per-row check inside
both the execution handler and the unsaved-draft/column-choice preview
handler. A preview must show no more than a saved execution of the
identical query would. Otherwise the two paths would disagree about what
the same actor may see for the same process. See "Risks/Trade-offs" below.

This mirrors how `process-read-permission`'s own proposal already flagged
the reporting routes' eventual `REPORTS_ROLE`-to-`read` migration. That
proposal named it as its own separate, later change. This change does not
fold that migration in. The three existing views still answer a different
question: "may this actor use reporting at all." That differs from "which
process's data may they see." Conflating the two here would silently
expand this change's scope.

`queryInstances` itself performs no authorization check of its own; it is
pure data access. So every call site that reaches it must add this per-row
check explicitly, the preview handler included.

## Risks / Trade-offs

- [A report viewer denied process `read` sees an unexplained empty table,
  not a reason.] → Mitigated in the UI layer only. The builder's share
  dialog shows the hint at share time, a spec requirement. That makes the
  gap visible to the sharer, even though the viewer's own screen shows only
  "no rows."
- [Resolving every in-range version's catalog per execution adds a cache
  round trip.] → The cost stays bounded. The same `createDefinitionStore`
  mechanism handles it, the one `reporting.ts`'s own traversal-building
  already relies on. Each execution builds its own fresh, call-scoped
  cache, rather than sharing `listInstances`'s persistent one. So the
  saving is per-execution, not cross-request. A report's version set is
  small regardless, since a process rarely publishes many versions inside
  one report's date range.
- [`listMyReports` cannot see a report shared only through a group.] →
  The fix closes this gap directly. It is not left as a residual risk. No
  reverse "groups containing this member" lookup exists otherwise.
  `getGroupsForMember` beside `getGroupMembers` provides it. See
  "`listMyReports` needs the reverse group lookup" above.
- [An unsaved-draft preview could leak real field values past
  `REPORTS_ROLE`.] → The new per-row check closes that gap. It guards both
  the execution handler and the draft/column-choice preview handler:
  `can(actor, "read", processId, db)`. That is why the gap existed:
  `queryInstances` itself performs no authorization check of its own. See
  the HTTP-routes decision above. The spec's own "Previewing an unsaved
  draft requires the same process read permission" requirement covers
  this too.
- [A report might name a later-deleted process, or an undeclared field
  id.] → That is out of scope here. A dangling report resolves an empty
  column union for that field. That is the same "resolves to nothing"
  treatment the aggregated-data-source entry in `docs/decisions.md`
  applies to a cancelled source instance.

## Migration Plan

Additive: one new table for reports (with its principal join table), new
`/reporting` routes, and a new frontend screen. No existing route, table
column, or stored process definition changes shape. Nothing to backfill:
no report exists before this change ships one.

## Open Questions

- Does the version-coverage tag on a column choice (design decision above)
  reach the report execution's response? Or only the builder's
  column-picker read? Both need it. Whether it takes one payload shape or
  two is an implementation choice. It does not change the specs or the
  task breakdown.
