## Why

A view entry can declare literal `required: true` and literal `readonly: true`.
Put that on a field no source in the body writes, and nothing can fill it. The
participant cannot type into it. The transition-time required check then refuses
to advance the step. The instance parks there with a `required-missing` nobody
can clear.

The studio warns about this shape today. Its `checkViewFlags` finding never
blocks a publish. The engine carries no rule at all. So the JSON view, a
hand-authored body, or an ignored warning reaches a published version. A
published version is immutable.

## What Changes

- A compile-pass check rejects the unsatisfiable shape. The publish fails,
  naming the step and the field.
- The shape is a view entry declaring literal `required: true` and literal
  `readonly: true`. It counts only where no source in the body writes that field.
- The check applies only to entries on steps that carry a manual path. The
  required check runs only at a manual submission. A pair on an
  all-automatic step or a terminal step never strands.
- Six sources write a field:
  - An action's `output`, except an action on the entry's own step at
    `onExit`, `onPath`, or `onCancel`. Those fire only after the submission
    gate they cannot help.
  - A step's `subprocess.outputMapping`.
  - A field's `columnMapping`, where some step other than the entry's own
    carries the mapping field in an editable view entry.
  - A `contract.inputFields` entry.
  - A field's catalog `default`, when literal. `applyFieldDefaults` seeds it
    into `instance.data` at creation. A CEL `default` may raise instead and
    leave the field unwritten.
  - A view entry that is editable elsewhere in the body.

  That set matches the studio's `writtenFieldCounts` on the structural
  sources and the editable-entry rule. Two engine refinements diverge from
  it: the post-gate exclusion, and the literal-default source (design.md,
  Decisions).
- The check reads `=== true` on both flags. An entry carrying a CEL expression on
  either flag passes untouched.

No body that exists today breaks the rule. The four example definitions carry 44
`readonly` view entries. None of them also declares `required`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: gains a publish-time rule against the unsatisfiable
  shape. It sits beside the existing rule for a technical field's view entry.
  That rule forbids both keys already, for its own reason.

## Impact

- `src/schema/compile.ts`: one new check function, joined to `structuralIssues`
  beside `checkTechnicalFields`. `structuralIssues` runs before the idempotent
  early return in `compileProcessBody`, so every body passes through it.
- A writer-set helper, duplicated in `compile.ts` (see design.md, "Duplicate
  the writer-set rule, with two documented divergences").
- `test/compile-validation.test.ts`: a test rejecting a violating body. Further
  tests hold the CEL case, the writer case and the invisible case legal. The
  sweep in tasks 2.5 also drops the wrong "seventh" ordinal on the
  table-shaped-data-sources block (line 478). It leaves the
  technical-field-marker header (line 574) and the line-2 history header
  untouched.
- `docs/authoring-guide.md` and `.claude/rules/authoring-invariants.md` both
  state the rules this check adds to.
- Three files change comments only: `src/validate.ts`,
  `src/engine/definitions.ts`, and `docs/current-state.md`. Their "seven
  structural checks" wording moves to "eight", matching `compile.ts`.
  `current-state.md` also fixes its
  "Six write-path checks" count (line 93, already stale). It drops the wrong
  "seventh" ordinal on `checkColumnMapping` too (line 2760). It also retitles the
  line 103 "The six:" list header to "The harden-publish-validation six:". The
  list then stays a true inventory of that change's checks.
  `roadmap-history.md`, `CODE_REVIEW-2026-08-01.md` and
  `studio-draftValidationLogic.test.ts` keep their historical wording.
- The change's own `specs/definition-contract/spec.md` carries its placement
  paragraph in the two-criterion framing, reworded during authoring and
  verified by task 4.4. Task 4.5 runs the antislop linter over the change's
  four artifacts: proposal, tasks, design, delta spec.
- `src/schema/strip-compiled.ts` and `test/strip-compiled.test.ts` reword
  "a seventh compile-pass addition" to "an eighth" (task 2.5). The round-trip
  guard is a continuing statement, not history. The new check is reject-only,
  so the round trip stays green.
- `src/schema/definition.ts` stays unchanged. Stored bodies keep deserializing,
  and `definitionHash` stays reproducible.
