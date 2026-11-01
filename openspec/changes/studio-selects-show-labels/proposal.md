# Proposal

## Why

The steps rail and a way out's heading name a step by its label. The
step page's selects name the same step by its key. "Leads to" offers
`antrag`, `pr_fung` and `abschluss` beside a rail that reads "Antrag",
"Prüfung" and "Abschluss". The time limit's way-out select offers
`pr-fung-abschluss` in place of "Freigeben". The author translates between
label and key in their head.

The keys themselves read badly. Derivation
turns every character outside `[a-z0-9]` into a separator, so "Prüfung"
becomes `pr_fung`.

The owner rated M2, "Selects list keys in place of labels", "bothers me".
Principle 2 of stage 64 says a key appears only after the author opens the
Developer view. This is change 3 of stage 64 (`docs/studio-ui-concept.md`,
section 8). It builds on change 2, which shipped on 2026-10-31.

## What Changes

- Two selects list steps: the way out's "Leads to" and "Where the new way
  out leads". Each lists a step by its label in the content locale. An unnamed
  step reads "(unnamed step)". A second and later step sharing a label
  adds a count, "Review (2)", the condition builder's rule for fields.
- The time limit's way-out select lists each way out by its row heading,
  "Approve → Done". Two ways out with one
  heading stay apart by the same count.
- The field-map selects on the step page list fields by label. They serve
  an action's output mapping and a called process's two mappings. A
  child field reads its label in the child's own words.
- A way out's heading names an unnamed target step "(unnamed step)". It
  no longer falls back to the step's key or id.
- A new path's default label names an unnamed side "(unnamed step)" in
  place of its key.
- Key derivation transliterates before it slugs. "ä", "ö" and "ü" become
  "ae", "oe" and "ue", and "ß" becomes "ss". Every other letter with a
  diacritic loses the mark ("é" becomes "e"). One function serves the
  process key, the step key, the field key and the path key. "Prüfung"
  derives `pruefung`, and a path from it to "Abschluss" derives
  `pruefung-abschluss`.
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-step-page`: the way-out heading's target falls back to "(unnamed
  step)". A new requirement makes every step, way-out and field select on
  the step page list labels. The input-mapping editor lists the child's
  input fields by label in place of key.
- `studio-canvas`: the process key derivation transliterates first. A new
  path's default key takes the same transliteration. An unnamed side of its
  default label contributes the placeholder in place of its key.
- `studio-app`: the field catalog's field key derivation transliterates
  first.

Section 8 also names `studio-condition-builder`. Change 4 already made its
operand picker list labels with a count, and no rule of that capability
changes here.

## Impact

- `packages/web/src/areas/studio/draft/deriveKey.ts` (transliteration) and
  `draft/createPath.ts` (path slug, label fallback).
- `panels/PathsPanel.tsx`, `panels/TimersPanel.tsx`, `panels/StepPage.tsx`,
  `panels/shared/fieldExpressionMapLogic.ts`,
  `panels/shared/FieldExpressionMapEditor.tsx`, `panels/ActionListEditor.tsx`,
  `panels/SubprocessSpecEditor.tsx`, `panels/shared/useChildInputFields.ts`:
  option text and the props it needs.
- A new module, `panels/shared/optionText.ts`, with the catalog key
  `options.repeatedLabel` in `i18n/catalogs/studio.ts`.
  `panels/shared/conditionLogic.ts` moves onto it.
- Tests under `packages/web/test` for derivation, option text and the
  panels.
- `docs/authoring-guide.md`, `docs/browser-checks.md` and
  `docs/decisions.md`.
- The migration plan form keeps its key and label choices. Its spec asks
  for both, because a migration maps instance data by key.
