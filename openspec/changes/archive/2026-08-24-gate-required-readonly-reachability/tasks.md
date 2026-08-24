## 1. Shared dominance helper (engine)

- [x] 1.1 Add a step-graph dominance helper to `src/schema/compile.ts` (or a
      new sibling module it re-exports, e.g. `src/schema/step-graph.ts`),
      duck-typed like `computeWriterSet`/`stepHasManualPath` so it works on
      both a pre-parse authored body and, later, the studio's `Draft` shape.
      Input: an array of step-like objects (`id`, `paths[].to`) and an
      `initialStep` id — the helper takes no `timers[].onFire` input, since
      a timer's `targetPath` already names one of the step's own `paths`
      (design.md § Decisions, Edges) and so contributes no separate edge;
      `computeWriterSet`/`writtenFieldCounts` consult the timer's
      `targetPath` directly, outside this helper, per task 2.1/3.1. Output:
      for each step id, the set of step ids that dominate it (iterative
      dataflow fixpoint per design.md § Decisions, not a dominator-tree
      library). Verify with a standalone unit test covering: a linear chain
      (start→middle→end — start dominates all three, middle dominates
      middle/end only, end dominates only itself), a diamond branch
      (A→B,A→C,B→D,C→D — A dominates D, neither B nor C does), a cycle
      (a path back to an earlier step does not make the later step
      dominate the earlier one), an orphan step with no incoming edge
      from any other step (per design.md § Decisions, its `Dom` set stays
      the full universal set — every other step's id is in it — since this
      is the vacuous-dominance outcome for an unreachable step, not a bug),
      and an `initialStep` id that does not resolve to any step in the
      input (absent from the step array, or `undefined`, matching the
      studio Draft's partial-typing case): the helper does not throw, and
      every step's `Dom` set is the full universal set — the same vacuous-
      dominance outcome the orphan-step case documents, since with no
      resolvable `initialStep` no step has a `Dom` seed to narrow against.
      A fifth case exercises `initialStep`'s own exclusion from the
      per-step recomputation loop (design.md § Decisions, Algorithm): a
      2-step cycle with `initialStep = "A"`, edges `A -> B` and `B -> A`;
      assert `Dom("A")` is exactly `{"A"}` (does not contain `"B"`, even
      though `B` is a predecessor of `A`) and `Dom("B")` is `{"A", "B"}`.
- [x] 1.2 Export the helper via the package's `exports` map so
      `packages/web` can import it (reuse the existing
      `workflow-engine/schema/compile` export path, or add a new one if the
      helper lives in its own module) and verify `bun run build` still
      produces a valid package (the exports map's declared paths resolve).

## 2. Publish-time check (`compile.ts::checkUnsatisfiableRequiredReadonly`)

- [x] 2.1 In `computeWriterSet` (`src/schema/compile.ts`), thread the
      per-field `editableSteps` map (already built for the columnMapping
      rule) and the new dominance sets from task 1.1 into the action-output,
      subprocess-output-mapping, and editable-entry-elsewhere branches: each
      now counts only when the writing step dominates `ownStepIndex`,
      keeping the existing own-step post-gate exclusion
      (`onExit`/`onPath`/`onCancel`) otherwise — and the columnMapping
      editable-elsewhere test too: narrow its
      `editSteps.some((si) => si !== ownStepIndex)` check to
      `editSteps.some((si) => si !== ownStepIndex && dominates(si,
      ownStepIndex))`. The columnMapping target's own attribution (which
      field the mapping writes) and `contract.inputFields` and literal
      catalog `default` stay body-wide, untouched — only columnMapping's
      editable-placement test is step-scoped and gains the dominance
      constraint. The timer `onFire` branch is a structurally separate code
      path from the plain action-output branch and needs its own explicit
      change: it currently adds every `timers[].onFire.actions` output with
      no `!own` gate at all (`(s?.timers ?? []).forEach((t) =>
      addOutputs(t?.onFire?.actions))`), so an own-step reminder timer (no
      `targetPath`) over-counts today. Gate it so a timer's `onFire` output
      counts only when the writing step dominates `ownStepIndex` AND (the
      writing step is not `ownStepIndex`, OR that step's timer declares a
      `targetPath`) — an own-step reminder timer with no `targetPath` does
      NOT count, matching the "only at `onEntry`, or at S's own step's timer
      `onFire` declaring a `targetPath`" wording in
      `specs/definition-contract/spec.md`. Mirror this same timer clause on
      the studio side in task 3.1.
- [x] 2.2 Update the doc comment above `checkUnsatisfiableRequiredReadonly`
      (the `// ====` block and the function-level comments on
      `computeWriterSet`) to state the dominance rule and point at
      design.md's Decisions section, replacing the now-stale "duplicated
      here rather than imported" note for the parts that now ARE shared via
      task 1.1/1.2.
- [x] 2.3 Add/adjust `test/*.test.ts` (wherever
      `checkUnsatisfiableRequiredReadonly`'s existing scenarios live) for
      the new and changed scenarios in
      `openspec/changes/gate-required-readonly-reachability/specs/definition-contract/spec.md`:
      "An action output on a non-dominating step does not make the entry
      publishable", "An editable entry on a later step does not make the
      entry publishable", "An editable entry on a sibling branch step does
      not make the entry publishable", "A column mapping on a non-dominating
      step does not make the entry publishable", "A timer's onFire output on
      a non-dominating step does not make the entry publishable" (mirroring
      the action-output scenario, but with the writer positioned as a
      `timers[].onFire.actions` entry on a step reachable only after, or
      only via a sibling branch from, the entry's own step — today's
      `computeWriterSet` adds a timer's `onFire` outputs with no `!own`
      gate at all, so this case currently over-counts unconditionally, the
      same bug class this change fixes elsewhere), and "A body whose
      `initialStep` does not resolve to any step, combined with an
      unwritten required+readonly pair, does not throw" — a hand-authored
      body reaches `checkUnsatisfiableRequiredReadonly` (and the dominance
      helper it calls) on the duck-typed, pre-Zod-parse body inside
      `structuralIssues` before `definition.ts`'s Zod `superRefine` ever
      enforces `initialStep` resolution (see design.md § Decisions,
      Partial/draft tolerance), so this case is reachable at compile time
      and must not throw; assert only that `compileProcessBody` does not
      throw a `TypeError` (the same shape task 1.1's dangling-`initialStep`
      dominance-helper case exercises one layer down) — the existing
      `initialStep`-resolution rejection stays covered by `definition.ts`'s
      own Zod test, untouched by this change. The existing
      "publishes a pair an action output writes on another step" /
      "publishes a pair a subprocess outputMapping writes" / "publishes a
      pair a columnMapping target writes ... editable on another step" /
      "publishes a pair an editable view entry ... on another step" tests
      (`unwrittenPair()`, lines 664-668) all place the required+readonly
      pair on `step_a`, which `baseBody()` (lines 29-47) sets as
      `initialStep`, and place the writer downstream on `step_b` or an
      orphaned `step_c`. Per design.md's algorithm, `Dom(initialStep) =
      {initialStep}` is fixed and never grows, so nothing but `step_a`
      itself can ever dominate `step_a` — under the correctly-implemented
      rule this is the NON-dominating case, and every one of these tests
      would flip from publishing to rejecting, not "keep passing." These
      tests MUST BE RESTRUCTURED, not merely renamed: add a third step
      `step_c` reached from `step_a` via `step_b` (`step_a` -> `step_b` ->
      `step_c`), move the required+readonly pair's view entry onto
      `step_c`, and keep each test's writer on `step_a` or `step_b` — both
      genuinely dominate `step_c` now. The "publishes a pair a subprocess
      outputMapping writes" test is the one exception to "keep each test's
      writer on `step_a` or `step_b`": its writer is not an action on an
      existing step but a whole extra `type: "subprocess"` step the fixture
      itself creates, today literally id/key `step_c`/`c`, reached by its
      own path to `step_b`. Restructuring it verbatim would collide with the
      new dominating third step also named `step_c`. For this test only,
      rename the fixture's existing subprocess writer step's id and key
      from `step_c`/`c` to `step_b_sub`/`b_sub`, keep it reached via a path
      from the new dominating chain's `step_b`, and reserve the id/key
      `step_c`/`c` exclusively for the new third step that now holds the
      required+readonly pair, per this task's `step_a` -> `step_b` ->
      `step_c` chain — so `step_b_sub` sits on the path `step_b` must take
      to reach `step_c` and genuinely dominates it, the same relationship
      `step_a`/`step_b` hold for the other three tests. Give `step_c` a
      manual path to a new terminal `step_d` (or otherwise ensure `step_c`
      carries a manual path), rather than making `step_c` itself terminal:
      `checkUnsatisfiableRequiredReadonly` skips a step outright when
      `!stepHasManualPath(s)`, and the base and delta specs both exempt "a
      pair on an all-automatic step or a terminal step" from ever
      stranding, so a terminal `step_c` would make the required+readonly
      check on it a no-op and every restructured "publishes" test below
      would pass vacuously regardless of whether the dominance/writer logic
      under test is correct. Reuse today's
      original, unmodified `unwrittenPair()`/`step_a`-writer-on-`step_b`
      topology as the NEW "on a non-dominating step" negative scenario for
      each of
      these four cases (it already produces exactly that topology, since
      nothing but `step_a` dominates `step_a`) — this satisfies the
      "action output on a non-dominating step" / "editable entry on a
      later step" / "column mapping on a non-dominating step" scenarios
      task 2.3 already lists above, rather than requiring new fixture
      code for them. Separately, flip the existing "publishes a pair the
      entry's own step's reminder timer onFire writes" test (lines
      716-722): it places the required+readonly pair on `step_a` and a
      timer with no `targetPath` in `step_a`'s own `timers`, then asserts
      `compileProcessBody` does NOT throw — under this task's own
      own-step-reminder-timer exclusion (no `targetPath` => does not
      count), that premise is now false and the scenario must reject.
      Replace its body with `const err = rejects(b); expect(err.issues
      .some((i) => i.value === "field_amount")).toBe(true);`, matching
      the "An own-step reminder timer's output does not make the entry
      publishable" scenario already in this change's
      `specs/definition-contract/spec.md`. Verify with `bun test` (see § 5).
- [x] 2.4 Update `docs/authoring-guide.md`'s View section (the paragraph
      beginning "A view entry that declares `required: true` and
      `readonly: true` together", currently lines 260-265). Rewrite "or an
      editable entry on another step" to state the dominance condition,
      e.g. "or an editable entry on a step that dominates it — every path
      from the process's start necessarily passes through that step
      first" — mirroring the new `definition-contract` spec wording, so
      the guide stops documenting the pre-change, unqualified rule.
- [x] 2.5 Update `.claude/rules/authoring-invariants.md`'s required+readonly
      bullet (the "A `view.fields[]` entry declaring literal `required: true`
      and literal `readonly: true`..." bullet). Replace "or an editable entry
      elsewhere in the body" with wording that states the dominance
      condition, mirroring the `definition-contract` delta spec's phrasing —
      e.g. "or an editable entry on a step that dominates the entry's own
      step" — so this CLAUDE.md-designated authoritative rule file stops
      describing the pre-change, step-order-blind rule once `compile.ts` and
      the studio enforce the narrower one.

## 3. Studio live gate (`draft/view-flags.ts`)

- [x] 3.1 Update `writtenFieldCounts`'s contract to be step-aware: dominance
      is inherently step-relative (an entry at `start` can dominate `middle`
      and `end` without the reverse holding), so a single flat count
      computed once per draft and shared across every step's cells cannot
      encode "written, guaranteed before step S" per S. Update
      `writtenFieldCounts` (`packages/web/src/areas/studio/draft/
      view-flags.ts`) to return a step-aware shape — e.g.
      `Map<fieldId, Map<stepIndex, number>>` pre-filtered through the
      dominance sets from task 1.2 (only a writer whose own step dominates
      `stepIndex` contributes to that `stepIndex`'s count), or an
      equivalent `(fieldId: string, ownStepIndex: number) => number`
      accessor. Thread a `stepIndex`/`ownStepId` parameter through every
      consumer: `writtenByOther`, `gatedKeys`, `isFlagGated`, `cellEligible`,
      `eligibleTargetEntries`, `bulkBadgeOn`, `applyBulkToggle`
      (`panels/fieldMatrixLogic.ts`), and `isCellFlagged`
      (`panels/fieldMatrixLogic.ts`). Mirror the engine's `computeWriterSet`
      change from task 2.1: apply the dominance test to the action-output,
      subprocess-output-mapping, and editable-entry-elsewhere cases. This
      includes the timer `onFire` clause: a timer's
      `onFire` output counts only when the writing step dominates the
      cell's own step AND (the writing step is not the cell's own step, OR
      that step's timer declares a `targetPath`) — an own-step reminder
      timer with no `targetPath` does not count, matching task 2.1's
      engine-side change. Keep the function's two documented engine divergences
      (literal-default exclusion stays engine-only; columnMapping-target
      attribution regardless of its own placement stays studio-only) — the
      dominance constraint on the step-scoped cases is new, and so,
      ADDITIONALLY, is closing the studio's own pre-existing gap, not merely
      layering dominance on top of it: today `writtenFieldCounts`'s
      action-output loop (`view-flags.ts` lines 174-185) applies NO own-step
      phase exclusion at all — every action list (`onEntry`/`onExit`/
      `onCancel`/`onPath`/`onFire`) is counted identically regardless of
      which step carries it, unlike `computeWriterSet`'s existing `!own`
      guard for `onExit`/`onPath`/`onCancel` on the engine side. Dominance
      alone does not close this: a step trivially dominates itself, so an
      own-step `onExit`/`onPath`/`onCancel` action would keep passing the
      dominance test and keep counting as a writer. Add the same `!own`
      guard `computeWriterSet` already has, so an action on the entry's own
      step at `onExit`, `onPath`, or `onCancel` does not count (an own-step
      `onEntry` action, and an own-step timer `onFire` declaring a
      `targetPath`, still count, per this task's own timer clause above).
      See design.md § Decisions, "Scope of what changes vs. what does not,"
      for the reasoning. Update every
      caller: `FieldMatrixGrid.tsx` and `FormEditorScreen.tsx` currently
      compute `written` once per draft via
      `useMemo(() => writtenFieldCounts(draft), [draft])` and share it
      across every cell/step — each call site instead either recomputes per
      cell's own step or passes that step through to the consumers above,
      whichever the new accessor shape supports directly. This includes
      `FieldMatrixGrid.tsx`'s own LOCAL `writtenIds` derivation (line 138,
      distinct from the exported `writtenFieldIds` function): a body-wide
      `Set<fieldId>` built by filtering the old flat `written` map for
      `count > 0`, feeding `isCellFlagged`'s call at line 309. That local
      derivation no longer type-checks or means the same thing once
      `written` becomes step-aware — replace it with a per-cell, step-aware
      lookup against the new accessor, threaded into the `isCellFlagged`
      call alongside the entry's own step index.
- [x] 3.2 Update `checkViewFlags` (`draft/view-flags.ts`) to compute its
      writer/dominance data once per draft (outside its per-step loop, for
      performance) but consult it per-entry using that entry's own step
      index — it already holds `step` in scope inside the loop and can
      supply its own index to the step-aware accessor from task 3.1, rather
      than reusing one body-wide, non-step-scoped `written` result across
      every step's entries.
- [x] 3.3 Update the doc comments on `writtenByOther`, `writtenFieldCounts`,
      `gatedKeys`, and `checkViewFlags` to state the dominance rule, the new
      step-aware contract, and cross-reference design.md, same as task 2.2
      on the engine side.
- [x] 3.4 Add/adjust `packages/web/test/*.test.ts` coverage for
      `gatedKeys`/`isFlagGated` (or wherever the existing gating tests
      live) matching the new `studio-app` spec scenarios: "A field editable
      only on a non-dominating step keeps gating engaged", plus re-verify
      "A field something else writes on a dominating step keeps both
      controls free" still passes. `studio-viewFlags.test.ts`'s `baseBody()`
      (line 156) sets `initialStep: "step_a"` the same way
      `compile-validation.test.ts`'s does — apply task 2.3's identical
      restructuring correction here: any existing "writer on another step"
      positive scenario that places the required+readonly pair on `step_a`
      and the writer on `step_b` sits on the non-dominating topology under
      the corrected rule (nothing but `step_a` dominates `step_a`) and must
      be RESTRUCTURED onto a third, genuinely-dominated step (`step_a` ->
      `step_b` -> `step_c`, pair on `step_c`, writer on `step_a`/`step_b`),
      reusing the original `step_a`/`step_b` topology, unmodified, as the
      new non-dominating negative scenario — including task 2.3's `step_c`
      manual-path requirement: give `step_c` a manual path to a new
      terminal `step_d` (or otherwise ensure `step_c` carries a manual
      path), so `stepHasManualPath` still holds and the restructured test
      exercises `checkViewFlags`'s gating rather than trivially passing via
      the all-automatic/terminal exemption. Additionally, flip the
      expectations of `studio-viewFlags.test.ts`'s "suppresses it where an
      onExit action output targets the field" / "...onCancel..." /
      "...onPath..." tests (lines 248-274, all built with
      `withViewField(baseBody(), "step_a", readonlyRequired)` and the
      writer action also placed on `step_a` — the entry's OWN step) to
      assert the flagged finding now APPEARS: per design.md § Decisions,
      "A third divergence, closed by this change rather than preserved,"
      `writtenFieldCounts`'s action-output loop gains the same own-step
      `!own` post-gate exclusion `computeWriterSet` already has, so an
      onExit/onPath/onCancel action on the entry's own step no longer
      suppresses the finding. Add sibling tests proving a DOMINATING
      OTHER step's onExit/onCancel/onPath output still clears it (writer
      on a step that dominates the entry's step, not the entry's own
      step). Also flip `studio-viewFlags.test.ts`'s "suppresses it where
      a timer's onFire action output targets the field" test (lines
      234-246): it places the required+readonly pair on `step_a` and a
      timer with no `targetPath` in `step_a`'s own `timers`, asserting
      `checkViewFlags(body)` has length 0 — task 3.1's parallel
      own-step-reminder-timer exclusion on the studio side (no
      `targetPath` => does not count) makes that premise false too.
      Replace the assertion with `expect(checkViewFlags(body))
      .toHaveLength(1)`, matching the new "An own-step reminder timer's
      output still carries the marker" scenario added to this change's
      `specs/studio-app/spec.md`. Verify with `bun test`.
- [x] 3.5 Update `checkUnwrittenTechnicalFields` (`draft/view-flags.ts`) to
      keep computing a body-wide, non-step-scoped, non-dominance,
      non-own-step-excluded writer total for the structural sources it
      needs (action output / subprocess outputMapping / columnMapping /
      contract.inputFields / timer `onFire` output), by factoring that flat,
      structural-only tally into its own small dedicated helper — mirroring
      today's pre-change `computeWriterSet`'s unconditional
      `(s?.timers ?? []).forEach(...)` addition — shared with the new
      step-aware `writtenFieldCounts` rather than derived from it. Do NOT
      reconstruct the total by folding across every step's new step-aware
      `writtenFieldCounts` entry: once that map is dominance-scoped and
      excludes an own-step reminder timer (no `targetPath`) from its own
      step's count per task 3.1, folding it would systematically miss a
      technical field whose sole writer is a same-step reminder timer —
      that timer's output is real (it fires and writes the field every
      time), the exclusion exists only to serve the required+readonly
      "guaranteed before submission" rule, and folding would wrongly report
      "no structural source writes it" for a field that does get written.
      This function is not one of task 3.1's step-aware consumers: a
      `technical` field's requiredness is forced engine-wide, not per-step,
      so its check stays body-wide even after `writtenFieldCounts`'s return
      shape changes to a step-aware structure. Add/adjust two tests: a
      technical field with a structural writer (e.g. an action `output`)
      still reports no Checks-rail finding after the shape change, and a
      technical field whose only writer is a same-step reminder timer's
      `onFire` output (no `targetPath`) still reports no Checks-rail
      finding.
- [x] 3.6 Update the three existing test files that exercise task 3.1's
      changed functions directly with hand-built fixtures carrying no
      `initialStep`/`paths` — `packages/web/test/studio-fieldMatrix.test.ts`
      (`gatedKeys`/`cellEligible`/`eligibleTargetEntries`),
      `packages/web/test/studio-fieldMatrixGrid-bulkBadges.test.tsx`
      (`bulkBadgeOn`/`applyBulkToggle`), and
      `packages/web/test/studio-formEditor-strip.test.tsx`
      (`isCellFlagged`). None of these is named elsewhere in this section;
      all three will fail to typecheck once task 3.1 adds a
      `stepIndex`/`ownStepId` parameter to each of these functions. Update
      every call site to pass the new parameter. Where a fixture's
      assertion depends on dominance actually holding or not (rather than
      merely on a field being written or not, which a single isolated
      step still expresses correctly), replace the bare `Step` object with
      a minimal `workflow.initialStep`/`paths` fixture — e.g. a 2-3-step
      linear chain — so the dominance relationship the assertion relies on
      is real rather than accidental; a fixture with no `initialStep` at
      all falls into task 1.1's vacuous-dominance case (every step
      dominates every other), which would silently make every writer
      "dominating" and mask a real dominance-scoping bug.

## 4. Studio Checks-rail finding and bulk toggle

- [x] 4.1 Verify `checkViewFlags`'s required+readonly finding
      (`draft/view-flags.ts`, updated in task 3.2) and `isCellFlagged`
      (`panels/fieldMatrixLogic.ts`, updated in task 3.1) correctly apply
      each entry's own step index to the dominance-scoped accessor from
      task 3.1 — confirm with a targeted test asserting the flagged marker
      now appears for the reproduction case (field editable at
      `start`/`middle`/`end`, `required: true` + `readonly: true` set at
      `start`), and that the flagged marker does NOT appear for a cell at
      `middle` or `end` in the same draft, since `start` genuinely
      dominates them.
- [x] 4.2 Verify `cellEligible`/`eligibleTargetEntries`/`applyBulkToggle`
      (`panels/fieldMatrixLogic.ts`, updated in task 3.1) correctly exclude
      a cell whose only other writer is on a non-dominating step, using each
      cell's own step index against the dominance-scoped accessor — add the
      `studio-app` spec's new "A bulk badge does not skip a cell written
      only on a non-dominating step" scenario as a test, and confirm the
      existing "A bulk badge skips a cell gated by the required/readonly
      rule" scenario still passes.
- [x] 4.3 Update `FormEditorScreen.tsx`'s field strip
      (`packages/web/src/areas/studio/screens/FormEditorScreen.tsx`) to pass
      the selected field's own step to `gatedKeys` per task 3.1's new
      signature, and add/adjust a test for the `studio-form-editor` spec's
      new "A field something else writes on a dominating step keeps both
      controls free" and "A field editable only on a non-dominating step
      keeps gating engaged" scenarios. If the existing "on a dominating
      step" fixture places the pair on `initialStep` and the writer
      downstream (the same topology flaw task 2.3/3.4 identify), apply the
      identical restructuring correction here: move the pair onto a
      genuinely-dominated third step and reuse the original topology,
      unmodified, as the non-dominating negative scenario. Also add a test
      for the "An own-step post-gate output does not clear gating" scenario
      (new in the `studio-form-editor` spec's "A selected field's strip
      sets its overrides and span" requirement): an `onExit`/`onPath`/
      `onCancel` action on the selected field's OWN step does not clear
      gating, per design.md § Decisions, "A third divergence, closed by
      this change rather than preserved."

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it exits clean.
- [x] 5.2 Run `bun run build` and confirm it exits clean.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun), confirm zero failures and check the skip count
      against `scripts/gates/skip-floor.txt` per `CLAUDE.md`'s
      `no-silent-green` rule — pipe through
      `sh scripts/gates/silent-green.sh` to confirm.
- [x] 5.4 In a real browser (per `CLAUDE.md`'s browser-check gate),
      reproduce the original bug scenario on a fresh draft — field editable
      on three linear steps, check `required` then `readonly` on the first
      step's cell — and confirm the `readonly` checkbox now stays disabled,
      the Checks rail flags the cell if both are set anyway (e.g. via the
      JSON surface), and publish is rejected for that draft.
