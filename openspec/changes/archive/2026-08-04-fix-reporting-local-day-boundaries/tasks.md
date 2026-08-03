Groups 1 and 2 land in one commit. Group 1 leaves the tree red on purpose, so
the new tests prove they can fail. That red phase lives inside the apply run,
never in a commit.

## 1. Write the failing tests first

- [x] 1.1 In `packages/web/test/reporting-reportingLogic.test.ts`, replace the
      three assertions on lines 39 to 41 that compare against literal UTC
      strings. Put a round-trip pair in their place:
      `toDateInput(fromDateInput(day, "start"))` and the same for `"end"` both
      return the picked day
- [x] 1.2 Add the companion test that pins the timezone. Run it as its own
      process with `TZ` set in the command (a zone ahead of UTC, such as
      `Europe/Zurich`), never by assigning `process.env.TZ` mid-run. Assert
      that the start bound of a summer day is 22:00 UTC on the previous day
- [x] 1.3 Run the two new tests and watch them fail against the current code.
      A test that has never failed proves nothing. Record what each one
      printed

## 2. Fix the two conversions

- [x] 2.1 In `packages/web/src/areas/reporting/screens/reportingLogic.ts`,
      rewrite `fromDateInput` to build `new Date(y, m - 1, d)` for `"start"`
      and `new Date(y, m - 1, d, 23, 59, 59, 999)` for `"end"`, parsing the
      three numbers out of the `YYYY-MM-DD` value
- [x] 2.2 Rewrite `toDateInput` to read the local day with `getFullYear`,
      `getMonth` and `getDate`, zero-padded, rather than `iso.slice(0, 10)`
- [x] 2.3 Update both doc comments. They currently state the UTC behavior as
      the intent
- [x] 2.4 Run the tests from group 1 and confirm they now pass

## 3. Snap the default range to the same edges

- [x] 3.1 Rewrite `defaultRange` so its two bounds are local day edges: local
      midnight thirty days back, and the last millisecond of the local day of
      `now`. Keep the injectable `now` parameter, which
      `openspec/specs/reporting-app/spec.md:189-198` requires for its test
- [x] 3.2 Rewrite the three assertions on lines 24 to 26 of the test file.
      They pin exact ISO strings and an exact thirty-day span, which the
      snapped edges no longer produce. Assert instead that `from` is at or
      before `now` minus thirty days, that `to` is at or after `now`, and that
      the span is at least thirty and under thirty-one days. Keep the fixed
      reference instant, which
      `openspec/specs/reporting-app/spec.md:187-199` requires. Leave the
      `rangeIsValid` test on line 30 as it stands
- [x] 3.3 Add a test that a default range survives a round trip through the
      control: `toDateInput` of each bound, back through `fromDateInput`,
      returns the same two instants

## 4. Sync the spec

- [x] 4.1 Apply the delta in
      `openspec/changes/fix-reporting-local-day-boundaries/specs/reporting-app/spec.md`
      to `openspec/specs/reporting-app/spec.md`: the three added paragraphs on
      the requirement body plus the two new scenarios. The three existing
      scenarios stay as they are

## 5. Manual verification

- [x] 5.1 Open the reporting area in a host browser, in Swiss local time. Pick
      a single day that has an instance started between local midnight and
      02:00, and confirm the view counts it. That instance is the case the
      fault dropped
- [x] 5.2 Confirm the date control still shows the day you picked after the
      view reloads

## 6. Close the two gaps the verification pass found

- [x] 6.1 Add a `test:tz` script to `package.json` that runs the reporting
      test file with `TZ=Europe/Zurich`, and chain it into `check`. The push
      gate runs `bun run check`, the container runs UTC, and the companion
      test is the only one that catches this fault. Without this the guard
      never runs where it matters
- [x] 6.2 Return an empty string from `fromDateInput` for a value that does
      not parse, rather than throwing from `toISOString()`. Clearing an
      `<input type="date">` reports `""`, and the throw reaches no catch.
      `rangeIsValid` already rejects an empty bound, and `root.tsx:83`
      renders that as an invalid range
- [x] 6.3 Return an empty string from `toDateInput` for an instant that does
      not parse, rather than `NaN-NaN-NaN`. An empty value clears the control
- [x] 6.4 Test both, including that a cleared bound makes `rangeIsValid`
      false

## 7. Verification

- [x] 7.1 Run `bun run typecheck` in the devcontainer
- [x] 7.2 Run the full `bun test` suite in the devcontainer with `DATABASE_URL`
      set, and read the skip count as well as the pass count
- [x] 7.2a Run `packages/web/test/reporting-reportingLogic.test.ts` a second
      time with `TZ=Europe/Zurich`. The container runs UTC, so the plain run
      skips the one test that proves the local-day behavior
- [x] 7.3 Run the antislop linter over `proposal.md`, `design.md`, `tasks.md`,
      the delta spec and `openspec/specs/reporting-app/spec.md`
- [x] 7.4 Run `git diff --check`
