## Context

See `proposal.md` for the motivation and `docs/decisions.md`'s "Instance data
tables" entry for the 2026-08-25 design pass this change implements.

Both prerequisites the decisions entry named are already shipped and
archived: `process-read-permission` added `Permission = "publish" | "cancel"
| "migrate" | "read"` with `read` mapped to `ADMIN_ROLE` and checked through
`can(actor, "read", processId, db)` / `requirePermission` (`src/auth/
authorize.ts:78,90,109,115`); `instance-query-core` added `queryInstances`
(`src/runtime/api.ts:1512`) with its own `InstanceQueryFilter` (`processId`,
`version`, `status`, `currentStepId`, `startedBy`, `claimedBy`,
`excludeInstanceId`, `createdAfter`, `createdBefore`, `dataWhere`) and its
own bounding behavior — it returns `{ items, truncated }` rather than a
cursor, since a caller resolving an option list or a report wants the whole
matching set in one call.

`isEligibleCandidate(actor, candidates)` (`src/engine/transition.ts:93`) —
`candidates.includes(actor.id) || actor.roles.some(r =>
candidates.includes(r))` — is the existing id-or-role membership test this
change reuses for `viewers`/`editors`, rather than inventing a second one.
It resolves an id or a role; it has no notion of a group. The one existing
group-aware caller, the `org.group-members` assignment strategy
(`src/engine/assignment-strategies.ts`), never passes a group id through
it either — it expands `groupId` to `getGroupMembers(groupId, db)`
(`src/auth/groups.ts:116`) first, so only resolved member ids ever reach
the check. This change's own group-shaped principals need the same
expansion; see "Group principals expand before the membership check" below.

## Goals / Non-Goals

**Goals:**
- Reuse `queryInstances` for the query half and `can(actor, "read",
  processId, db)` for the process-level gate; add no second query engine and
  no second process-access model.
- Keep report visibility (`viewers`/`editors`) and process `read` access as
  two independent checks that both must pass, matching the proposal's
  "sharing can only narrow, never widen" rule.

**Non-Goals:** see `proposal.md`'s "Explicitly out of scope" list — no
expression language, no aggregates/charts, no report-granted access, no
as-of values, no download formats, no `body->'data'` indexing.

## Decisions

**Reports are a new table, not a row shape borrowed from `permission_grants`.**
`permission_grants` maps one role string to one permission on one process —
a single grantee per row. A report's `viewers`/`editors` are each a list
mixing ids, roles and groups against one report, matched by
`isEligibleCandidate`'s test (plus the group-expansion step below), not
`hasGrant`'s. Modeling that as a `report_principals` join table (one row per
name per list per report) keeps the membership test a single indexed lookup
rather than an array-contains scan.

That is not, however, this repo's existing convention for "a list of
principal strings on one row" — `groups.members` (`src/engine/store.ts:429`)
is exactly a `text[]` column, and nothing here currently uses a join table
for a per-row principal list. The two access patterns differ: `groups`
reads one group's members whole, while a report needs "which reports name
me," filtered by principal — the opposite direction, which is what favors
an indexed join table here even though `groups.members` did not need one.

**Group principals expand to member ids before the membership check runs.**
`isEligibleCandidate` sees only an actor's own id and roles; a group id
placed straight into its `candidates` array matches nothing, since no
actor's `roles` array ever contains a group id. Every access check against
`viewers`/`editors` (edit/delete, execute) therefore first partitions the
report's stored principal strings by shape: an id or role passes through
unchanged, and a group id (the existing `group_` prefix minted by
`src/auth/groups.ts:51` — no new column needed to tell the three apart)
resolves through `getGroupMembers(groupId, db)` into its current member
ids. The resulting expanded list, not the raw stored one, is what
`isEligibleCandidate(actor, expanded)` checks. This makes group membership
live, the same property `org.group-members` assignment already has: adding
someone to a group grants them a shared report immediately, with no report
edit. It costs one `groups` read per group principal per check, bounded by
how many groups one report is shared with.

