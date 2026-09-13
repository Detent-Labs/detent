## Why

The 2026-09-13 audits of the Studio Forms tab left six findings open in
`docs/decisions.md` that the owner has since decided. An author learns the
miniature's marks only by opening forms, since no legend explains them
(FORMS-2). A field entry whose `required` holds a CEL expression draws as an
ordinary outline (FORMS-5). The open control stands 23px tall, one pixel
under WCAG 2.5.8's minimum (FORMS-6).

Card names are spans, so heading navigation cannot move between cards
(FORMS-8). The browser check's wrap step clears its line by a few pixels
(FORMS-9). A check badge's name joins two fragments and omits its step, so
two badges can read alike (FORMS-13). The owner picked one direction for all
six on a mockup.

## What Changes

- A legend line stands above the Forms tab grid. It names five marks, each
  beside a sample. Its words read field, required, required if a condition
  holds, section, and taller asks for more.
- An entry whose `required` holds a CEL expression draws a 1px dashed outline
  in the required color, with no fill. The foot's required count still counts
  only a literal `required: true`.
- The open control stands at least 24px tall.
- Each card's step label becomes a level-2 heading, with the same look it
  has today.
- The check badge's accessible name states its count and its step. One
  sentence holds both, as in "2 open issues on Submit the Exit Notification".
- Step 4 of the Forms tab browser check adds fifteen field entries instead of
  ten. New steps read the legend while the grid scrolls, the headings, the
  control's height and two dashed marks.
- The record in `docs/decisions.md` drops FORMS-2, FORMS-5, FORMS-6, FORMS-8,
  FORMS-9 and FORMS-13. FIELDS-7 gains two sentences naming the card labels'
  heading level.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-forms-overview`: two requirements join the spec, one for the
  legend and one for the card heading. Three requirements take new rules.
  The miniature draws a CEL-conditional entry as a dashed outline. The open
  control meets the 24px target size. The check badge names its step.

## Impact

- `packages/web/src/areas/studio/panels/FormsTab.tsx` and `formCardRows.ts`.
- The studio catalog in `packages/web/src/i18n/catalogs/studio.ts`: six
  legend keys join it, and `formsTab.issueMark` and `formsTab.issueMarkOne`
  take whole sentences.
- Tests: `studio-formCardRows.test.ts`, `studio-formsTab.test.tsx` and
  `studio-guidedSurfaceStyle.test.ts`.
- Docs: `DESIGN.md`, `docs/current-state.md`, `docs/browser-checks.md`,
  `docs/decisions.md` and `.claude/rules/ui-glossary.md`.
- No engine, schema, HTTP or definition contract change.
