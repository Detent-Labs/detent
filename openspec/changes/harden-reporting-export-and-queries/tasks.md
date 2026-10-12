# Tasks

## 1. CSV formula prefix and truncation line

- [ ] 1.1 Prefix `'` in `csvCellText` for string value cells per design decision 1. Verify a `bun:test` unit test exports `=1+1`, `+1`, `-x`, `@x`, a tab and a CR start, and keeps `-5` as a number.
- [ ] 1.2 Append the truncation line in `reportResultToCsv` per design decision 3. Verify a unit test covers a truncated and a complete result, and the quoted marker.
- [ ] 1.3 Verify the HTTP CSV route end to end. Verify `test/http-reporting-reports.test.ts` downloads a report holding `=1+1` and reads `'=1+1`.

## 2. Report row limit

- [ ] 2.1 Add `maxLimit` to `queryInstances`'s `page` argument per design decision 2. Verify a DB test shows 1200 instances return 1000 with `truncated`, and no `maxLimit` returns 200.
- [ ] 2.2 Pass `REPORT_ROW_LIMIT` from `runReportQuery`, on the visible-row path too. Verify a DB test runs a report over 1200 instances as admin and as a non-admin, and reads 1000 rows with `truncated`.

## 3. Report owner

- [ ] 3.1 Add the two `updateReport` checks per design decision 4. Verify `test/reports.test.ts` covers the three `instance-data-tables` owner scenarios and the unchanged-owner update.

## 4. Reporting aggregates

- [ ] 4.1 Return `history` from `scan` and drop the two re-reads in `cycleTime` and `sla`. Verify the existing view tests give the same figures, and a query-count test sees one `history_entries` read per request.
- [ ] 4.2 Cap `selectInRange` per design decision 6. Verify a DB test seeds 20001 rows with `generate_series` and reads 400, then 20000 rows and reads 200, and a test instance is not counted.
- [ ] 4.3 Verify the HTTP route maps the refusal to `400`. Verify a reporting route test covers it for all three views.

## 5. Browser check

- [ ] 5.1 Check a report over more than 1000 instances in a real browser on the production build with a named `playwright-cli` session. Verify the table shows 1000 rows and its note, and the CSV ends with the marker line.
- [ ] 5.2 Add a `docs/browser-checks.md` entry for that report. Verify the entry names the table note and the CSV marker.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck` in the devcontainer. Report the printed result.
- [ ] 6.2 Run `bun run build` in the devcontainer. Report the printed result.
- [ ] 6.3 Run the FULL `bun test` with DATABASE_URL set through `scripts/test-gated.sh` and `OPENSPEC_TELEMETRY=0`. Report pass, fail and skip counts.
- [ ] 6.4 Run `bun run test:tz` in the devcontainer. Report the printed result.
- [ ] 6.5 Run the prose gate and the whitespace gate on the host over the pushed range. Report the printed result.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then `openspec-archive-change`.
- Strike the `harden-reporting-export-and-queries` entry from the audit index in `docs/decisions.md` in the archive commit.
- Merge the pinned `origin/main` SHA, push, open the PR, and merge on green CI.