**`listMyReports` needs the reverse group lookup, not the one above.** The
expansion just described starts from one report's own stored principals and
asks "does this actor belong to any of these groups" — the right direction
for a point-check (edit, delete, execute) where the report is already known.
Listing "my reports" starts from the actor instead and has to ask "which
reports name a group I belong to," a question `getGroupMembers(groupId,
db)` cannot answer: it takes a group id and returns members, never the
reverse, and nothing else in `src/auth/groups.ts` resolves "groups
containing member X" either. `Actor` (`src/cel/eval.ts:21`) carries only
`{ id, roles }`, no group list, so the listing code cannot skip this by
reading it off the actor. Without it, a report shared only through a group
would be invisible to `listMyReports` even though executing it directly (by
id) would correctly succeed for that same actor — "group membership grants
access the same as an id" would hold for execution and silently not hold
for discovery.

The fix is a new function beside `getGroupMembers`,
`getGroupsForMember(actorId, db)`: `SELECT group_id FROM groups WHERE
${actorId} = ANY(members)`. `listMyReports` calls it once per request and
expands its own match set to `[actor.id, ...actor.roles, ...groupIds]`
before querying `report_principals(principal, list)` — the same
three-shape match `isEligibleCandidate` makes per-report, just run in the
opposite direction, once, up front. The `groups` table is small and
operator-managed (created through the `system:admin`-gated
`/admin/groups*` routes), so a plain scan filtered by `= ANY(members)`
needs no new index to start.

**Column resolution walks published versions with in-range instances, not
every version ever published.** A process can accumulate many published
versions over its life; only the ones with an instance in the report's own
date range are relevant to "what field could a matching instance carry."
The read: (1) run the report's own `queryInstances`-shaped filter to learn
which `(processId, version)` pairs actually matched (a cheap `DISTINCT
version` alongside the existing query, not a second full scan), then (2)
resolve each of those versions' bodies through the existing definition
store (the same `createDefinitionStore` mechanism `reporting.ts`'s own
traversal-building already relies on) and union their field catalogs,
tagging each field with the version set that declares it. Each execution
builds its own fresh store (`createDefinitionStore(db)` mints a new,
call-scoped `Map`, not the persistent per-`db`-handle one `listInstances`
reaches via `getStore`'s module-level `WeakMap` in `api.ts`), so the saving
is per-execution — no version gets resolved twice within one report's own
row set — not a cache shared across requests. The union is built from
`leafFields` (`src/schema/
definition.ts:361`), not the raw field tree: a `type: "group"` container
carries no value of its own — `leafFields`'s own doc comment says as much,
"every group container drops out, since CEL's `data` namespace has no
entry for one" — so offering one as a column choice would only ever render
empty.

**Reusing `buildInstanceWhere`/`buildDataWhere` needs an export, not a
requirement change.** The distinct-in-range-version query above has to
apply the exact same predicate `queryInstances` applies to its own row
fetch — process, status, date range, `dataWhere` — or the two could
silently disagree about which instances match. `queryInstances` builds
that predicate from two functions private to `src/runtime/api.ts`,
`buildInstanceWhere` (`api.ts:1304`) and `buildDataWhere` (`api.ts:1362`),
neither exported today. Re-implementing the predicate inside the new report
code instead of reusing these would be exactly the "second query engine"
this change's own goal rules out, and would drift the moment either
function's logic changes for an unrelated reason. The fix is mechanical:
export both from `src/runtime/api.ts`. Nothing about `instance-data-query`'s
or `instance-query`'s observable behavior changes — no requirement in
either spec moves — so this stays an implementation-level export, not a
capability modification, matching the proposal's "no requirement change to
either" claim precisely (the claim is about requirements, not about what a
sibling module may import).

**The three empty-cell reasons are computed, not stored.** No-value,
not-in-this-version, and redacted are all derivable at read time from data
`queryInstances` (or a small extension of it) already returns per instance:
whether the pinned version's catalog declares the field id at all (from the
version resolution above), whether `data[fieldId]` is present, and whether
`instance.redactedAt` is set. That last check is instance-level, not
field-level, and takes priority over the other two: `redactInstance`
(`src/engine/retention.ts:49`) unconditionally clears the WHOLE `data`
object once an instance is redacted, for every field, not only the ones a
process author marked `redactable`. `redactable-field-flag/design.md`'s own
Non-Goals say so directly — "No change to the existing
`instances.body.data` wipe... unconditional today and stay unconditional;
`redactable` scopes only the audit-log entries." So `field.redactable`
plays no part in a cell's state: once `instance.redactedAt` is set, every
direct-field cell on that instance reads "redacted," never "no value," even
for a field the author never marked `redactable`, because that field's
current value was wiped by the same unconditional clear. `redactable` only
narrows which fields' *prior audit-log entries* `redact_instance_fields`
scrubs — a fact about history, not about this read. Storing a separate "why
is this blank" value per cell per row would need write-time bookkeeping
this feature has no other reason to add.

**Merge columns compute over the same per-instance row, no field-level
persistence.** A merge column's value, collision flag and text-sort key are
computed at execution time from its ordered source-field list against one
instance's resolved `data`. Nothing about a merge column is stored beyond
its own source-field order in the report definition.

**Truncation is surfaced, not paged around.** `queryInstances` already
chooses bounding over cursor paging for exactly this kind of "a caller wants
the whole matching set" read (see its own doc comment). A report execution
inherits that shape and that trade-off rather than adding pagination to a
feature explicitly out of scope for a first shape ("No aggregates, groupings
or charts in the first shape" — a paginated table cuts against the same
"just a table" goal). A truncated result says so; building an actual export
path is the already-identified "Open, deliberately" follow-up.

**HTTP surface lives under `/reporting`, gated by `REPORTS_ROLE`.** Report
CRUD and execution are new routes beside the three existing reporting
routes, following `reporting-analytics-api`'s existing gating convention
(`REPORTS_ROLE` at the route, `can(actor, "read", processId, db)` as an
additional per-row check inside both the execution handler AND the
unsaved-draft/column-choice preview handler — a preview must show no more
than a saved execution of the identical query would, or the two paths
disagree about what the same actor may see for the same process; see
"Risks/Trade-offs" below — mirroring how `process-read-permission`'s own
proposal already flagged the reporting routes' eventual `REPORTS_ROLE` →
`read` migration as its own separate, later change; this change does not
fold that migration in, since the three existing views still answer a
different question — "may this actor use reporting at all" — from "which
process's data may they see," and conflating the two here would silently
expand this change's scope). `queryInstances` itself performs no
authorization check of its own — it is pure data access — so this per-row
check has to be added explicitly at every call site that reaches it, the
preview handler included.

## Risks / Trade-offs

- [A viewer shared into a report but denied process `read` sees an
  unexplained empty table, not a reason] → Mitigated in the UI layer only:
  the builder's share dialog shows the hint at share time (spec
  requirement), so the gap is visible to the sharer even though the viewer's
  own screen shows only "no rows."
- [Resolving every in-range version's field catalog on each execution adds a
  cache round trip per distinct version] → Bounded by the same
  `createDefinitionStore` mechanism `reporting.ts`'s own traversal-building
  already relies on. Each execution builds its own fresh, call-scoped
  cache rather than sharing `listInstances`'s persistent one, so the saving
  is per-execution, not cross-request; a report's version set is typically
  small regardless (a process rarely publishes many versions inside one
  report's date range), which is what actually bounds the cost.
- [`listMyReports` cannot see a report shared only through a group, since
  no reverse "groups containing this member" lookup exists] → Closed by
  adding `getGroupsForMember` beside `getGroupMembers` (see "`listMyReports`
  needs the reverse group lookup" above), not left as a residual risk.
- [An unsaved-draft preview could show a process's real field values to an
  actor holding `REPORTS_ROLE` but no process-level `read` permission,
  since `queryInstances` performs no authorization check of its own] →
  Closed by gating the draft/column-choice preview handler with the same
  `can(actor, "read", processId, db)` check the execution handler uses (see
  the HTTP-surface decision above and the spec's own "Previewing an unsaved
  draft requires the same process read permission" requirement), not left
  as a residual risk.
- [A report naming a process that is later deleted, or a field id no
  version declares any more, is not addressed here] → Out of scope for this
  change; a dangling report simply resolves an empty column union for that
  field, the same "resolves to nothing" treatment the aggregated-data-source
  entry in `docs/decisions.md` applies to a cancelled source instance.

## Migration Plan

Additive: one new table for reports (with its principal join table), new
`/reporting` routes, and a new frontend screen. No existing route, table
column, or stored process definition changes shape. Nothing to backfill —
no report exists before this change ships one.

## Open Questions

- Whether the version-coverage tag on a column choice (design decision
  above) is exposed to the report execution's response or only to the
  builder's column-picker read. Both need it; whether it's one payload
  shape or two is an implementation choice that does not change the specs
  or the task breakdown.
