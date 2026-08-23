## 1. The writer set

- [x] 1.1 Add a writer-set helper to `src/schema/compile.ts`. Expect `bun run
      typecheck` to stay red until 1.8/1.9 land: tsconfig sets
      `noUnusedLocals: true`, and the tree goes green at the group boundary.
- [x] 1.2 Collect each action `output` key. Except an action on the entry's
      own step at `onExit`, `onPath`, or `onCancel`: those fire only after
      the submission gate they cannot help.
- [x] 1.3 Collect each `subprocess.outputMapping` key
- [x] 1.4 Collect each `columnMapping` target where some step other than the
      entry's own carries the mapping field in an editable view entry
      (neither `visible: false` nor `readonly: true`). Editable only on the
      entry's own step, the write-back runs after the gate it cannot help.
      Also collect each `contract.inputFields` entry.
- [x] 1.5 Collect each field id whose catalog `default` is a literal. A
      default counts as literal iff it is not an object carrying
      `lang: \"cel\"` (mirroring `applyFieldDefaults`' `asExpression`). An
      opaque object-shaped literal default counts as a literal. A CEL
      `default` may raise at creation and leave the field unwritten.
- [x] 1.6 Collect each view entry declaring neither `visible: false` nor
      `readonly: true`, skipping group-container and ref-less entries
- [x] 1.7 Name the studio's `writtenFieldCounts` as the counterpart in a
      comment. State the two documented divergences: the post-gate
      exclusion (1.2, 1.4) and the literal-default source (1.5).
- [x] 1.8 Add the check function beside `checkTechnicalFields` with a
      `// 8.` section header, calling the writer-set helper. It returns the
      collected `CompileIssue[]`, empty when the body is clean. This step is
      wiring and plumbing only: the function signature and collection
      scaffolding. The reject and skip logic lands in group 2 (tasks
      2.1-2.4).
- [x] 1.9 Append it to `structuralIssues`, the single placement in
      `compileProcessBody` before the idempotent early return. A body that
      merely satisfies `publishedProcessBody` cannot skip it.

## 2. The check

- [x] 2.1 Reject an entry whose `required` and `readonly` both read literal
      `true`. Only when the entry's step carries a manual path (test 3.15
      pins the scope).
- [x] 2.2 Skip an entry whose field the writer set holds
- [x] 2.3 Skip a group field, a technical field, an entry declaring literal
      `visible: false`, and an entry carrying no `ref` (mirroring
      `checkTechnicalFields`' own `typeof vf?.ref !== \"string\"` guard: the
      Zod gate rejects the malformed entry anyway)
