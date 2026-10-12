# Design

## Context

See `proposal.md` for the four findings. `runReportQuery` calls
`queryInstances(filter, {}, db)` today, so the default 50 applies. The clamp
`Math.min(limit, MAX_LIST_LIMIT)` caps any larger request at 200
(`src/runtime/queries.ts`). `queryInstances` also feeds data-source option
lists. Its 200 stays the default. The reporting views call `scan`. It
reads every in-range instance and its history. `cycleTime` and `sla` then read
the history of the same instances again.

## Goals / Non-Goals

**Goals:**
- A formula cannot run from a report's CSV.
- A report and its CSV return up to 1000 rows and say when they hold more.
- No editor leaves a report without its owner.
- One view request reads the history once and refuses a range it cannot hold.

**Non-Goals:**
- A cursor, a streamed CSV or a row limit above 1000. They need their own change.
- A span limit on the range, or a partial aggregate.
- A new screen state. The table already shows its truncation note. The screens
  already show a request-shape note, and decision 7 changes only its wording.

## Decisions

**1. The prefix applies to `value` cells that hold text or a list.**
`csvCellText` skips a number and a boolean by `typeof`. It tests the first
character of the exported text against `=`, `+`, `-`, `@`, tab and CR.
A number keeps its sign, so a numeric column stays numeric in the spreadsheet. A merge cell always holds a
joined string. A merged `-5` exports as `'-5`. The design accepts that edge.

The three marker texts start with `(`. The header starts with a field id. Neither
needs a check. The prefix goes on before `csvField` quotes the text.

Alternative: prefix every cell. That breaks numeric columns.

**2. `queryInstances` takes `maxLimit` in its `page` argument.**
The type becomes `page: { limit?: number; maxLimit?: number }`. The clamp
becomes `Math.min(limit, page.maxLimit ?? MAX_LIST_LIMIT)`.
`REPORT_ROW_LIMIT = 1000` is a constant in `src/runtime/reports.ts`.
`runReportQuery` passes it as both `limit` and `maxLimit`. The visible-row
path takes the same `limit`, so both branches follow. No route builds a `page`
argument, so only the report path can raise the maximum. Alternative: raise
`MAX_LIST_LIMIT` for everyone. That widens the option-list reads too. The spec
change is an ADDED requirement in `instance-data-query`. It qualifies the
default maximum. The long read requirement stays as it is, so the delta does
not copy that block.

**3. The CSV marker is a final line.** `reportResultToCsv` appends one more
line when `result.truncated` holds. Its first column reads
`(truncated: first 1000 rows only)`, and the other columns stay empty. A header
note would rename a column and break a parser that reads the header. The
marker text takes the literal 1000 from `REPORT_ROW_LIMIT`. The text goes
through `csvField`. It starts with `(`, so no prefix applies.

**4. `updateReport` checks two rules.** They run after the membership gate.
First, a new owner, when the patch sets one, must be in `current.editors`.
Second, when `actor.id !== current.owner`, `nextEditors` must contain
`current.owner`. Both throw `ReportOwnerInvariantError`, which maps to 409
today. The existing check that `nextEditors` holds `nextOwner` stays. An editor
can still take ownership while the former owner stays an editor. That matches
the owner's ruling.

**5. `scan` returns its history.** `Scan` gains `history`, the map
`historyByInstance` returns. `cycleTime` reads the entries of the completed
instances from that map and drops its second query. `sla` reads the same map
and drops its re-walk query. The `timer.fired` query in `sla` reads a different
table and stays.

**6. `selectInRange` refuses a large range.** It selects with
`LIMIT REPORT_INSTANCE_CAP + 1`, where `REPORT_INSTANCE_CAP = 20000`. It throws
`RequestShapeError` when it receives more than the cap, and the HTTP layer maps
that error to 400. The query reads `body`, so the limit bounds memory as well as
the row count. The `LIMIT` clause costs one extra row. Alternative: a
`count(*)` first. That scans the range twice.

**7. The request-shape note names the cause.** The screens never show
`error.message`, so the 400 of decision 6 reads "That request was malformed."
in `packages/web/src/i18n/catalogs/reporting.ts` (`error.requestShape`). The
string gains a second sentence in English and German: narrow the date range.
The note keeps its error type and its place. A client-side range check already
blocks a malformed date, so this note shows for a cap refusal in practice.
Alternative: a new error type for the cap. That adds a union member, a switch
arm and a client type for one sentence.

## Risks / Trade-offs

- A range at 20000 instances still loads 20000 bodies and their history. The
  cap bounds the cost. The in-memory model stays an open question in
  `docs/decisions.md`.
- A process with more than 20000 instances in one range now fails where it
  succeeded before. The note tells the reader to narrow the range.
- A report capped at 1000 rows renders 1000 table rows in the browser. One
  browser check covers a report with more than 1000 rows.
- Prefixing a string such as a phone number shows an apostrophe in some tools.
  The owner ruled on that trade on 2026-10-12.

## Migration Plan

No stored data changes. The change deploys with the engine. A rollback restores
the old behavior.

## Open Questions

None.
