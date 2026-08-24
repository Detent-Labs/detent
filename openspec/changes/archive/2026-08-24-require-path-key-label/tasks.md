## 1. Schema, fixtures, and examples (one atomic step)

Schema tightening, the test-fixture sweep, and the example backfill land
together, in the same commit, before any verification run. Landing 1.1
alone first breaks the bulk of the publish-path suite. Most of `test/*.ts`
expects paths without a `label` to publish successfully today.
`test/cross-process.test.ts:186` publishes
`subprocess-loan-parent.json`/`subprocess-credit-check-child.json`
directly. Those two examples must already carry `label` before 1.1 lands.
Do not run `bun test` between these sub-tasks. Treat 1.1 through 1.6
as one atomic step: between 1.5 and 1.6 the suite stays red on the stale
`PRE_CHANGE_HASHES` literals.

- [x] 1.1 In `src/schema/definition.ts`, tighten the `path` object: `key:
      z.string().trim().min(1)`, `label: z.string().trim().min(1)` (drop
      `.optional()`). In the same edit, correct the comment at
      `definition.ts:49-51` that calls Path label/description
      "Authoring-facing-only... never rendered to a process participant" —
      `PathButtons.tsx:17` renders `path.label ?? path.key` to a
      participant today.
- [x] 1.2 Audit every other reader of `Path` (`checkPathTriggerConsistency`
      and its `PathTriggerCandidate` interface, the migration/timer checks
      in `definition.ts`, `strip-compiled.ts`) for an assumption that
      `label` may be absent, fix any found, and record the audit's outcome
      (what was checked, what was found) in the commit message.
- [x] 1.3 Mechanical sweep, `test/*.ts`: give every local path-builder
      helper a default non-empty `label` derived from its existing
      arguments (`manualPath`/`autoPath` in `automatic.test.ts`,
      `cancel.runtime.test.ts`, `migration.test.ts`, `subprocess.test.ts`,
      `transition.test.ts`), then add a `label` to every remaining inline
      path literal in `test/*.ts` that lacks one (~35 files, about 140 literals;
      `runtime-api.test.ts` alone carries roughly 26 such literals). This is
      a large mechanical sweep across the suite, not a single rejection
      test — treat it as its own pass, file by file, confirming each
      touched file still compiles before moving to the next. The sweep also covers
      `packages/web/test/studio-draftValidationLogic.test.ts`: the one web
      test that parses a label-less path through
      `authoredProcessBody.safeParse` and asserts `zodValid === true`. Two of these files feed negative
      tests, where a missing label would not go red but go vacuous:
      `validate.test.ts`'s literals feed a `rejects` mutation helper that
      asserts `safeParse` failure, and `cel.test.ts`'s feed
      CEL-validation checks. There the added label keeps the body
      schema-valid, so the rejection under test keeps firing for its own
      reason, not for a missing label.
- [x] 1.4 Audit all four example definitions
      (`purchase-requisition.json`, `expense-approval.json`,
      `subprocess-loan-parent.json`, `subprocess-credit-check-child.json`)
      for any path with an empty/missing `key` or `label`. Expect misses only in the two
      subprocess files (five paths: three in `subprocess-loan-parent.json`,
      two in `subprocess-credit-check-child.json`). A miss anywhere else is
      drift; fix it the same way.
- [x] 1.5 Add a non-empty, meaningful `label` (and `key`, wherever task 1.4
      found one empty) to every path missing one.
- [x] 1.6 `test/view-layout-hash.test.ts` hardcodes `PRE_CHANGE_HASHES` for
      `subprocess-credit-check-child.json` and `subprocess-loan-parent.json`.
      Task 1.5's label additions to those two files change their
      `definitionHash` (the JCS hash of the canonicalized `ProcessBody`), so
      both literals go stale. After 1.5 lands, take a fresh measurement for
      each — `definitionHash(processBody.parse(bodyOf(file)))`, run against
      the post-edit body and the current schema — and update
      `PRE_CHANGE_HASHES` with the new values, following the file's
      documented convention for prior updates (`give-the-example-a-
      reachable-target`, `dedup-runtime-pagination-webhook-sink`). The
      docstring currently states the two subprocess literals "keep their
      original provenance ... and neither file has changed since" — task
      1.5 makes that sentence false, so rewrite the passage for these two
      files the way the `expense-approval.json` entry reads (a fresh
      measurement against the CURRENT schema), and name
      `require-path-key-label` as the reason the literals moved.

