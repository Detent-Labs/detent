# Proposal

## Why

The condition builder prints CEL at both of its main sites. Those are a way
out's "Only when" and a field's "Only ask this when". A "Writes" line in CEL
stands under the rows. The operator select lists `==` and `>=`, and the
joiner reads `&&`. The operand picker prints each field as "Amount
(amount)". It prints the case and the person as `instance.status` and
`actor.roles`.

The owner rated this finding, M7, "bothers me". Principle 2 of stage 64
keeps CEL and keys behind a Developer view.

This is change 4 of stage 64 (`docs/studio-ui-concept.md`, section 8). It
builds on change 2, which shipped on 2026-10-31.

## What Changes

<!-- antislop: allow passive-voice -->
<!-- Why: "is Approved" quotes the builder's own sentence and names a value. -->
- A sentence replaces the CEL readout under the rows. It reads the
  condition in the author's words: "Amount is greater than 1,000 and Status
  is Approved." With no finished row, the sentence asks the author to
  finish one. Over a stored condition it says what the draft still holds.
- The CEL moves into a Developer view under the builder, at every site.
  The view stands closed on open. It holds the CEL text input, which the
  author can still type in. The two links that swapped the rows for that
  input go. Opening the view writes nothing, and the draft never records it.
- Source that does not parse opens the Developer view. A sentence in place
  of the rows says where to fix it.
- A row the builder cannot read prints a sentence in place of its CEL. The
  sentence points to the Developer view.
- The operator select reads words, from "is" to "is at least" and
  "contains". The joiner reads "and" or "or".
- The operand picker lists labels alone. The process's fields come first.
  The called process's outcome and outputs follow. The case's status and
  the person's roles come last. Each list stands under a heading.
- A field with no label reads "(unnamed field)". A label two fields share
  gains a count. The case's status offers its four values as words.
- The canvas edge label keeps its CEL fallback for a row the builder
  cannot read. So does the form preview's path note. Change 5 owns the
  canvas.
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-condition-builder`: the sentence in place of the readout and the
  Developer view at every site. It also covers the unparseable state and
  the raw row's sentence. The operator and joiner words and the operand
  picker's labels and order complete it.

## Impact

- `packages/web/src/areas/studio/panels/shared/ConditionInput.tsx`,
  `ConditionBuilder.tsx`, `conditionLogic.ts`,
  `BooleanOrExpressionInput.tsx`.
- The two call sites: `panels/PathsPanel.tsx` and
  `panels/FieldCatalogPanel.tsx`. Both lose the `toggleVariant` prop.
- The studio catalog, `packages/web/src/i18n/catalogs/studio.ts`.
- `.claude/rules/ui-glossary.md`: the Developer view entry names the
  condition input's view.
- `docs/authoring-guide.md` and `docs/browser-checks.md` name the old CEL
  link today.
- The tests under `packages/web/test/` that pin the readout, the toggle or
  an operand label.
- The rule builder (`RuleInput.tsx`) keeps its readout. It shares the
  operand labels through `fieldOperand`. Its picker therefore drops the key
  too.
