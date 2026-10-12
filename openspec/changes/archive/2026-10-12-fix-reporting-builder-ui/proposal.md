# Proposal

## Why

The 2026-10-10 audit found three defects in the reporting area. The report
builder reads its date filter as UTC days. A process owner in Zurich who picks
1 to 31 October loses all of 31 October (C-6). The area never ends an expired
session, so the owner stays on an error screen until a manual logout (F-4). A
failed column request leaves the field picker empty with no message (F-11).

## What Changes

- The builder's From and To inputs mean the viewer's local day. From sends
  local midnight. To sends the last millisecond of that day. A stored bound
  reads back as its local day. The three reporting views already follow this
  rule.
- `ReportingArea` takes `onUnauthorized` from the shell. Every reporting
  screen that calls the API hands a `401` to it. The shell then ends the
  session, as it does for the app and admin areas.
- The builder keeps the error of the column request. It shows the error where
  the field picker would sit, and clears it when a later request succeeds.
- `bun run test:tz` also runs the builder's date conversion under
  `TZ=Europe/Zurich`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reporting-data-tables`: two added requirements, one for the builder's
  date bounds and one for a failed column request.
- `reporting-app`: one added requirement, for a `401` from any reporting
  request.

## Impact

- `packages/web/src/areas/reporting/`: `root.tsx`,
  `screens/ReportBuilderScreen.tsx`, `screens/ColumnEditor.tsx`,
  `screens/reportsLogic.ts`, and the six other screens that call the API.
- `packages/web/test/` gets tests for the date conversion and the `401`
  routing. `package.json` widens `test:tz`.
- No engine, schema or HTTP change. The definition contract stays as it is.