## 2. Studio: derived path defaults

- [x] 2.1 In `packages/web/src/areas/studio/draft/createPath.ts`, update
      `newPath()` to this ordered parameter list: the source `DraftStep`,
      the target `DraftStep` (typed `DraftStep | undefined`, so the
      dangling-`to` case still resolves), the current `to: string |
      undefined` (it stays, so the dangling case can set `to` from the
      original id), the current `trigger: PathTrigger` (unchanged —
      `insertOnPath.ts` still passes the retargeted path's trigger per the
      base spec), `contentLocale`, `baseLocale`, and the resolved
      `unnamedStepPlaceholder` string, and derive `key` and
      `label` from them at creation time. `Step.label` is a multi-locale
      `LocalizedText` map; deriving a plain display string needs
      `resolveDraftLocalizedText(value, contentLocale, baseLocale)` (the
      same helper `stepLabel()` uses in `CanvasView.tsx`) before either step
      label reaches the derivation helper, since `createPath.ts` is a pure
      module with no React/locale context of its own. The same purity means the helper cannot
      resolve `t("steps.unnamedStep")` itself: `newPath()` takes the
      already-resolved placeholder string as one more parameter, and every
      call site resolves it via the studio catalog's `t` (`CanvasView.tsx`
      both branches, `PathsPanel` for "add path", and `EditScreen.tsx`
      passing it through `insertOnPath()` alongside the two locale args).
- [x] 2.2 Write the label-derivation helper: `"<source label-or-key> →
      <target label-or-key>"`, reading "label-or-key" per side as the
      label when non-empty after trimming, else the key when non-empty
      after trimming, else the placeholder. Write the key-derivation helper: a slug
      built the same way, lower-cased with runs of non-alphanumeric
      characters collapsed to a single hyphen, applied to each already-
      resolved label/key string, in this order: strip each side's slug of
      leading and trailing hyphens, let an empty side fall back to the
      placeholder's slug (computed and stripped by the same pipeline),
      then join the two sides with a single hyphen.
      The helper tests assert exact strings on that order, e.g. `"!!!"`
      to `"???"` yields `unnamed-step-unnamed-step` — the same normalization the
      derived path's `key` needs regardless of the exact fallback chosen for
      the label helper. A side whose slug trims to empty (a step named with
      no alphanumeric characters at all, e.g. `"!!!"`, which has a label
      and so never reaches the unnamed-step placeholder) contributes the
      placeholder's slug instead — the joined `key` never comes out empty,
      since the new schema rejects exactly that. Cover this case in the
      helper tests too. When a step's key and label are both empty (the
      state a freshly created, unrenamed step sits in —
      `key: ""` hardcoded by `newStep()`, an empty label passed by its
      callers via `seedLocalizedText()`, no auto-rename on creation), fall back to the "unnamed step" placeholder
      string the caller resolved from the `steps.unnamedStep` i18n key
      `CanvasView.tsx`'s own `stepLabel()` helper already falls back to
      (`CanvasView.tsx:641`) — see design.md's
      Decisions section for why this borrows only that placeholder string,
      not `stepLabel()`'s key-first priority order. Give both
      helpers `bun:test` coverage as pure functions, independent of
      rendering, in `packages/web/test/studio-createPath.test.ts` (new),
      including this empty-key-and-label case.
