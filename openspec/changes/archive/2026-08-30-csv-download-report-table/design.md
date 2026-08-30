## Context

`executeReport` (`src/runtime/api.ts:2002`) already computes a
`ReportExecutionResult`. It already applies the two gates this change
reuses: report membership, then the target process's `read` permission.
`handleExecuteReport` (`src/http/reporting-routes.ts:237`) wraps it as
`GET /reporting/reports/:reportId/table`, returning JSON.

There is already a binary-response path in `src/http/routes.ts`. Both
`guarded<T>` and `route<T>` are generic over `T`. There,
`handleGetAttachment` already picks `T = HttpBinaryResult` for a file
download. `src/http/errors.ts` defines `HttpBinaryResult` (`status`,
`contentType`, `data`, `filename`). `src/http/server.ts` picks the
response shape at one call site, with `isBinaryResult`. It keeps a
hand-maintained `BINARY_ROUTES` ledger, so `test/http-disposition.test.ts`
can assert `Content-Disposition` generically over every binary route.

No screen calls the JSON `table` route today. `ReportBuilderScreen.tsx`
only ever renders `previewReportDraft`'s result, the builder's live,
unsaved-draft preview. See proposal.md for why the download control still
targets the saved-report route, not the preview one.

## Goals / Non-Goals

**Goals:**
- Reuse `executeReport`'s existing gates and data untouched. The CSV route
  adds a serializer, not a new authorization path.
- Keep the three-way empty-cell rule legible in plain text. The engine
  side must not depend on `packages/web`'s catalog or CSS, per the
  headless-engine boundary in `CLAUDE.md`.

**Non-Goals:**
- NDJSON export of `history_entries`/`instance_events`. That is Part 2 of
  `tmp/offene-items.md`, a separate, undecided change.
- Collision marking for merge-column cells in the CSV. Item 24's three-way
  rule covers empty cells, not merge collisions. The table's own collision
  stamp stays a UI-only affordance.
- Locale-aware CSV headers or cell markers. The engine holds no locale for
  a report execution today. The JSON route carries none either.

## Decisions

**The CSV route re-runs `executeReport`, not a new query path.** The
handler calls the same function `handleExecuteReport` calls. It then pipes
the result through a serializer. This guarantees the CSV can never drift
from the JSON table's authorization or its row set. That guarantee is the
explicit ask in `tmp/offene-items.md`'s item 24
("dieselbe Autorisierung").

**The serializer is a pure function in `src/runtime/api.ts`, not in the
HTTP layer.** `reportResultToCsv(result: ReportExecutionResult): string`
sits beside the `fieldCell`/`mergeCell` functions it mirrors. It takes no
`Actor`, no `SQL`, and touches no I/O. A `bun:test` unit test can cover the
three-way marker text with no database.

One alternative was building the CSV client-side, from the JSON result the
browser already fetched. This design rejects that: item 24 asks for a
server route by name ("eine neue Route neben `handleExecuteReport`"). A
server-side export also serves a future non-browser integration. That
keeps the engine API-first.

**Three distinct, non-empty marker strings cover the three empty-cell
kinds.** The serializer picks each one directly. The engine must not
depend on `packages/web`, so none draws on any UI catalog:
- `no-value` becomes `(no value)`
- `not-in-version` becomes `(not in this version)`
- `redacted` becomes `(redacted)`

A genuine stored `null` value (`kind: "value"`, `value: null`) still
serializes to an empty string. That matches `fieldCellDisplay`'s own
choice to show it blank, not as a fourth marker. It is a real value the
author chose to leave empty, one that exists in the data. It is not one
of the three states item 24 names.

**Merge-column headers name their source fields, not a translated
label.** The table's header has no locale to draw on. A locale-dependent
"merge column" phrase there would need a translation the export cannot
supply. The header instead names the joined `fieldId`s directly, for
example `merge(first_name,legal_name)`. That serves the person opening
the file better than an untranslated placeholder. It also matches the
design language's rule: a machine value never goes through the wording
catalog.

**CSV escaping is a five-line RFC 4180 helper.** It is not a dependency.
A comma, a quote or a newline forces quoting. A quote inside a quoted
field doubles. No package in this repo already does this. Pulling one in
for five lines fails the "already-installed dependency" rung before it
clears the "one line" rung.

**The route joins `BINARY_ROUTES`, and its disposition test gets a
`:reportId` case.** `test/http-disposition.test.ts` iterates
`BINARY_ROUTES` generically today. It only substitutes
`:instanceId`/`:attachmentId`. It needs a small extension: the
filename-carrying assertion's setup creates a report, then substitutes
`:reportId` too. That way the new route runs through the same generic
loop, instead of a one-off test duplicating the assertion.

**The download control appears only once the author has saved the
report.** The CSV route takes a `reportId`. An unsaved draft has none.
Rather than build a second, draft-shaped export path, the control waits
for the report to exist. This mirrors `ReportBuilderScreen.tsx`'s existing
shape: `Save` already sits beside `Preview`. `Download CSV` joins `Save`
in the saved-report state.

## Risks / Trade-offs

An HR analyst who opens a report with no rows gets a header-only file.
That is correct: an empty report has no data to export. It could still
read as a bug to someone unfamiliar with the "sharing narrows access,
never widens it" rule. Mitigation: none needed beyond what the JSON route
already accepts. The same ambiguity exists there today, and stays out of
this change's scope.

A field value can match a marker string. For example, someone types
`(redacted)` into a text field. That value then reads the same as the
marker in the raw CSV text. This ambiguity is inherent to any plain-text
sentinel scheme. The table's own UI has no such collision, because its
markers are non-textual: a dash, a redaction bar.

Mitigation: none. The odds of that exact string landing in that exact
field on that exact row are negligible. A collision-proof richer format,
such as a JSON export, stays out of scope for a CSV request.

## Migration Plan

This change is additive only: a new route, a new client function, and a
new UI control. Nothing existing changes shape. No data migration applies.

## Open Questions

None. This design settles the marker strings and the header-naming rule
for merge columns. It also settles the "hide until saved" gate on the
download control.
