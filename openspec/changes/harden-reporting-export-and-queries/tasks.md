# Tasks

## 1. CSV formula prefix and truncation line

- [ ] 1.1 Prefix `'` in `csvCellText` for string value cells per design decision 1. Verify a test in `test/reporting-csv.test.ts` exports `=1+1`, `+1`, `-x`, `@x`, a tab and a CR start, and keeps `-5` as a number.
- [ ] 1.2 Append the truncation line in `reportResultToCsv` per design decision 3. Verify `test/reporting-csv.test.ts` covers a truncated and a complete result.
- [ ] 1.3 Verify the HTTP CSV route end to end. Verify `test/http-reporting-reports.test.ts` downloads a report holding `=1+1` and reads `'=1+1`.

## 2. Report row limit

- [ ] 2.1 Add `maxLimit` to `queryInstances`'s `page` argument per design decision 2. Verify a DB test shows 1200 instances return 1000 with `truncated`, and no `maxLimit` returns 200.
- [ ] 2.2 Pass `REPORT_ROW_LIMIT` from `runReportQuery`, on the visible-row path too. Verify a DB test runs a report over 1200 instances as admin and as a non-admin, and reads 1000 rows with `truncated`.
- [ ] 2.3 Rewrite the two tests that hard-code 50: `3.7 report execution reuses queryInstances's own bounding` in `test/reports.test.ts` and `truncation reports the narrowed set` in `test/report-row-visibility.test.ts`. Seed with one bulk SQL insert. Verify both read 1000 and 1001 as their bound.

## 3. Report owner

- [ ] 3.1 Add the two `updateReport` checks per design decision 4. Verify `test/reports.test.ts` covers the three `instance-data-tables` owner scenarios and the unchanged-owner update.

## 4. Reporting aggregates

- [ ] 4.1 Return `history` from `scan` and drop the two re-reads in `cycleTime` and `sla`. Verify `test/reporting.test.ts` gives the same figures. Verify `git grep -c historyByInstance src/engine/reporting.ts` shows its definition and one call.
- [ ] 4.2 Cap `selectInRange` per design decision 6. Verify a DB test seeds 20001 rows with `generate_series` and reads 400, then 20000 rows and reads 200, and a test instance is not counted.
- [ ] 4.3 Verify the HTTP route maps the refusal to `400`. Verify `test/reporting-routes.test.ts` covers it for all three views.

## 5. Request-shape note and browser check

- [ ] 5.1 Add the narrowing sentence to `error.requestShape` in both locales of the reporting catalog. Verify `i18n-catalog-parity.test.ts` passes and the note reads the new text.
- [ ] 5.2 Check a report over more than 1000 instances in a real browser on the production build with a named `playwright-cli` session. Verify the table shows 1000 rows and its note, and the CSV ends with the marker line. Seed 20001 rows and verify the cycle-time screen shows the narrowing note. Run `/impeccable critique` and `/impeccable audit` on the reporting route.
- [ ] 5.3 Add a `docs/browser-checks.md` entry for that report. Verify the entry names the table note, the CSV marker and the narrowing note.

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
