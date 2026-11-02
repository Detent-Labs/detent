# Proposal

## Why

The condition builder writes one flat list of comparisons against typed
values. An author who needs a group, a field against a field or a date order
is stuck. They leave the builder and type CEL.

"Amount is greater than 1,000 and either Department is Sales or Department
is Marketing" is one such rule. "End date is after Start date" and "the
person is not a manager" are two more. The owner named that gap on
2026-10-30 and asked for a much larger builder. Stage 27b deferred grouping,
field-against-field comparison and date ordering. Change 16 of stage 64
closes those three deferrals and the open point SENTENCE-2.

## What Changes

- The builder gains one level of grouping. A group is a row that holds rows
  of its own. Its head says how they combine: any of these or all of these.
  The builder reads a nested `&&` or `||` back as a group and writes it with
  parentheses. A group two levels deep reads as a hand-written rule, as a raw
  row does.
- A comparison row compares against a typed value or against another field
  of the same type and format. One command on the row swaps the value for a
  picker over those fields. The builder reads `data.a > data.b` back as such
  a row.
- A date operand offers four ordering operators in date words. They read is
  before, is on or before, is after and is on or after. A date-time offers
  equality alone, since its stored text may carry a zone. A date value in a
  sentence prints as a formatted date.
- A list operand offers "includes" and "does not include". The builder reads
  `!("x" in actor.roles)` back as the negated row. The list clause reads
  "{value} is one of {field}". The sentence then conjugates no verb against a
  label (SENTENCE-2).
- Every reader of a condition reads a group as a clause. That covers the
  sentence under the rows and the way out's sentence on the Map. It covers
  the Read by rows and the Asked on rows too. A group of two reads "either A
  or B" or "both A and B". A larger one reads "any of A, B or C" or "all of
  A, B and C". A group with a clause after it ends in a comma.
- The `cel-expressions` spec states that the authoring check admits an
  ordering comparison between two `string` operands. The date operators
  depend on that fact.
- No change to `src/schema/definition.ts`. The builder still writes plain
  `{ lang: "cel", src }`, and the CEL text input stays first-class.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-condition-builder`: the row model gains a group row and a field
  value. The operators per type gain date ordering and list negation. The
  sentence, the reader sentence and the way out's phrase gain group clauses.
  The list clause changes its words.
- `cel-expressions`: the authoring-time check admits ordering comparison
  between two `string` operands.

## Impact

- `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`: the model,
  the reader, the writer and the sentence.
- `packages/web/src/areas/studio/panels/shared/ConditionBuilder.tsx`: the
  group row, the value swap command, the operator words.
- `packages/web/src/areas/studio/panels/shared/ConditionInput.tsx`: the row
  count it hands `commitDecision`.
- `packages/web/src/areas/studio/panels/shared/ruleLogic.ts`: one call of
  `summarizeValue` takes the new signature, and `RuleValue` becomes an alias.
  The rule builder's sentence prints a date literal formatted; its rows and
  operators stay.
- `packages/web/src/i18n/catalogs/studio.ts`: the new words.
- The tests under `packages/web/test/` whose names start with
  `studio-condition`, plus `studio-commitDecision`, `studio-guardPhrase`,
  `studio-vocabulary`, `studio-readByRows`, `studio-ruleLogic`,
  `studio-booleanEmptyOption`, `studio-keyReaders`, `studio-mapWords` and
  `studio-guardedPathNotes`.
- `test/cel.test.ts`: the string-ordering admission.
- `.claude/rules/ui-glossary.md`: a "condition group" row.
  `docs/browser-checks.md`: the group states. `docs/decisions.md` and `docs/decisions-archive.md`: SENTENCE-2 closes and the deferrals land as one entry. Refused simplification 11 changes its reason.
- `ROADMAP.md` and `docs/roadmap-history.md`: stage 64 closes with this
  change. `docs/studio-ui-concept.md` moves into
  `openspec/changes/archive/2026-10-30-studio-fresh-draft-starts-clean/`.