- [x] 2.3 Update every call site: the canvas's drag-to-connect-to-a-step
      branch (`CanvasView.tsx:608`), its drag-to-empty-canvas branch
      (`CanvasView.tsx:616`, which creates the new step first, then must
      pass that step into `newPath()`), and `insertOnPath.ts:34` — the
      step-dropped-on-a-path gesture reached from `EditScreen.tsx:320`. At
      `CanvasView.tsx:608`, the drop-gesture result carries
      `result.targetStepId` as a bare `string`
      (`dropGesture.ts`'s `{ kind: "connect-to-step"; targetStepId: string;
      trigger: PathTrigger }`), not a `DraftStep`; resolve it first via
      `steps.find((s) => s.id === result.targetStepId)` before calling
      `newPath(sourceStep, targetStep, result.targetStepId, result.trigger,
      contentLocale, baseLocale, unnamedStepPlaceholder)`.
      `sourceStep` is already resolved and in scope at that point
      (`CanvasView.tsx:594-595`), and the full draft step list `steps` is
      in scope too. In `insertOnPath.ts`, the new path's source is
      `insertedStep` — already a full `DraftStep`, needing no
      resolution — NOT the file's own local `const sourceStep = steps.find(
      ...)` (`insertOnPath.ts:22`), which names the ORIGINAL, pre-insert
      step being retargeted. `insertOnPath()` currently passes `newPath()`
      a bare target step id (`oldTarget`, a `string`); resolve the
      corresponding `DraftStep` from `steps` by that id
      (`resolvedTargetStep = steps.find((s) => s.id === oldTarget)`), then
      call `newPath(insertedStep, resolvedTargetStep, oldTarget, trigger,
      contentLocale, baseLocale, unnamedStepPlaceholder)` — the new path names the freshly inserted step, per the
      studio-canvas spec's "path to a freshly created, unnamed step"
      scenario and design.md's stated behavior that the new step takes
      over the path, not the pre-insert `sourceStep`. A draft path's `to`
      can dangle (a deleted target step leaves the path in place), so
      `resolvedTargetStep` can come back `undefined`: pass the target
      side of the derivation the `steps.unnamedStep` placeholder in that
      case, the same fallback task 2.2's helper already accepts. Add a
      dangling-`to` case to `packages/web/test/studio-insertOnPath.test.ts`. `CanvasView.tsx`
      already has `contentLocale` and
      `draft.baseLocale` in scope (`CanvasView.tsx:113,116`); pass them
      through at each of its two call sites. `insertOnPath.ts` is a pure
      module with no React/locale context of its own (the same reason
      `createPath.ts` needs the params passed in), so this also adds
      `contentLocale`/`baseLocale` params and the resolved
      `unnamedStepPlaceholder: string` param to `insertOnPath()`'s own
      exported signature, to thread through to its `newPath()` call.
      Update its one production caller, `EditScreen.tsx:320`
      (`contentLocale` and `draft.baseLocale` are already in scope there
      via `useDraft()` at `EditScreen.tsx:76` — `draft.baseLocale` is
      `string | undefined`, so coalesce it with `?? "en"` as task 2.5
      does — and the placeholder resolves via the catalog's `t`, already
      imported there), and every
      call site in `packages/web/test/studio-insertOnPath.test.ts` (six
      calls) to pass the three new arguments.
- [x] 2.4 Cover the drag-to-empty-canvas shape in
      `packages/web/test/studio-createPath.test.ts`: the just-created step
      (empty `key`, empty label) flows into `newPath()` as the target,
      and the target side comes out as the placeholder, not an empty or
      arrow-only string (the `insertOnPath.ts` dangling-`to` case is
      task 2.3's test).
- [x] 2.5 Rework `PathsPanel`'s "add path" action (`PathsPanel.tsx:53`) so
      it no longer creates a path against `steps[0]` as a stand-in target.
      Add one target `<select>` above the path list, populated the same way
      the per-row `to` select is (reusing its rendering), defaulting
      to no selection. Disable "add path" until that select holds a value, in addition to
      the existing `steps.length === 0 || terminal` conditions
      (`PathsPanel.tsx:156`) — the terminal guard stays as a Props-level
      invariant, regardless of the current caller gating the panel away
      for a terminal step.
      `PathsPanel`'s own `Props` (`PathsPanel.tsx:15-33`) carry the
      full step list `steps: DraftStep[]` (line 17) and a bare
      `stepId?: string` (line 20); the panel's own source step never
      arrives as a resolved `DraftStep`. Resolve it via
      `steps.find((s) => s.id === stepId)` before calling `newPath()` — `stepId` is always provided at the one call site,
      `StepsPanel.tsx:281` passes `step.id` (`StepsPanel.tsx:285`). The
      find returns `DraftStep | undefined`; guard the click (stay disabled
      when the source step does not resolve) rather than widening
      `newPath()`'s source param — the one call site always resolves in
      practice. On
      click, call `newPath(sourceStep, targetStep, targetStep.id, "manual",
      contentLocale, baseLocale, unnamedStepPlaceholder)` with both the
      resolved source step and the chosen, already-resolved target step, append the result, and reset the
      target select to empty. Thread `contentLocale`
      and `baseLocale` into `PathsPanel`'s `Props` from its parent,
      `StepsPanel.tsx`, which already holds both via `useDraft()`
      (`StepsPanel.tsx:73`) — see design.md's Decisions section for why
      target-first creation, not re-derivation on `to`-change, is the fix.
      `useDraft()` at `StepsPanel.tsx:73` destructures `contentLocale`
      directly, but `baseLocale` comes back only as `draft.baseLocale`,
      typed `string | undefined`; `StepsPanel.tsx` computes `const
      baseLocale = draft.baseLocale ?? "en"` (matching `CanvasView.tsx:116`)
      before passing it into `PathsPanel`'s props, since task 2.1's
      `newPath()` signature takes a plain non-optional `string`. Add the select's new string keys to
      `packages/web/src/i18n/catalogs/studio.ts` (English-only catalog; a
      missing key fails `CatalogKey` typecheck). The placeholder reuses the
      existing `paths.selectTargetStep` (`studio.ts:102`).

## 3. Tests

The rejection tests land in `test/validate.test.ts`. They go in a new
`describe("definition-contract: A path carries a non-empty key and a
non-empty label")` block. This invariant is a Zod refinement in
`definition.ts`, not a `compileProcessBody` write-path check (see
design.md's Decisions section). It belongs with that file's other
`definition-contract` schema-level rejection tests, not with
`test/compile-validation.test.ts`. That file scopes itself to the six
structural write-path checks `compileProcessBody` adds.

- [x] 3.1 Add a rejection test for an empty-string `Path.key`.
- [x] 3.2 Add a rejection test for a whitespace-only `Path.key`.
- [x] 3.3 Add a rejection test for a missing `Path.label`.
- [x] 3.4 Add a rejection test for an empty-string `Path.label`.
- [x] 3.5 Add a rejection test for a whitespace-only `Path.label`.
- [x] 3.6 Add a rejection test covering an automatic path with no `label`,
      confirming the rule applies identically to both trigger kinds.
- [x] 3.7 Add a passing test for a path with a trimmed non-empty `key` and
      `label`.
- [x] 3.8 Add a `newPath()` composition test in
      `packages/web/test/studio-createPath.test.ts`: two named steps in,
      and the
      returned `DraftPath` carries the derived `key`/`label` pair (the
      helpers' own cases are task 2.2's), and a later rename of either
      step leaves that pair untouched (the spec's no-resync scenario).
- [x] 3.9 Add the example-sweep guard design.md's Risks section names: for
      each of the four example files, assert every path carries a non-empty
      `key` and `label`. It lands in `test/validate.test.ts` beside 3.1-3.7
      and fails loudly on any example with an empty or absent `label`
      still in it.

## 4. Documentation

- [x] 4.1 Add the new-path-name rule to `.claude/rules/process-contract.md`
      (the "Paths" section).
- [x] 4.2 Add the new rule to `.claude/rules/authoring-invariants.md`, and
      narrow that file's existing "`Step.key`/`Path.key` stay
      unconstrained: nothing reads them as identifiers" sentence to format
      only ("`Step.key`/`Path.key` stay format-free: nothing reads them
      as identifiers"), so the file stops contradicting the rule it gains.
- [x] 4.3 Update `docs/authoring-guide.md` with the new requirement.
- [x] 4.4 Register task 5.6's four manual checks in
      `docs/browser-checks.md` (the repo's home for checks that stay
      manual), as a new `### Studio: path creation names` section. The
      checks stay manual per `development-toolchain`'s split rule: no
      defect record exists for the behavior they verify.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and resolve every error.
- [x] 5.2 Run `bun run build` and resolve every error.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the skip count against `scripts/gates/silent-green.sh`.
      Never rely on a single-file rerun.
- [x] 5.4 Run `sh scripts/gates/prose.sh` over every Markdown file this
      change touched.
- [x] 5.5 Run `sh scripts/gates/whitespace.sh` over the same range.
- [x] 5.6 Exercise every path-creation gesture in a real browser (the
      root CLAUDE.md verification gate for any UI change; see
      docs/browser-checks.md): drag-to-connect between two named steps
      (derived label visible in the Paths tab), drag to empty canvas and a
      step dropped on a path (unnamed-step placeholder), and PathsPanel's
      "add path" (disabled with no target chosen, enabled after a
      selection, the target select resetting after the add).