- [x] 2.4 Report a `CompileIssue` naming the step and the field
- [x] 2.5 Wording sweep, "seven" to "eight", at every live count site:
      - `compile.ts` (lines ~4-5, ~22, ~112, ~131, ~808), `validate.ts`
        (~7, ~64, ~108), `src/engine/definitions.ts` (~242),
        `docs/current-state.md` (~207).
      - `docs/current-state.md` ~93 "Six write-path checks run inside
        `compileProcessBody`" becomes "Eight". Six was already stale. The
        "(harden-publish-validation)" label in that line's parenthetical is
        dropped too, so the parenthetical lists only the three file paths.
        That is the same label drop the `compile.ts` ~111/~807 treatment
        gets.
      - `docs/current-state.md` ~2760 drops the wrong ordinal on
        `compile.ts::checkColumnMapping`. The columnMapping bounds run
        inside `checkFieldTree`, the third check.
      - `test/compile-validation.test.ts` ~478 drops the same wrong
        ordinal: "the seventh structural check" becomes "a structural
        check".
      - `test/compile-validation.test.ts` ~574 ("technical-field-marker:
        the seventh structural check") stays true. The new check appends
        as the eighth, so `checkTechnicalFields` keeps its seventh place.
        The `test/compile-validation.test.ts` line 2 header names the six
        checks the harden-publish-validation change added, and stays as
        history.
      - The studio's `validation.ts` ~56 and `checksRail.ts` ~38 comments
        stay stale by the no-studio-touch non-goal (design.md names both).
      - `docs/current-state.md` ~103 "The six:" becomes "The
        harden-publish-validation six:", so the list stays a true
        inventory of that change's checks.
      - `docs/roadmap-history.md` ~830 and `docs/CODE_REVIEW-2026-08-01.md`
        ~654 stay as historical records of what those stages said at the
        time. `packages/web/test/studio-draftValidationLogic.test.ts` ~7
        names the same six checks harden-publish-validation added, and
        stays as history too. That is the same standard as the line-2
        header.
      - `compile.ts` ~122-124, the `CompileIssue` doc comment enumerating
        the defect kinds, gains the unsatisfiable required+readonly pair as
        an eighth kind.
      - `test/compile-validation.test.ts` ~478 and ~574 were part of the
        now-archived change `allow-schema-refinement-tightening` (archived
        2026-08-23, commit e6fa427). Its task 1.2 rewrote the reasoning
        sentences there, already in the working tree. Re-read the file's
        current content before editing: those lines carry that change's
        rewrite, and the ordinal wording is this task's target.
      - `compile.ts` ~777-788, the `structuralIssues` doc comment naming
        the duck-typed checks, gains the new check's name. The enumeration
        reads "`checkReservedActionPrefix`, `checkUnknownKeys`,
        `checkTechnicalFields` and the new check operate on the body
        duck-typed" (the "remaining four" phrase stays).
      - `src/schema/strip-compiled.ts` ~7 and `test/strip-compiled.test.ts`
        ~4: "a seventh compile-pass addition" becomes "an eighth
        compile-pass addition". The round-trip guard is a continuing
        statement, not history. The new check is reject-only, so the round
        trip itself stays green.
      - Separately, at `compile.ts` ~111 and ~807, drop the
        "(harden-publish-validation)" label together with the ordinal
        change. It names a change that added six of the eight checks, so
        "Eight checks (harden-publish-validation)" would misattribute two.

## 3. Tests

- [x] 3.1 Reject an unwritten pair, in `test/compile-validation.test.ts`
- [x] 3.2 Publish a pair an action `output` writes, on a step other than the
      entry's, and one on the entry's own step's `onEntry`. That is the
      pre-gate boundary that pins the exclusion against over-broadening.
- [x] 3.3 Reject a pair whose only writer is the entry's own step's
      `onPath`, `onExit`, or `onCancel` output. One body per position.
- [x] 3.4 Publish a pair whose only writer is an `onFire` action on the
      entry's own step's timer, with and without a `targetPath`. The
      targetPath timer's forced exit runs no required check, so the park is
      bounded, not permanent.
- [x] 3.5 Publish a pair a `subprocess.outputMapping` writes
- [x] 3.6 Publish a pair a `columnMapping` target writes, when a step other
      than the entry's own carries the mapping field in an editable view
      entry. Reject a pair whose only writer is the mapping field placed
      editable only on the entry's own step.
- [x] 3.7 Publish a pair a `contract.inputFields` entry writes
- [x] 3.8 Publish a pair an editable view entry writes, on another step
- [x] 3.9 Publish a pair whose field carries a literal catalog `default`.
      Reject a pair whose only writer is a CEL catalog `default`: it may
      raise at creation and leave the field unwritten.
- [x] 3.10 Publish a CEL `readonly`, and a CEL `required`
- [x] 3.11 Publish an entry declaring `visible: false`. Reject an unwritten
      pair whose entry carries `visible` as a CEL expression: this pins the
      literal `visible === false` test.
- [x] 3.12 Publish each example definition unchanged
- [x] 3.13 Add "an unwritten required+readonly pair parses on read" to the
      `compile: a body violating a new check still reads` block in
      `test/compile-validation.test.ts`
- [x] 3.14 Reject the unwritten pair even on a body that already satisfies
      `publishedProcessBody`, in `test/compile-validation.test.ts`. Mirror
      the unknown-key case in `test/cancel.test.ts`: this proves the check
      runs before the idempotent early return.
- [x] 3.15 Publish an unwritten pair on an all-automatic step, on a
      terminal step, and on an all-automatic step whose only exit is a
      timer declaring a `targetPath`. A timer-forced transition is
      automatic, so the step carries no manual path. This pins the
      manual-path scope.
- [x] 3.16 Publish a view entry naming a `group` field that declares
      `required: true` and `readonly: true` with no writer in the body.
      This pins the group skip.
- [x] 3.17 Assert a technical field's view entry carrying `required: true`
      and `readonly: true` reports only the technical-field issue.
      `checkTechnicalFields` rejects the keys; the new check reports
      nothing further. Also assert a view entry carrying the pair without a
      `ref` reports no pair issue, and does not throw.

## 4. Documentation

- [x] 4.1 State the rule in `.claude/rules/authoring-invariants.md`: the
      compile pass rejects a `view.fields[]` entry declaring literal
      `required: true` and literal `readonly: true` when no source in the
      body writes the field (writer sources per tasks 1.2-1.6). Except on a
      step carrying no manual path, on a group or technical field, on a
      ref-less entry, or on an entry declaring `visible: false`.
- [x] 4.2 State the rule in `docs/authoring-guide.md` (View section): the
      pair is a publish error unless a writer source fills the field and
      the entry sits on a step that carries a manual path. A CEL flag, a
      hidden entry, or a step with no manual path publishes.
- [x] 4.3 Run the antislop check over both files
- [x] 4.4 Verify that the placement paragraph, the last prose line before
      the first scenario, in `specs/definition-contract/spec.md` carries
      the two-criterion framing. It was reworded during authoring: the
      sibling `allow-schema-refinement-tightening` archived 2026-08-23, and
      its placement rule is already live in the base spec.
- [x] 4.5 Run the antislop check over the change's own four artifacts
      (`proposal.md`, `tasks.md`, `design.md`,
      `specs/definition-contract/spec.md`). Clear every finding, or add a
      targeted `<!-- antislop: allow <rule> -->` with a one-line reason
      where a rule misfires. New files lint against a base of zero, so the
      prose gate blocks the push otherwise. The delta spec's requirement
      text merges verbatim into `openspec/specs/definition-contract/spec.md`
      at archive, where prose.sh then measures it against the live spec's
      baseline. Clearing it here is also the archive-time gate.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, and report what it printed
- [x] 5.2 Run `bun run build`, and report what it printed
- [x] 5.3 Run the full `bun test` with `DATABASE_URL` set
- [x] 5.4 Check the skip count against `scripts/gates/skip-floor.txt`
- [x] 5.5 Run `sh scripts/gates/prose.sh < /dev/null`
- [x] 5.6 Run `sh scripts/gates/whitespace.sh < /dev/null`
