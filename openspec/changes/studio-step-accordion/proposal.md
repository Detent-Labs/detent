# Proposal

## Why

The step page stands ten sections open in two columns. One task step holds
83 controls at once, and an author reads none of them first (finding M1 in
`docs/studio-ui-concept.md`). Removing a step commits at once, with no
confirmation (M13). Below 64rem the Steps tab nests three scroll boxes, and
the step page shows 244px at a time (RAIL-7 in `docs/decisions.md`).

The owner decided the shape on 2026-10-30, in decision D3 of the concept.
One step opens as an accordion with six sections, one open at a time. This is
change 10 of stage 64. It builds on change 9, which shipped on 2026-10-31.

## What Changes

- The step page lays its sections in one column. A task step carries six
  sections. They read Who acts, Form, Ways out, Time limit, When entered or
  left and More, in that order. The two columns go.
- A subprocess step swaps Who acts and Form for Which process it calls. An end
  step swaps Ways out for How the case ends, and its last-but-one section reads
  When entered.
- When entered and When left merge into one section. Cancellable, Collaboration
  and the Developer view gather in More.
- Each section header is a disclosure button. It carries the section's name, a
  one-line summary of what the section holds, and its state. A done section
  shows a check mark. A section with open checks shows the check badge the
  steps rail already uses, with the count.
- One section stands open at a time. Opening one folds the other. The page
  opens on the first section with an open check. It opens the first section
  still to do when no section carries a check. It opens the first section
  when none is to do. A selected way out opens Ways out.
- A check result stands inside its section, as a sentence above the controls.
  A way out's, a time limit's and an action's own results stay at their rows.
  The masthead keeps only the results no section claims. The Checks tab keeps
  listing every one.
- Remove this step opens a confirmation dialog, the same form the field
  catalog's removal and the kind switch use. It names the step. It counts the
  ways out that lead to it and the fields on its form. It says the studio has
  no undo. Cancel holds the focus. The control takes the destructive outline.
- The steps rail widens to 22rem beside the page (RAIL-6). Below 64rem the
  step page gives up its own scroll box (RAIL-7). The tab body then scrolls
  the rail and the page as one.
- Every string comes from the studio catalog. No key, id or CEL appears
  outside a Developer view.
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-step-page`: the single-column accordion and its section set per
  step kind. The header's summary and state. One section open at a time. A
  check result inside its section. The Developer view inside More, the
  removal dialog, the rail width and the stacked layout below 64rem.
- `studio-checks-rail`: a step's checks stand at their sections. The header
  counts them and the body prints them. The Checks tab keeps the sum.
- `spa-accessibility`: the step page's section headers are disclosures the
  studio builds itself, so they carry `aria-expanded` and `aria-controls`.

## Impact

- `packages/web/src/areas/studio/panels/StepPage.tsx`: the accordion, the
  header, the More body, the dialog trigger.
- `packages/web/src/areas/studio/panels/sectionsFor.ts`: eight section names,
  the per-kind lists, the section label. `sectionColumns` goes.
- `packages/web/src/areas/studio/panels/sectionIssues.ts`: the merged and the
  gathered sections take their body keys.
- New `packages/web/src/areas/studio/panels/stepSummaries.ts`: the summary,
  the state and the default-open rule, as pure functions.
- New `packages/web/src/areas/studio/panels/RemoveStepDialog.tsx` and
  `packages/web/src/areas/studio/draft/stepRemoval.ts`: the dialog and the
  reach it counts.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: the Steps tab's
  grid, the rail width and the stacked rows.
- `packages/web/src/i18n/catalogs/studio.ts`: section, summary, state and
  dialog strings. Four section-heading keys go.
- Tests under `packages/web/test/`: `studio-stepPage.test.tsx`,
  `studio-sectionsFor.test.ts`, `studio-sectionIssues.test.ts` and
  `studio-guidedSurfaceStyle.test.ts` change. New tests cover the summaries,
  the default-open rule and the removal reach.
- `.claude/rules/ui-glossary.md`, `docs/authoring-guide.md`,
  `docs/browser-checks.md`, `docs/decisions.md`, `docs/decisions-archive.md`
  and `ROADMAP.md` follow the layout.
- No schema, dependency or migration change.
