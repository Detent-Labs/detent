# Proposal

## Why

The Checks tab prints what the validators return. Its groups read ZOD, STRUCTURAL and CEL. A message reads "Invalid input: expected string, received object". A row hands off to a tab and stops there. An author who is not a developer cannot act on it.

Principle 5 of `docs/studio-ui-concept.md` says a check result is a sentence at the spot. Decision D5 chose the form. Rows group by subject, and each carries a severity word. A fix control lands on the section.

## What Changes

- The Checks tab groups its rows by subject: Steps, Fields and Before publishing. The six source groups leave the page.
- Every row carries a severity word, Must fix or Worth a look, and one sentence. The sentence names the step and the section and says what to do.
- Every engine message maps to a sentence through one module, `draft/checkSentence.ts`. A message no rule knows still reads as a sentence that names its place. A test scans the engine's message literals, so a new literal without a rule fails the suite.
- The same sentence prints at the spot: the step page, the field card, the way-out row and the source editor. The source label leaves `IssueItems`.
- A row's Fix control lands on the place. On Steps, that section stands open with focus on its header. On Fields, the field stands selected with focus on the sentence.
- The check kind, the raw message and the location stand in the row's Developer view.
- What has not run reads as one line under Before publishing, with the held-back kinds in that line's Developer view.
- Inherited open points close:
  - The narrowing label reads no key (ACCORDION-4).
  - A step key check stands in More, with its Developer view open.
  - A step's name check stands under Name, and Add a step focuses Name (ACCORDION-9).
  - A way out with a removed target says so (ACCORDION-6).
  - The no-assignment warning takes the warning callout's form (ACCORDION-12).
  - Unnamed steps read their numbers (ACCORDION-14).
  - The steps rail scrolls to the current row (ACCORDION-11, first half).
  - The Publish dialog and a refused publish print sentences (HEADER-7, first half).
  - The guard heading reads "Only if" (MAPLABELS-5).
- The step page's failed child file load gets an alert role. That is this change's part of the 22 renders that lacked one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-checks-rail`: rows by subject, severity words and the sentence rule. It also covers the row's Developer view, the held-back line, and a step's checks at their sections.
- `studio-process-tabs`: a check's Fix control lands on the place, and focus follows it.
- `studio-step-page`: the name check under Name and the key check in More. It also covers focus after Add a step, a removed target, the rail's scroll, and the failed child load.
- `studio-publish`: the blocked sentence and the refused publish.
- `studio-guided-vocabulary`: the guard heading, and the severity words.
- `studio-condition-builder`: the guard heading reads "Only if".
- `studio-json-view`: a Fix control is a second way in.
- `web-styling`: the advisory exemption narrows to the timers panel.
- `studio-app`: the step's issue count stands on the rail row, and a key check counts at More.
- `studio-canvas`: the step's key field stands in the Developer view.

## Impact

- Code under `packages/web/src/areas/studio`:
  - `draft/` holds `checkSentence.ts` (new), `issues.ts`, `validation.ts`, `checksRail.ts` and `process-tabs.ts`.
  - `panels/` holds `ChecksRail.tsx`, `shared/IssueList.tsx`, `StepPage.tsx`, `sectionIssues.ts`, `StepsRail.tsx`, `PathsPanel.tsx`, `FieldsTabViews.tsx`, `EntityTabs.tsx`, `FieldCatalogPanel.tsx`, `DataSourcesPanel.tsx`, `JsonView.tsx`, `DraftToolbar.tsx`, `ProcessHeaderBar.tsx` and `shared/optionText.ts`.
  - `screens/EditScreen.tsx` holds the landing.
- Catalog: about 105 new `checks.*` keys in `i18n/catalogs/studio.ts`.
- Tests: the rail, tab-target and publish-error suites change. New suites cover the sentences and the rows.
- Docs: `.claude/rules/ui-glossary.md`, `.claude/rules/design-language.md`, `DESIGN.md`, `docs/authoring-guide.md`, `docs/browser-checks.md`, `docs/decisions.md`, `docs/decisions-archive.md` and `ROADMAP.md`.
- `src/schema/definition.ts`, the engine and every API stay as they are.
