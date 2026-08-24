## Why

A `view.fields[]` entry may declare `required: true` and `readonly: true`
together whenever "some source in the body writes the field." The intent is
that the field already holds a value by the time the participant reaches the
entry's own step. Requiring it while forbidding edits there is then safe.

Both the publish-time check and the studio's live gate treat the same thing
as a writer. That thing is another editable view entry anywhere else in the
process, with no check on step order. The publish-time check is
`compile.ts::checkUnsatisfiableRequiredReadonly`. The live gate is
`writtenFieldCounts`/`writtenByOther` in `draft/view-flags.ts`, shared by
the field matrix and the form editor.

Reproduced live: a process `start -> middle -> end` has a field editable on
all three steps. An author can set `required: true` plus `readonly: true` at
`start`, the first step. No warning appears anywhere, and a publish would
succeed. Both `middle` and `end` count as writers, even though neither step
can run before the participant reaches `start`.

The resulting entry is unsatisfiable. The participant cannot supply the
value, since it is readonly. Nothing has supplied it yet, since nothing
precedes `start`. Every submission from that step fails validation with no
way to recover. The same gap applies to an action-output writer. It may sit
on a step not guaranteed to run before the entry's own step.

## What Changes

- The write-path check and the studio's live gate stop treating "written
  somewhere in the process" as enough. A writer for step S can be an
  editable entry, an action output, or a subprocess output mapping. Each
  sits on another step, and counts only when that step dominates S.
  Dominance means every path from the initial step to S passes through it
  first.
- Structural writers that are not step-scoped stay as they are. A column
  mapping's target attribution, a contract input field, and a catalog
  default apply body-wide, not to one step. One exception narrows the same
  way as the rest. A column mapping's own editable-elsewhere placement test
  is step-scoped too (see below).
- The two checks keep sharing one written/dominance computation. That
  follows an existing design decision. `checkViewFlags`'s own finding, the
  field matrix's flagged-cell marker, and `gatedKeys` must never disagree
  about what "already written" means.
- The field matrix and form editor's live gate (`gatedKeys`, `isFlagGated`)
  pick up the same dominance rule automatically. So does the "already
  written elsewhere carries no marker" Checks-rail finding. Both read the
  shared computation.
- **BREAKING** (definition-contract, publish-path only): a body can publish
  today because a same-field editable entry sits on a non-dominating step.
  That body fails to publish under the new rule. A non-dominating step is,
  for example, a later step. It could also be a step reachable only via a
  different branch.
- This also narrows the own-step timer case. Today's `computeWriterSet`
  counts any timer `onFire` output on the entry's own step
  unconditionally, with no `!own` gate. Under the new rule, an own-step
  reminder timer with no `targetPath` no longer counts as a writer. Only an
  own-step timer whose `onFire` declares a `targetPath` does.
- A body may rely on a plain own-step reminder timer as the sole writer for
  a required+readonly pair. That body fails to publish under the new rule.
  No published version becomes invalid after the fact. This only affects a
  new publish of an edited body, consistent with the project's placement
  rule for write-path invariants.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `definition-contract`: a requirement narrows two phrases, "an editable
  entry on another step" and "an action output on another step." The
  requirement is "A view entry declaring literal `required: true` and
  literal `readonly: true` names a field some source writes." Each phrase
  now means a step that dominates the entry's own step, rather than any
  step in the body.
- `studio-app`: the field matrix's required/readonly gating (`gatedKeys`)
  picks up the same dominance-based definition of "written elsewhere."
  That replaces "editable anywhere else in the draft." So does its "already
  written elsewhere carries no marker" Checks-rail finding.
- `studio-form-editor`: the field strip's required/readonly gate reads the
  same dominance-scoped `gatedKeys`/`written` computation the field matrix
  now uses. Its "no other source in the draft writes a selected field" rule
  narrows the same way.

## Impact

- `src/schema/compile.ts` (`checkUnsatisfiableRequiredReadonly`): new
  dominance computation over the step graph, reused instead of a flat
  writer-presence check.
- `packages/web/src/areas/studio/draft/view-flags.ts`
  (`writtenFieldCounts`/`writtenByOther`): same dominance computation,
  shared with the compile pass's semantics so the two never disagree.
- `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts` and
  `panels/FieldMatrixGrid.tsx`: DO need a signature change. Dominance is
  step-relative. `writtenFieldCounts`'s flat, once-per-draft
  `Map<fieldId, number>` cannot answer "written before step S" for every
  step. It cannot do that from one shared computation. `writtenByOther`,
  `gatedKeys`, `isFlagGated`, `cellEligible`, `eligibleTargetEntries`,
  `bulkBadgeOn`, `applyBulkToggle`, and `isCellFlagged` each gain a step
  parameter. That parameter is the entry's own step id or index. It lets
  each one consult the right per-step dominance answer.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: same reason.
  Its `gatedKeys(row, written, technicalFieldIds)` call gains the selected
  field's own step parameter.
- New shared step-graph dominance helper. `design.md` decides its exact
  placement. It likely sits alongside existing engine graph-walking code
  (path resolution). It could also be a new small module under
  `src/schema/` or `src/engine/`, if the engine needs it too. Either way it
  gets mirrored or imported into the web package's draft layer. This
  matches how `writtenFieldCounts`'s existing structural rules already stay
  in parity by hand between the two layers today.
- `package.json`'s `exports` map: changes only if the helper needs a new
  export path beyond the existing `./schema/compile` (see `design.md` §
  Decisions).
- Test coverage: two existing `definition-contract` scenarios need new
  sibling scenarios. One is "An editable entry on another step makes the
  entry publishable." The other is "A pre-gate action output makes the
  entry publishable." The siblings cover a non-dominating step, such as a
  later step, or a step reachable only via a sibling branch. The existing
  dominating cases must keep passing.
- Existing test files: `test/compile-validation.test.ts`,
  `packages/web/test/studio-viewFlags.test.ts`,
  `packages/web/test/studio-fieldMatrix.test.ts`,
  `packages/web/test/studio-fieldMatrixGrid-bulkBadges.test.tsx`,
  `packages/web/test/studio-formEditor-strip.test.tsx`: restructured per
  tasks.md § 2.3/3.4/3.6.
- `docs/authoring-guide.md`: the View section's required+readonly paragraph
  gets rewritten to state the dominance condition. It replaces the
  unqualified "editable entry on another step" rule.
