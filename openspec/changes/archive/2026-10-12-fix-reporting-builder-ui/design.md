# Design

## Context

See proposal.md for the three defects. Three facts shape the fix.

The three reporting views already convert a picked day to an instant with
`fromDateInput` and back with `toDateInput` (`screens/reportingLogic.ts`).
The builder converts by hand with `new Date("2026-10-31").toISOString()`,
which ECMAScript reads as UTC midnight. It also reads a stored bound back
with `iso.slice(0, 10)`, which is the UTC day.

The app and admin areas end an expired session through `useFail`
(`shell/useFail.ts`). It takes the shell's `onUnauthorized` and an error
handler. `ReportingArea` does not destructure `onUnauthorized`, though the
shell passes it.

The builder swallows a failed column request with
`.catch(() => setChoices([]))`.

## Design direction (impeccable shape)

The screen serves a process owner who works through it. Its look does not
change. The From and To inputs keep their labels and place.

The error uses the area's existing `ErrorNote`: a stamp and one sentence from
the catalog. It prints where the data would sit, never as a toast
(`design-language.md`). No new token, catalog key or component appears. Two
sections consume the column choices, so the note sits in two places. One sits
directly above the "Add comparison" button. The other sits directly under the
column section's heading.

## Goals / Non-Goals

**Goals:**

- A picked day means the same instants in the builder as in the three views.
- An expired token ends the session from every reporting screen.
- A failed column request is visible and recoverable.
- A test under `TZ=Europe/Zurich` fails if the builder's conversion regresses.

**Non-Goals:**

- No change to the server's date handling. It keeps parsing ISO instants
  (`reporting-data-tables`, "A saved report's date bounds must parse").
- No rewrite of bounds already stored in saved reports. A stored UTC-midnight
  bound still runs as stored. The input shows its local day.
- No From-before-To check in the builder. The area's views block an inverted
  range, and the builder has never done so. A separate change owns that.

## Decisions

**D1. One helper for the builder's bounds, in `reportsLogic.ts`.**
`withDateBound(draft, edge, value)` returns the draft with `createdAfter`
(edge `start`) or `createdBefore` (edge `end`) set through `fromDateInput`.
An empty value yields `""`, which `draftToInput` already drops. The input's
value comes from `toDateInput`. Alternative: inline `fromDateInput` calls in
the screen. Rejected, because the screen has no test seam and a timezone bug
needs a test under `TZ`.

**D2. `test:tz` runs the builder's test file too.** The script runs
`reporting-reportingLogic.test.ts` and `reporting-reportsLogic.test.ts`
under `TZ=Europe/Zurich`. The new tests live in the second file. Every test
in that file must pass under Zurich time, and task 1.3 checks that.
Alternative: a new file for the date tests only. Rejected, since the script
would then list three files for one concern.

**D3. `useFail` in each screen, as the app and admin areas do.** Each reporting
screen takes an `onUnauthorized: () => void` prop and builds
`fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err)))`.
Its catch handlers call `fail(cause)`. `ReportingArea` destructures
`onUnauthorized` and passes it at all seven call sites: the picker, the three
views, the list, and the builder in both routes. The builder passes it on to
its embedded picker. Alternative: one context in the area root. Rejected. The
sibling areas pass props, and a different mechanism here would hide the 401
rule.

**D4. Every builder request routes through `fail`.** The builder has five
request sites: load, column choices, preview, save and CSV download. Each
handler calls `fail`, so a 401 from any of them ends the session. The
column-choices handler differs in one way. Its non-401 branch also sets
`choices` to `[]` and stores the error.

**D5. The column error lives in the screen's state.** `choicesError` is a
`ClientError | undefined`. A success clears it. The screen renders
`ErrorNote` above the "Add comparison" button. `ColumnEditor` takes an
optional `choicesError` prop and renders the same note under its heading.
Alternative: a single note at the top of the screen. Rejected. The brief asks
for the note where the picker would sit, and the picker appears in two
sections.

## Risks / Trade-offs

- [A saved report holds a UTC-midnight bound] → It runs as stored. In a
  timezone behind UTC the input can show a different day than the owner
  picked. The product is pre-1.0 and no deployment runs it.
- [`describeCaughtError` drops the HTTP status] → `useFail` reads the raw
  `AppClientError`, so each handler passes the raw cause to `fail` and never
  the described error.
- [The CI timezone differs from Zurich] → `test:tz` sets `TZ` itself. The
  default run also executes the same tests in the host timezone.

## Migration Plan

No data migration. The change ships with the web build. Rollback is a revert.

## Open Questions

None.
