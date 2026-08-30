## 1. Serializer (engine)

- [x] 1.1 Add `reportResultToCsv(result: ReportExecutionResult): string` to
      `src/runtime/api.ts`, beside `emptyResultColumn`/`fieldCell`/`mergeCell`.
      It writes a header row (a field column's `fieldId`, a merge column's
      joined source `fieldId`s as `merge(a,b)`) and one row per instance,
      RFC 4180 escaped.
- [x] 1.2 Give the three empty-cell kinds distinct marker text: `no-value`
      -> `(no value)`, `not-in-version` -> `(not in this version)`,
      `redacted` -> `(redacted)`. A stored `null` value stays an empty
      string, matching `fieldCellDisplay`.
- [x] 1.3 Add a new `test/reporting-csv.test.ts`, a `bun:test` unit test
      (no DB) covering: a plain value cell, each of the three empty-cell
      markers, a merge cell (value and no-value), CSV escaping (a comma, a
      quote, a newline in a value), and the merge-column header format.
      Verify with `bun test test/reporting-csv.test.ts`.

## 2. Route (HTTP)

- [x] 2.1 Add `handleExecuteReportCsv(reportId, req, resolver, db)` to
      `src/http/reporting-routes.ts`, calling `executeReport` (unchanged)
      and returning `HttpBinaryResult` (`text/csv; charset=utf-8`,
      `filename: `report-${reportId}.csv``) on success, or the same
      `notFound(...)` `handleExecuteReport` returns for an unknown report id.
- [x] 2.2 Register `GET /reporting/reports/:reportId/table.csv` in
      `src/http/server.ts`, next to the existing `/table` route, and add it
      to the `BINARY_ROUTES` ledger with `filename: true`.
- [x] 2.3 Extend `test/http-disposition.test.ts` so its generic
      `filename: true` loop also creates a report and substitutes
      `:reportId`, exercising the new route alongside the attachment route.
      Verify with `bun test test/http-disposition.test.ts` (DATABASE_URL set).
- [x] 2.4 Add two `bun:test` cases (DB-backed) to
      `test/http-reporting-reports.test.ts` for the CSV route: a non-member
      refused, and a member lacking `read` receiving a header-only CSV.
      Verify with `bun test test/http-reporting-reports.test.ts`
      (DATABASE_URL set).

## 3. Client and UI

- [x] 3.1 Add `downloadReportCsv(reportId, token): Promise<Blob>` to
      `packages/web/src/areas/reporting/api/client.ts`, calling the new
      route via the shared `request()` and returning `res.blob()`.
- [x] 3.2 Add a "Download CSV" control to `ReportBuilderScreen.tsx`, shown
      only when `reportId` is defined, using the `Blob` + `URL.createObjectURL`
      + `<a download>` pattern from `TaskScreen.tsx`'s `doDownloadAttachment`.
- [x] 3.3 Add the control's label key (EN + DE) to
      `packages/web/src/i18n/catalogs/reporting.ts`, read through
      `t(locale, key)`.
- [x] 3.4 Run the `antislop` skill over every Markdown file this change
      touched or added, and fix every reported finding.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it reports no errors.
- [x] 4.2 Run `bun run build` and confirm it succeeds.
- [x] 4.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, with no silent skip
      of the DB-backed suites (check the skip count, not just the pass
      count; pipe through `scripts/gates/silent-green.sh`).
- [x] 4.4 Run `sh scripts/gates/whitespace.sh < /dev/null` and
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      and confirm both report no findings on this change's files.
- [x] 4.5 Browser check per `docs/browser-checks.md`: start `bun run serve`
      in the devcontainer, use `playwright-cli` to save a report, download
      its CSV, and inspect the downloaded file's header row, an ordinary
      value, and at least one of the three empty-cell markers.
