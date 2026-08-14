## Context

See proposal.md for motivation.

`referencingProcesses` in `src/http/admin-routes.ts` answers the usage
question today. It scans `definitions` for a published row whose
`body->'dataSources'` holds a `"db.list"` entry naming the list. Two callers
share it: the detail route's report, and the delete guard. Its own comment
states why they share it. The two cannot then disagree about what a reference
is.

A mapping sits one level further in. `FieldDef.columnMapping` is a
`Record<columnKey, FieldId>` on a field, and the field names its source by
`dataSource` id. So the column question needs the body's fields, its data
sources, and the join between them. Fields nest inside group fields.

## Goals / Non-Goals

**Goals:**

- One definition of "references this list", shared by the report and the
  guard, as today.
- The mapped column keys reach the operator at the destructive act, not only
  in a section further down the page.

**Non-Goals:**

- No index for the scan. Both callers are admin routes off every instance
  path, which is the risk note stage 29 already wrote.
- The scan skips every draft. The report is published-only, matching the
  guard.
- No change to what the guard refuses. A reference blocks a delete, mapped or
  not.

## Decisions

**The one function keeps both callers.** `referencingProcesses` selects `body`
alongside `process_id` and `version`, derives the mapped keys, and returns
them. The delete guard reads `.length` and ignores the keys.

The alternative was a second function for the detail route alone. It would
have carried a second copy of the `EXISTS` clause that decides what a
reference is. That is the disagreement the shared function exists to prevent.

The cost is that a delete try now reads bodies it does not use. A list carries
few referencing processes by nature. The route already scans the whole table.

**The walk uses `collectFieldsDeep`.** `src/schema/definition.ts` exports it
as the one authoritative field set. Its own comment says every caller resolves
"every field in the body" through it. A local recursion in the HTTP layer
would be a second answer to a question the contract already answers.

`walkFieldsIndexed` in `compile.ts` is not exported and stays that way. It
builds an index path for a defect's location, which no report reads.

**The route reads the body shape-first, not through Zod.** A published body
parsed on write. A `processBody.parse` here would cost a full validation per
row. It could also throw on a body an older schema wrote. `readList` already
takes the softer path for the same reason. It falls back rather than failing
the whole screen.

`body` is jsonb, so the driver returns it parsed or as text. Which one depends
on how the writer wrote the row. The read normalizes through `parseJsonb`, the
rule stage 29 established for every jsonb read here.

A body whose `fields` is no array reports an empty key set. `parseJsonb`
answers null on text it cannot parse. And `collectFieldsDeep` iterates its
argument, so an unguarded read throws. That takes the whole screen down. The
process still appears in the report. The `EXISTS` clause already matched its
row.

**The keys sort.** `columnMapping` sits inside the jsonb `body`, and Postgres
normalizes a jsonb object's key order. So `Object.keys` hands back the
storage's order, not the author's. Stage 29 hit that defect and fixed it. It walks the declaration
rather than the stored object.

The declaration is not available here. `referencingProcesses` serves the
delete guard too, and that caller holds no column list. An alphabetical sort
costs one line and depends on nothing. The spec asks for a stable order the
storage does not decide, which is what it gives.

**The join runs per row.** For one body: collect the ids of its `"db.list"`
data sources naming this list. Then keep a field whose `dataSource` is one of
them. The mapped keys are that field's `columnMapping` keys. A `Set` holds the
result, so two fields mapping one column report it once.

**The warning names processes, not mappings.** `droppedColumns` in
`packages/web/src/areas/admin/screens/dataListsLogic.ts` already computes what
a save drops. A sibling pure function takes those keys and the usage report,
and returns the distinct process ids. A process mapping two dropped columns
appears once. The operator's question is which processes break, not how many
times.

**An undeclared key still reports.** `checkColumnMapping` runs seven rules and
none of them checks a key against the list's declaration. A key naming no
declared column publishes, and writes nothing at runtime.

So a body can map a column an operator dropped last week. That is the state
this report exists to find. Excluding it would print "no process maps
anything" over a broken mapping. Every mapped key reports, declared or not.

**The screen gains no new component.** The keys ride the
`.admin-timeline-meta` span the version already uses. The warning stays the
`window.confirm` the removal already shows. No visual direction is open here,
so the design skills have nothing to decide.

**Two catalog keys, two whole sentences.** The existing
`dataList.dropColumnConfirm` stays as it is. A second key carries the
process sentence, and the confirm text is the two joined. The design language
forbids assembling one sentence from fragments, so neither key holds half a
sentence. A removal that no process maps shows the first sentence alone,
exactly as today.

## Risks / Trade-offs

- A delete try reads every referencing body -> the referencing set is small by
  nature, and the same route already full-scans `definitions`.
- A body written before the column declaration existed carries no
  `columnMapping` -> it reports an empty set. The spec names that case rather
  than leaving it to the reader.
- A dangling `dataSource` id cannot reach the join. `definition.ts` refuses an
  id that resolves to no source. The join needs no fallback.
- The report says nothing about a draft that maps a column. A draft carries no
  published behaviour, and the guard ignores drafts too. An operator who drops
  such a column sees that draft's own check fail at publish.

## Migration Plan

No data moves and no table changes. The route's response gains one key per
usage entry, and an older browser bundle ignores an unread key.

Rollback is a code revert. The screen then shows what it shows today, and the
route drops the added key. No stored state carries the change, so nothing
needs undoing.

## Open Questions

- Does the report want the mapped target field beside the column key? The
  column key alone answers "which processes break". The target names where the
  value lands, which is a second question. The answer changes no requirement
  here, because the route already returns the whole mapping when it walks it.
  It is worth deciding after an operator has read the section once.
