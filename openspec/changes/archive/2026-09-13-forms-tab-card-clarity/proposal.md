## Why

The 2026-09-13 audits of the Forms tab left three findings in
`docs/decisions.md` that the owner has since decided. On IT Offboarding,
all twelve open controls share one accessible name, "Open the form"
(FORMS-1). An empty card states its emptiness twice (FORMS-3). "Submit the
Exit Notification" reads "32 fields" over 26 marks, because its six group
entries count as fields (FORMS-4). The owner approved one direction for all
three on a mockup.

## What Changes

- Each card's open control names its step for assistive technology. Its
  accessible name reads "Open the form Submit the Exit Notification". Its
  visible words stay as they are.
- An empty card keeps "No fields yet" where the miniature would stand. The
  foot drops "Empty form" and holds the open control alone, at the row's
  trailing edge.
- The count counts the field entries that draw a mark. A group entry and a
  note add nothing to it.
- The foot states the required count beside the field count, as in "26
  fields, 7 required". A form without a required entry reads "16 fields".
- The miniature leaves the accessibility tree. The foot's text states the
  same numbers, so a screen reader hears them once.
- A view holding only group entries reads as an empty form.
- `docs/decisions.md` drops FORMS-1, FORMS-3 and FORMS-4. FORMS-2 records
  that the legend waits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-forms-overview`: three requirements change. The count skips group
  entries and states the required count. The miniature leaves the
  accessibility tree. The open control names its step.

## Impact

- `packages/web/src/areas/studio/panels/FormsTab.tsx` and `formCardRows.ts`.
- The studio catalog in `packages/web/src/i18n/catalogs/studio.ts`:
  `formsTab.emptyForm` retires, and the comment over the count keys moves
  with them to the foot.
- Tests: `studio-formCardRows.test.ts`, `studio-formsTab.test.tsx`,
  `studio-guidedSurfaceStyle.test.ts`.
- Docs: `DESIGN.md`, `docs/current-state.md`, `docs/browser-checks.md` and
  `docs/decisions.md`.
- No engine, schema, HTTP or definition contract change.
