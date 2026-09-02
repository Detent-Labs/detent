## Context

`executeReport` runs two gates and then `runReportQuery`. That helper calls
`queryInstances`, which compiles one `WHERE` over `instances` and bounds it.
No part of it consults `instance_principals`.

`listInstances` already narrows per row. A filter carrying `visibleTo` joins
against `buildVisibleRowSet`. That fragment builds one ordered, bounded branch
per principal, plus one for the live assignment, and Postgres merges them.
That shape measured 1.85 ms for a broad reader under `instance-visibility-set`.
A `principal = ANY` form measured 31.7 ms.
One alternating predicate over `instances` measured 59 ms.

`queryInstances` has a second caller, the `instance.query` data source
(`src/engine/instance-query-source.ts`). It runs inside the engine while an
option list resolves. There is no actor there.

## Goals / Non-Goals

**Goals:**

- The report, the visible list and the direct read agree on every instance.
- One row-set builder serves all three.
- The bound applies after the narrowing.
- The data source keeps today's behaviour with no opt-out flag to remember.

**Non-Goals:**

- The three aggregate views. They stay unfiltered permanently.
- Column choices and version coverage. `resolveVersionCoverage` selects
  versions, not instances, and hands out no id and no value. It stays
  unnarrowed.
- Report membership. This change leaves the owner, editor and viewer lists
  alone.
- A per-column rule. Redaction already covers the cell-level case.
- A count of withheld rows. The empty-table precedent says nothing about what
  a viewer cannot see.

## Decisions

### The filter is opt-in on `queryInstances`, and the report opts in

`InstanceQueryFilter` gains the same optional `visibleTo` that
`InstanceListFilter` carries: `{ actorId, principals }`. `queryInstances`
joins against `buildVisibleRowSet` when it is present, and runs today's plain
`WHERE` when it is absent.

`runReportQuery` takes the actor and sets it, unless the actor holds
`ADMIN_ROLE`. The data source sets nothing and so changes not at all.

An opt-out default is the alternative, and this change rejects it. The data
source would then carry a flag saying "not for me". A future third caller
would inherit narrowing nobody chose for it. Opt-in makes the report state
its own intent.

### The rejected-filter list loses `visibleTo`

`instance-visibility-set`'s implementation put `visibleTo` on the
`queryInstances` denylist, beyond what the `instance-data-query` spec asked
for. That spec names four rejected keys. This change removes the fifth entry.

`scope` stays rejected. The HTTP layer derives `scope` from a credential, and
the read refuses to derive. A caller states `visibleTo` outright, the way it
states `claimedBy`. The read still derives nothing.

`runReportQuery` resolves the set itself, with `actorPrincipals(actor, db)`.
That is the call `loadInstanceForActor` already makes for the direct read. The
HTTP layer keeps passing the actor and nothing else. A third inline copy of
the resolver would drift.

### The bound applies after the narrowing, because the join does

`buildVisibleRowSet` takes the bound and applies it inside each branch. The
join then bounds the merged result. So `limit + 1` still decides `truncated`,
over the narrowed set.
An in-memory filter after the query would shrink the page.
It would then report the wrong truncation.
`instance-visibility-set` already guarded the list against that failure.

### `ADMIN_ROLE` skips the join

An operator reads any instance directly and lists every one under
`scope=all`. Narrowing their report would contradict both without buying
anything. It also keeps an operator's report on the plain scan, so the
common administrative read costs nothing new.

`can(actor, "read", …)` maps `read` to `ADMIN_ROLE` plus a per-process grant.
So the audience for the narrowing is the grant holder, not the operator.

### The preview narrows too

`previewReportDraft` runs the same query for an unsaved draft. Say the
builder showed an author more rows than the saved report returns. The author
would then read through the builder what the report withholds. Same
narrowing, same `ADMIN_ROLE` exemption.

### The CSV export inherits it with no code change

`handleExecuteReportCsv` calls `executeReport` and renders its result. The
narrowing lands before the rendering, so the file holds what the table holds.
A test states it anyway, since the two paths could drift later.

## Risks / Trade-offs

- **A report over a viewer's thin slice gets slower.** The narrow-reader case
  measured 1.51 ms on the list. The report's bound is `DEFAULT_LIST_LIMIT`,
  50, since `runReportQuery` passes no limit. Acceptable.
- **A `read`-grant holder's `scope=all&processId` list stays process-wide.**
  `process-read-permission` admits them there with no result-set predicate.
  The report narrows and that list does not. Stage 40's open
  result-set-predicate piece is where the list would follow.
- **A grant holder who took part in nothing gets an empty table.** The grant
  admits them past gate two. The row rule then finds no principal. The
  operator's per-instance grant, or a candidate role, is the remedy.
- **A viewer and an operator see two different tables of one report.** That
  is the point of the change. The empty-table precedent already gives two
  viewers two different tables today.
- **A truncated narrowed table hides how much was withheld.** By design. The
  flag says the bound cut the result. It does not say how many rows the rule
  removed. Stating that would leak the size of what a viewer cannot see.

## Migration Plan

No schema change, no data change. Deploy the code. A report a viewer ran
yesterday may return fewer rows today. That is the owner's decision from
2026-09-01 reaching its third reader.

## Open Questions

Should `scope=all&processId` narrow for a grant holder the same way, so all
four readers agree? That belongs to stage 40, not to this change.

Should a report say "some rows are hidden"? That is a
presentation question. It waits for the day a viewer asks why two people
export different files. Stating it in the engine would leak a count, so any
answer belongs in the reporting area's wording.
