# Proposal

## Why

Every caption on the step page, the paths section, the timers and the
actions prints its JSON property. The property stands in the mono face. The
masthead prints `label`, `key` and `description` as its captions. The form
editor's strip prints `visible`, `required` and `readonly`. The matrix
legend repeats those three. The Fields tab calls the same flag "A
participant must fill this in".

That is finding M1 in part and finding m4 of
`docs/studio-ui-concept.md`, rated important. It breaks principle 2 of stage
64. An author reads the author's words. A key or an id appears only inside
the Developer view.

## What Changes

- The JSON property printed beside a caption goes, on every studio screen.
  The caption component loses its property slot. Every caption reads its
  catalog words alone.
- The step page, the timers, the actions and the paths take the vocabulary
  table of `docs/studio-ui-concept.md` section 7. A path reads as a way out.
  A guard reads as "only if". A trigger reads as "A person chooses" or
  "Happens by itself". Assignment reads as "Who acts". The entry and exit
  actions read as what happens when entered or left.
- A step's key input moves into the step page's Developer view. A way out's
  key input moves into a Developer view of its own row. The masthead keeps
  the name and the description, worded as "Name" and "Description".
- Each way out reads as a sentence at its head: its name, an arrow, the step
  it leads to.
- "Required", "Read-only" and "Asked" become the one name each view flag
  takes. The Fields tab, the form editor's strip and marks, the Forms tab's
  legend and the matrix legend all print them.
- The Paths tab's column headings and the Changes tab's property words
  follow the same table. One concept then keeps one word on every surface.
- The catalog loses the two dead `ribbon.*` keys and prints "issue" where
  one legend line still said "finding".
- `.claude/rules/ui-glossary.md` gains the author's word per contract word.
  `studio-guided-vocabulary` states the table and the two rules behind it.
- `src/schema/definition.ts` stays as it is. Nothing changes the engine or
  any stored draft.

Four things stay out of scope, each with the change that owns it:

- the "Only when" heading over a condition (change 4)
- the canvas stamps and accessible names (change 5)
- the tab names (change 9)
- the select options that print keys (change 3)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-guided-vocabulary`: the vocabulary table is a requirement, a
  caption prints no JSON property, and each view flag keeps one name.
- `ui-string-overrides`: a caption prints its catalog words alone. The rule
  that put the property's name after them in mono goes.
- `studio-step-page`: the masthead has no key input, the Developer view
  does. The section names change. A way out has a sentence heading and its
  own Developer view.
- `studio-form-editor`: the strip and the card marks print "Asked",
  "Required" and "Read-only".
- `studio-app`: the Paths tab's columns take the author's words.
<!-- antislop: allow passive-voice -->
<!-- Why: the line quotes a catalog value word for word. -->
- `studio-condition-builder`: the trigger control reads "How it is taken",
  with "A person chooses" and "Happens by itself".

## Impact

- `packages/web/src/i18n/catalogs/studio.ts`: about seventy values change,
  six keys go, four keys arrive.
- `packages/web/src/areas/studio/panels/shared/KeyCaption.tsx` goes, with
  its 26 call sites in eight panels.
- `panels/StepPage.tsx`, `panels/PathsPanel.tsx`: the key inputs move, the
  way-out heading arrives.
- Tests under `packages/web/test/` that quote the old words, plus one new
  vocabulary test.
- `.claude/rules/ui-glossary.md`, `docs/decisions.md`,
  `docs/browser-checks.md` and `ROADMAP.md`.
- No API, schema, dependency or engine change.
