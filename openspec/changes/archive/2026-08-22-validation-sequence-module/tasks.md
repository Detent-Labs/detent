## 1. The registry check split

- [x] 1.1 Add `RegistryDescription` to `src/engine/registry.ts`, carrying the three type arrays
- [x] 1.2 Add `describeTypeNames(registry): string[]` to
      `src/engine/registry.ts`, deriving one type-name array from one live
      registry (`[...registry.keys()]`) — the same one-registry-in,
      array-out shape `GET /registry`'s own three-call idiom already uses
      (`src/http/studio-routes.ts:274-276`). Building the full
      `RegistryDescription` (task 1.1's three type arrays) takes three calls
      to `describeTypeNames`, one per registry (action, assignment, data
      source), not one call deriving the whole shape from a single registry.
      Name it `describeTypeNames`, not the generic `describe`: the module
      otherwise exports specific nouns (`Registry`, `AssignmentRegistry`,
      `PROCESS_START_ACTION_TYPE`, `createDefaultAssignmentRegistry`), and a
      bare `describe` reads as a test-framework import at any call site
- [x] 1.3 Add `resolveType(sites, typeNames, entityLabel): RegistryIssue[]` to
      `src/engine/registry-check.ts`, beside `checkTypedConfig`: the shared
      not-registered check every dimension's type-resolution half calls.
      Export the `TypedSite` interface itself (`registry-check.ts:41`),
      currently unexported: `resolveType`, `checkConfigOnly` and the three
      collectors task 1.11 adds all take or return `TypedSite[]` in their
      public signatures, so a consumer outside this file that needs to name
      the type explicitly (`src/validate.ts` included) needs it exported
- [x] 1.3a Add `checkConfigOnly(sites, resolveFn): RegistryIssue[]` to
      `src/engine/registry-check.ts`, beside `resolveType`: the shared
      config-only check that validates a site's `config` against its
      resolved type's `configSchema`, skipping a site whose type does not
      resolve with no issue of its own — `resolveType` already reports that
      site. `checkConfigOnly` takes no `entityLabel`: it emits only
      `mapConfigIssues(loc, type, zodIssues)` output, which carries no entity
      label, and it never emits a "not registered" message — that message is
      `resolveType`'s alone. `validateReferences` (task 2.3) calls this
      function directly, once per dimension, when the caller supplies a live
      registry set, to populate `actionConfigIssues`,
      `assignmentConfigIssues` and `dataSourceConfigIssues` with no
      duplicated not-registered issues. Per design.md's "The type-resolution
      half shares one implementation across all three registry checks"
      decision
- [x] 1.4 Split `checkActionRegistry` into a type-resolution half, calling
      `resolveType`, and a config half
- [x] 1.5 Split `checkAssignmentRegistry` the same way
- [x] 1.6 Split `checkDataSourceRegistry` the same way
- [x] 1.7 Refactor `checkTypedConfig` to take an added `typeNames: readonly
      string[]` parameter and compose `resolveType(sites, typeNames,
      entityLabel)` and `checkConfigOnly(sites, resolveFn)` from
      its own body, concatenating the two arrays — type-resolution issues
      first, then config issues — rather than reimplementing either half
      inline. `checkConfigOnly` already skips a site `resolveType` rejected,
      so no separate filtering step runs between the two calls —
      `checkTypedConfig` is unexported and internal, so this signature growth
      touches only its three in-file callers (tasks 1.4-1.6), which each keep
      their own public signature unchanged and pass `typeNames` derived by
      calling `describeTypeNames(registry)` (task 1.2) on their own live
      registry, not by re-inlining `[...registry.keys()]`; the emitted
      `RegistryIssue[]` stays the same, per the delta spec against
      `registry-config-check-consolidation`
- [x] 1.8 Keep `checkActionRegistry`/`checkAssignmentRegistry`/
      `checkDataSourceRegistry` exported with their existing public
      signatures, per `registry-config-check-consolidation`'s delta
      requirement, so a caller wanting one combined call over both halves
      still has one, and their existing pure-function tests
      (`registry-check.test.ts`, `assignment-registry.test.ts`,
      `data-source-registry-check.test.ts`) keep passing unchanged — even
      though `publishBody` (task 3.1) and `runValidation` (task 4.3) no
      longer call them directly
- [x] 1.9 Add `checkProcessChainingTarget(body, targetsByLoc)` to `src/cel/check.ts`,
      beside `checkSubprocessChildRefs`: a synchronous, per-site issue-collecting
      comparison half for `process.start` targets, keyed by site `loc` (do not
      import `Site` from `registry-check.js` — it collides with this file's
      own local `Site` interface; consume `collect()`'s return value
      structurally); import `collect` from `../engine/registry-check.js`
      aliased as `collectFullActionSites` — never bare `collect` — since this
      alias must stay visually distinct from task 1.11's
      `collectTypedActionSites`, a differently-shaped export from the same
      module returning `TypedSite[]` with no `.action` field that this file
      does not import; an unaliased `collect` import would risk exactly the
      mistake design.md's "Process chaining and cross-process checks split
      into a resolution half and a comparison half" decision exists to
      prevent; also import `PROCESS_START_ACTION_TYPE` from
      `../engine/registry.js`, a second necessary import alongside
      `collectFullActionSites`'s `../engine/registry-check.js` import, to
      filter sites on `action.type`; also import `collectFieldsDeep` from
      `../schema/definition.js`, a third necessary import, and build each
      target's accepted field-id set via
      `collectFieldsDeep(targetsByLoc[loc].fields).map((f) => f.id)` — group-
      container ids included, never this file's own already-imported
      `leafFields`, which filters every group container out and so would
      silently narrow the accepted set to leaves only, reopening the exact
      gap `validateProcessChaining`'s existing `collectFieldsDeep` call
      (`src/engine/definitions.ts:194`) and `cross-process-validation`'s
      "the process's full field catalog, not a `ProcessContract.inputFields`
      list" requirement both close; update this file's own header comment to
      name all three deliberate imports (`collect` from
      `engine/registry-check.ts`, aliased `collectFullActionSites`,
      `PROCESS_START_ACTION_TYPE` from `engine/registry.ts`,
      `collectFieldsDeep` from `schema/definition.ts`), not just the first
      two, per design.md's "Process chaining and cross-process checks split
      into a resolution half and a comparison half" decision; also give
      `checkProcessChainingTarget` itself a doc comment stating it parses no
      CEL and type-checks no expression, despite this file and its
      `CelIssue[]` return type — a plain field-membership check reusing that
      shape for rail-grouping parity with `checkSubprocessChildRefs` — so a
      reader landing on the function itself, not only the file header, sees
      the same boundary note
- [x] 1.10 Rewrite `validateProcessChaining` (`src/engine/definitions.ts`) to resolve
      each site's target, build `targetsByLoc` from what resolved, and delegate to
      `checkProcessChainingTarget`, throwing `CrossProcessValidationError` built
      from its issues (not `CelValidationError`) — preserving today's error class
      for this scenario, per `cross-process-validation`'s existing requirement,
      and building its thrown message from only the first collected issue's
      `loc` and `message`, in `collect()` order, per design.md's "Process
      chaining and cross-process checks split into a resolution half and a
      comparison half" decision
- [x] 1.11 Export a `TypedSite` collector per registry dimension from
      `src/engine/registry-check.ts`, beside `resolveType`:
      `collectTypedActionSites(body)`, `collectAssignmentSites(body)` and
      `collectDataSourceSites(body)`, each returning `TypedSite[]`. Name the
      action collector `collectTypedActionSites`, not `collectActionSites` —
      `src/schema/compile.ts` already has an unexported, differently-shaped
      `collectActionSites(body: any): ActionSite[]` used by
      `checkReservedActionPrefix`, in a different file. Refactor
      `checkActionRegistry`, `checkAssignmentRegistry` and
      `checkDataSourceRegistry` (tasks 1.4-1.6) to call the matching
      collector instead of inlining site collection. `validateReferences`
      (task 2.3) calls `resolveType(collectTypedActionSites(body),
      registryDescription.actionTypes, "action")`, and the matching call for
      the other two dimensions, directly against the supplied
      `RegistryDescription` — no live registry required for this half. Per
      design.md's "The type-resolution half shares one implementation
      across all three registry checks" decision

## 2. The shared validation module

- [x] 2.1 Add `src/validate.ts` with `validateStructure` and `validateReferences`
- [x] 2.2 Move duration, structural and the Zod gate stages into
      `validateStructure`, preserving `compileProcessBody`'s current order —
      duration, then structural, then Zod — per design.md's "Duration and
      structural checks keep running before the Zod gate" decision; guard
      duration/structural with the cheap `workflow?.steps` shape check that
      decision names, falling through to the Zod parse when the input is not
      shaped enough to walk; wrap the duration-and-structural attempt itself
      in a try/catch that catches `TypeError` specifically — never a bare
      `catch`, and never `Error` — for the same fall-through-to-Zod-only
      treatment as `DurationValidationError`/`CompileValidationError`, since
      an uncaught `TypeError` from a shape the cheap check let through (such
      as a timer missing `onFire`) is the one documented hazard this
      try/catch exists to cover; also catch `ZodError` there with the same
      fall-through treatment, since `compileProcessBody`'s own internal
      `authoredProcessBody.parse(body)` call throws a plain `ZodError` for
      every invariant that lives only in `processBody`'s own `.superRefine`
      (initialStep resolution, path.to resolution, view.fields[].ref
      resolution, timer.onFire.targetPath resolution, action.output field
      resolution, duplicate-id checks, baseLocale requirements,
      contract-outcome reachability) — none of which duration validation or
      the seven structural checks cover, so a body that clears both still
      reaches that call and can still fail it, routinely; re-throw any error
      that is not a `DurationValidationError`, `CompileValidationError`,
      `TypeError`, or `ZodError`, so an unrelated bug elsewhere in
      `compileProcessBody` is not silently misreported as "only Zod
      issues" — see task 6.18. A caught `TypeError` is not always the
      documented onFire hazard: any other null/undefined-property access
      inside `validateDurations` or the seven structural checks throws the
      same way and this catch cannot tell the two apart by class alone, so
      store the caught `TypeError` itself in the result's `discardedError`
      field (design.md's `StructureValidationResult` sketch) rather than
      dropping it — see task 2.2a for the log line this same catch also
      writes. Also call
      `authoredProcessBody.safeParse(authored)` unconditionally, independent
      of (never gated behind) the duration-and-structural try/catch's
      outcome, to populate `zodValid`/the `zod` dimension and `zodIssues`
      — distinct from `compileProcessBody`'s own internal `.parse()` call,
      which it reaches only once duration and structural have already
      succeeded, to produce the compiled body. The caught `ZodError` needs no
      separate handling beyond the fall-through: this same unconditional
      `safeParse` call already populates `zodIssues` with its issues
- [x] 2.2a Log the `TypeError` task 2.2's try/catch catches, before falling
      through, via `log.error` (`src/log.ts`), mirroring
      `src/http/errors.ts`'s own unhandled-error fallback: the error's name,
      message and stack. Do not log the caught `ZodError`; `zodIssues`
      already carries that same information from the separate, unconditional
      `safeParse` call. Without this log line, the one hazard this catch
      exists to cover — an unrelated runtime bug surfacing as a `TypeError` —
      leaves no server-side trace at all once discarded, per design.md's
      "Duration and structural checks keep running before the Zod gate"
      decision
- [x] 2.3 In `validateReferences`, run the registry type-resolution checks
      against the supplied `RegistryDescription`, using the three collectors
      task 1.11 exports (`collectTypedActionSites`, `collectAssignmentSites`,
      `collectDataSourceSites`) to build each dimension's sites with no live
      registry, calling `resolveType` directly per dimension. When the
      caller supplies a live registry set, also call `checkConfigOnly`
      (task 1.3a) directly, once per dimension, against that dimension's own
      registry, to populate the three config-issue arrays — never
      `checkTypedConfig`, which is unexported, lives outside
      `src/validate.ts`, and would re-resolve every site and duplicate the
      not-registered issues the type-resolution call already reported. Also
      run the CEL check, `checkSubprocessChildRefs` per caller-supplied loaded
      child, and `checkProcessChainingTarget` against the caller-supplied
      `targetsByLoc`. Collect each dimension's findings into its own array —
      `actionTypeIssues`, `assignmentTypeIssues`, `dataSourceTypeIssues`,
      `actionConfigIssues`, `assignmentConfigIssues`, `dataSourceConfigIssues`
      and `celIssues` — per design.md's per-dimension
      `ReferenceValidationResult` sketch, not one flat `issues` list. Do not
      call `validateProcessChaining` or `validateCrossProcess` directly —
      both stay async and DB-resolving, and run only inside `publishBody`,
      after `validateReferences`. `publishBody` does not thread their
      resolved bodies back into this call: its own two functions already run
      `checkSubprocessChildRefs`/`checkProcessChainingTarget` directly on
      what they resolve, so the engine's cross-process/chaining verdict comes
      from that separate step, not from this module call — per the narrowed
      "One module owns the publish validation sequence" requirement and
      design.md's chaining-split decision
- [x] 2.4 Type `validateReferences`'s body parameter as a compiled body only,
      never the raw authored shape `validateStructure` takes
- [x] 2.5 Report each dimension as `ran` or `not-run` in the result
- [x] 2.6 Add `./validate` to the exports map in `package.json`

## 3. The engine publish path

- [x] 3.1 Rewrite `publishBody` to call `validateStructure` first. When its
      result carries any issue (`compiled` is `undefined`), re-throw before
      ever computing a hash: `DurationValidationError` when the duration
      dimension carries issues, else `CompileValidationError` when the
      structural dimension carries issues, else `ZodError` built from
      `zodIssues` when that array is non-empty, else re-throw
      `discardedError` itself, unchanged — the fourth branch covers the
      reachable state where `compiled` is `undefined` yet duration,
      structural and `zodIssues` are all empty, which is exactly what a
      `TypeError` unrelated to the onFire shape leaves behind against an
      otherwise Zod-valid body (task 2.2's `discardedError` field); do not
      build a `ZodError([])` for that state, since an empty-issues 422
      misclassifies an internal programming fault as a client validation
      failure and discards task 2.2a's log as the only trace of it — the
      first three branches follow the same precedence
      `compileProcessBody` has today, reconstructed from the result rather
      than re-running `compileProcessBody` to produce it. When `validateStructure` returns a
      `compiled` body, hash it and return early on a hit. On a miss, build a
      `RegistryDescription` from its own
      three live registries — one `describeTypeNames(registry)` call per registry
      (action, assignment, data source), per task 1.2 — and call
      `validateReferences` next, for the stages the module owns (the three
      registry checks and the single-body CEL check), supplying that
      `RegistryDescription` alongside the live registry set, throwing on the
      earliest-precedence dimension carrying an issue — checking the four
      dimensions in order: action, assignment, data source, CEL. Each of the
      three registry dimensions carries a type-resolution array and a
      config-validation array, checked together; CEL carries one array,
      `celIssues`, checked alone. Only once
      `validateReferences` finds nothing does `publishBody`
      go on to call `validateCrossProcess` and `validateProcessChaining`
      directly, in their existing order relative to each other — both stay
      outside the module, per the narrowed "One module owns the publish
      validation sequence" requirement, and both keep their existing
      position as `publishBody`'s own final stages
- [x] 3.2 Keep the hash-hit early return exactly where it sits today
- [x] 3.3 Keep every error class and its issues unchanged
- [x] 3.4 Delete the stage list from `publishBody`'s own comments

## 4. Studio wiring

Tasks 4.6, 5.1 and 5.7 land together as one atomic commit spanning this group
and group 5. Group 4 alone is not typecheck-clean until 5.1 and 5.7 land. Do
not commit after 4.6 alone: stage 4.6, 5.1 and 5.7 together in one commit
before running any typecheck or committing intermediate work. See task 4.6's
note.

- [x] 4.0 Add a `token` prop to `DraftProvider` (`draft/store.tsx`); inside it
      call `useRegistry(token)` and hold the resulting `RegistryInfo`
      (already returned by `useRegistry`; its three type-array fields
      satisfy `RegistryDescription` structurally) in `DraftContextValue`.
      Update `DraftProvider`'s sole call site,
      `packages/web/src/areas/studio/screens/EditScreen.tsx`
      (`<DraftProvider initial={...}>`), to pass the `token` it already holds
- [x] 4.1 Pass the fetched registry response into `runValidation`
- [x] 4.1a Widen `draft/store.tsx`'s `validation` `useMemo` dependency array
      (`useMemo(() => runValidation(draft, undefined, loadedChildren),
      [draft, loadedChildren])` today) to include the new `registry` state
      (task 4.0) and `loadedChainingTargets` (task 4.2), alongside the
      existing `draft` and `loadedChildren` deps — both are async state that
      resolves after mount, and `runValidation` now reads both, so the
      memoized result must recompute once each fetch resolves, not only when
      `draft`/`loadedChildren` change
- [x] 4.1b Change that same `runValidation` call in `draft/store.tsx` to pass
      `loadedChainingTargets` (task 4.2) as its fourth argument, alongside the
      fetched registry response (task 4.1) as its second:
      `runValidation(draft, registry, loadedChildren,
      loadedChainingTargets)`. Without this, task 4.2's fetched targets never
      reach `runValidation`, and task 4.9's `chainingSiteStatus` population
      has no data to read
- [x] 4.2 Add `loadedChainingTargets: Record<ActionId, ProcessBody>` to
      `DraftContextValue` (`draft/store.tsx`), keyed by the triggering
      `process.start` action's own `id` (`Action.id`), not by site `loc` —
      per design.md's "loadedChainingTargets and chainingSiteStatus key by
      the action's own id, not by site loc" decision, a `loc` key can read a
      swapped or reordered action's stale target for at least one render
      after an edit shifts array indices ahead of it in the same action
      array. Enumerate `process.start` action sites over the RAW `draft:
      Draft` with a new, local, fully optional-chained walk — never
      `collect()` (`src/engine/registry-check.ts`), and never a `draft as
      unknown as ProcessBody` cast into it. `collect()` is typed `(body:
      ProcessBody)` and its body does `body.workflow.steps.forEach(...)`
      with no optional chaining, so it throws a `TypeError` against a
      `workflow`-less draft — `collect()` stays reserved for the
      Zod-parsed/compiled body task 4.9's walk uses. That shape is not an
      edge case: a brand-new `+ New process` draft seeds as
      `{ body: { baseLocale: "en" }, layout: {}, revision: 0 }`, with no
      `workflow` key at all (`processListLogic.ts::seededDraftInput`'s
      no-`seedVersion` branch), and `EditScreen.tsx` passes that straight
      into `<DraftProvider initial={...}>`, so this effect runs against it —
      before `validateStructure` has confirmed the draft is even Zod-valid —
      on every "Start a new process" load. Write the walk with the same
      tolerant style `resolveLoc` (`draft/issues.ts`) already uses:
      `(draft.workflow?.steps ?? []).forEach(step => [...(step.onEntry ??
      []), ...(step.onExit ?? []), ...(step.onCancel ?? []), ...(step.paths
      ?? []).flatMap(p => p.onPath ?? []), ...(step.timers ?? []).flatMap(t
      => t.onFire?.actions ?? [])].forEach(action => { if (action.type ===
      PROCESS_START_ACTION_TYPE) ... }))`. For every `process.start`
      action site found this way, resolve that site's
      target `processId` to its newest published body (task 4.2a shares one
      resolution across every site that targets the same `processId`, so
      this is not one independent fetch per site) by calling
      `listProcesses(token)`
      (`packages/web/src/areas/studio/api/client.ts`) to find that target
      `processId`'s newest published `version`, then calling
      `getVersionBody(processId, version, token)` — the same pairing
      `TemplatesScreen.tsx` already uses. Cast the result (`Promise<unknown>`,
      `api/client.ts:96`) as `ProcessBody` when storing it, matching
      `TemplatesScreen.tsx`'s own `readSource` precedent — no runtime
      validation of the fetched body — and store it at
      `loadedChainingTargets[action.id]` for every site whose own
      `processId` matches, not only the site whose fetch triggered the
      resolution. This is a new network fetch, not shared plumbing with
      `loadedChildren`'s manual upload; see design.md's "Chaining targets
      auto-fetch" decision. A target with no matching `listProcesses` entry
      gets no `loadedChainingTargets` entry for any site referencing it, and
      reads not-checked, not an error. Key each site's own fetch trigger on
      `(action.id, processId)`, so editing an existing `process.start`
      action's `processId` at that site re-evaluates against the new
      `processId` instead of leaving `loadedChainingTargets[action.id]`
      showing the stale pre-edit target body for that site
- [x] 4.2a Guard task 4.2's resolution with a `processId`-keyed ref,
      `chainingFetchState: Map<string, "pending" | "done">`, mutated outside
      React state so updating it triggers no render of its own — keyed by
      target `processId` alone, not `actionId:processId`, so two or more
      `process.start` sites that target the same `processId` (whether the
      same site, across an edit, or two different sites in the draft) share
      one in-flight or resolved `listProcesses` + `getVersionBody` pair
      instead of each issuing its own; per design.md's revised cost model,
      "one request pair per distinct target `processId` referenced anywhere
      in the draft, not per site." Before issuing that pair for a
      `processId`, check this ref first and skip a `processId` already
      marked `"pending"` or `"done"`. A site whose own effect finds its
      target `processId` already `"done"` still writes that `processId`'s
      already-resolved body into its own `loadedChainingTargets[action.id]`
      entry — the ref dedupes the network call; it never skips the
      per-site fan-out task 4.2 requires. `draft/store.tsx`'s reducer
      deep-clones the whole draft on every dispatch (`structuredClone`,
      `draft/store.tsx:49`), so `draft`'s object identity changes on every
      keystroke anywhere in the document, re-running task 4.2's effect on
      every one of those unrelated edits; without this guard, that re-run
      re-issues a `listProcesses` + `getVersionBody` pair for every
      already-resolved chaining target on every keystroke in the draft.
      When a site's `processId` changes, its new target's resolution
      follows this same shared-ref rule — fresh if no other site in the
      draft has resolved that `processId` yet, reused if one already has —
      so no site ever reads a stale pre-edit target body from
      `loadedChainingTargets[action.id]`. Per design.md's "Chaining targets
      auto-fetch; subprocess children stay a manual upload" decision
- [x] 4.3 Rewrite `runValidation` as two module calls plus an `EditorIssue`
      mapping
- [x] 4.4 Call `checkViewFlags` and `checkUnwrittenTechnicalFields` once
      `validateStructure` confirms the draft is Zod-valid, and merge their
      combined `EditorIssue[]` into the result — never gated on whether a
      compiled body exists, so both still run when duration or structural
      compilation fails and `validateReferences` never runs; neither is a
      module input, per design.md's "Two exported phases" decision. Pass
      `runValidation`'s own `draft` argument directly to both functions, not
      a re-derived `authoredProcessBody.safeParse(draft).data` — their
      signatures already accept `Draft`, and `validateStructure` already
      performs that same parse once; re-deriving it here would restate a
      stage `validateStructure` already owns
- [x] 4.5 Delete the 36-line ordering comment (`validation.ts:43-78`) and the
      KNOWN GAP comment nested inside it
- [x] 4.6 Replace `ValidationResult`'s three booleans with the per-dimension
      record. Tasks 4.6, 5.1 and 5.7 land as one atomic commit: `checksRail.ts`'s
      `heldBackFor` (task 5.1) types its `Pick<ValidationResult, ...>` parameter
      against the three booleans this task removes, and `ActionListEditor.tsx`'s
      `validation.registryChecked` read (task 5.7) reads one of them directly. A
      `bun run typecheck` run after this task but before tasks 5.1 and 5.7 land is
      expected to fail on those two files and is not a checkpoint
- [x] 4.7 Change `packages/web/test/studio-checksRail.test.ts`,
      `packages/web/test/studio-draftValidationLogic.test.ts` and
      `packages/web/test/studio-strip-compiled.test.ts` to the new
      `runValidation` signature and `ValidationResult`'s per-dimension record,
      replacing every `registryChecked`/`structurallyValid`/`structuralChecked`
      assertion with its per-dimension equivalent
- [x] 4.8 Change `packages/web/test/studio-editorDock-fieldMatrixTab.test.tsx`
      and `packages/web/test/studio-fieldMatrixPanel-legend.test.tsx` to pass a
      `token` prop into `DraftProvider`, mocking the `GET /registry` fetch as
      needed
- [x] 4.9 Add `chainingSiteStatus: Record<ActionId, "checked" |
      "not-checked">` to `ValidationResult` (`draft/validation.ts`),
      populated in `runValidation` the same way `subprocessStepStatus` is:
      iterate every `process.start` action site via the `collect()`/
      `PROCESS_START_ACTION_TYPE` filter (mirroring
      `src/engine/definitions.ts`'s own use of it), keyed by the site's own
      action `id` (`site.action.id`), matching `loadedChainingTargets`'s own
      key, and read `loadedChainingTargets[site.action.id]` per design.md's
      "chainingSiteStatus mirrors subprocessStepStatus, keyed by the
      action's own id" decision

## 5. The checks rail

- [x] 5.0 Invoke `/frontend-design:frontend-design`, alongside the installed
      Vercel skills (`web-design-guidelines`, `vercel-react-best-practices`,
      `vercel-composition-patterns`) per `CLAUDE.md`'s UI convention, for the
      registry group's new split held-back indicator (clear-or-issue-carrying
      on one half, held back on the other), for the structural group's new
      `unknownKeysHeldBack` indicator (task 5.8a), for the narrowed
      `ActionListEditor` registry badge, and for `ActionListEditor`'s new
      chaining not-checked badge (task 5.5) covering the auto-fetch's own
      loading and not-found states — a target still resolving, and a target
      with no matching `listProcesses` entry — before implementing any of
      them
- [x] 5.1 (lands together with task 4.6 as one atomic commit, see task 4.6's
      note) Rewrite `heldBackFor` to read the per-dimension record. Its current
      signature (`checksRail.ts:37-39`) takes only a `Pick` of
      `ValidationResult`'s boolean fields — it has no access to any group's
      own issue list today, since that filtering happens one level up, in
      `groupChecksBySource`. Give `heldBackFor` a new parameter carrying the
      structural group's own, already-grouped issue count (or its full
      `EditorIssue[]`), so it can check that list directly rather than only
      `dimensions.structural`. Hold the CEL and registry groups back when
      `dimensions.structural !== "ran"`, OR the structural group's own issue
      list is non-empty —
      `dimensions.structural` alone reads `"ran"` both when the six
      structural checks pass cleanly and when they run and raise a
      `CompileValidationError`, so the issue-list check is what tells
      "compiled cleanly" apart from "ran and failed," per design.md's
      updated "Duration and structural checks keep running before the Zod
      gate" section. Hold the registry group's type-resolution half back
      when `dimensions.actionType !== "ran"` — the three type-resolution
      dimensions (`actionType`, `assignmentType`, `dataSourceType`) run
      together off one `registryDescription` input, so any one of them
      stands in for whether that input has resolved, per the
      studio-checks-rail delta's "The type-resolution half holds back
      while the registry description has not resolved" scenario
- [x] 5.2 Add `registryConfigHeldBack` to `CheckGroup` (per design.md's
      "CheckGroup gains a second, independent held-back field per group"
      decision) and set it for the registry group whenever the caller
      supplied no live registry — independent of that group's own `heldBack`
- [x] 5.2a Add `unknownKeysHeldBack` to `CheckGroup`, mirroring
      `registryConfigHeldBack` (task 5.2), and set it for the structural
      group, always `true` in the studio — `checkUnknownKeys` needs the raw
      authored body, and the studio holds only
      `authoredProcessBody.safeParse(draft).data`, which the parse has
      already stripped — independent of that group's own `heldBack`, per
      design.md's "The unknown-key check stays held back in the studio" and
      "CheckGroup gains a second, independent held-back field per group"
      decisions
- [x] 5.3 Drop the `"registry"` exclusion from `allChecksClear`
- [x] 5.4 Drop the `"registry"` exclusion from `totalOpenIssueCount`
- [x] 5.5 Wire `ActionListEditor.tsx` to render a `NotCheckedBadge` (the same
      component it already imports, `ActionListEditor.tsx:111`) beside a
      `process.start` action whose own `id` is absent from
      `chainingSiteStatus` (task 4.9) or reads `"not-checked"`.
      `ActionListEditor.tsx` already holds `action.id` in scope — it already
      passes `entityId={action.id}` to `IssueList` (`ActionListEditor.tsx:112`)
      — so this needs no new prop threaded through `StepsPanel.tsx`,
      `PathsPanel.tsx` or `TimersPanel.tsx`, mirroring `StepsPanel.tsx`'s
      existing subprocess-child fieldset for the analogous
      `subprocessStepStatus` case, per design.md's "chainingSiteStatus
      mirrors subprocessStepStatus, keyed by the action's own id" decision
- [x] 5.7 (lands together with task 4.6 as one atomic commit, see task 4.6's
      note) Narrow `ActionListEditor.tsx`'s per-action registry badge to the
      held-back config-validation half: show it for an action whose type
      resolved, and give an action whose type did not resolve its own registry
      issue instead
- [x] 5.8 Change `packages/web/src/areas/studio/panels/ChecksRail.tsx` to
      render `CheckGroup.registryConfigHeldBack` as its own held-back
      indicator on the registry group, shown alongside that group's
      type-resolution issues or clear state whenever
      `registryConfigHeldBack` is `true`, independent of `heldBack`, per
      design.md's "CheckGroup gains a second, independent held-back field per
      group" decision
- [x] 5.8a Change `packages/web/src/areas/studio/panels/ChecksRail.tsx` to
      render `CheckGroup.unknownKeysHeldBack` as its own held-back indicator
      on the structural group, shown alongside that group's structural
      issues or clear state whenever `unknownKeysHeldBack` is `true`,
      independent of `heldBack`, per design.md's "The unknown-key check stays
      held back in the studio" and "CheckGroup gains a second, independent
      held-back field per group" decisions

## 6. Tests

New assertions in this group land in `test/validate-sequence.test.ts`, a new
file. The existing `test/validate.test.ts` tests Zod schema acceptance and
rejection against `examples/expense-approval.json`. It stays untouched.

- [x] 6.1 Assert both callers report the same issues for one body
- [x] 6.1a Assert a `process.start` action whose `inputMapping` maps into a
      group-container field id (not one of its leaf children) on its
      target's field catalog passes both `validateProcessChaining` and
      `checkProcessChainingTarget` identically — extending task 6.1's
      general "both callers agree" assertion with this specific case, since
      `collectFieldsDeep` accepts a group-container id and `leafFields`
      does not
- [x] 6.1b Assert that for a body with one unregistered-type action and one
      registered-type action carrying an invalid config, `validateReferences`'s
      `actionTypeIssues` carries exactly the unregistered-type issue and
      `actionConfigIssues` carries exactly the invalid-config issue, with no
      not-registered entry duplicated into `actionConfigIssues` — per
      `registry-config-check-consolidation`'s "A live-registry caller's
      config-validation half reuses checkConfigOnly directly" scenario,
      exercised here through `validateReferences`'s own two-call composition
      (task 2.3: `resolveType` then, separately, `checkConfigOnly`), not
      through `checkTypedConfig`'s existing pre-consolidation tests
- [x] 6.2 Assert an unregistered action type reaches the rail, at the
      `ChecksRail`/`runValidation` level — mirroring 6.3/6.4, not only via
      6.9a's `ActionListEditor`-scoped test — per studio-checks-rail's "A
      compiling draft resolves plugin types in all three registries" scenario
- [x] 6.3 Assert an unregistered assignment strategy type reaches the rail
- [x] 6.4 Assert an unregistered data source type reaches the rail
- [x] 6.5 Assert a bad `process.start` input mapping reaches the rail
- [x] 6.6 Assert a missing input reports `not-run`, never a pass
- [x] 6.7 Assert an identical re-publish stays a no-op
- [x] 6.8 Assert the engine rejects and accepts exactly what it does today
- [x] 6.9 Assert the collapsed one-line summary's count includes a registry
      type-resolution issue, and stays unaffected by the config-validation
      half's held-back state
- [x] 6.9a In a new file,
      `packages/web/test/studio-actionListEditor-registryBadge.test.tsx`,
      assert `ActionListEditor.tsx` shows the config-held-back badge for an
      action whose type resolves, and shows a registry issue (not the
      held-back badge) for an action whose type does not resolve, per
      design.md's "Config validation stays on the server, and the rail says
      so" decision and task 5.7's narrowed badge — task 6.14's own
      `chainingSiteStatus` assertion explicitly disclaims covering this
      component-level branch
- [x] 6.10 Assert a `process.start` action mapped into a field its target does
      not declare still raises `CrossProcessValidationError`, never
      `CelValidationError`, at publish
- [x] 6.11 Assert a body invalid in both the duration and the Zod dimension at
      once raises `DurationValidationError` at publish, never a `ZodError` —
      the precedence `compileProcessBody` has today, preserved per design.md's
      "Duration and structural checks keep running before the Zod gate"
      decision
- [x] 6.12 Assert an unwritten technical field still reaches the rail's view
      group after the `runValidation` rewrite, as a regression guard on
      `checkUnwrittenTechnicalFields`'s already-landed call site. Include a
      case where the draft is Zod-valid but fails structural or duration
      compilation: the view group's findings still reach the rail, since
      task 4.4 runs `checkViewFlags`/`checkUnwrittenTechnicalFields` on
      `zodValid` alone, never gated on a compiled body existing
- [x] 6.13 Assert a body carrying both an earlier-site `process.start`
      mapping violation and a later-site unresolvable `process.start` target
      still raises `CrossProcessValidationError` at publish, and record which
      message the new resolve-all-first ordering surfaces, per design.md's
      "Process chaining and cross-process checks split into a resolution
      half and a comparison half" decision
- [x] 6.14 In `packages/web/test/studio-checksRail.test.ts`, assert a draft
      carrying a `process.start` action with no matching
      `loadedChainingTargets` entry reports that action's own `id` as
      `"not-checked"` in `chainingSiteStatus` (task 4.9), and that the CEL
      group's own issue list carries no entry for that site, so the group
      never presents it as a clear pass — per the studio-checks-rail
      delta's "A chaining site with no loaded target reads as not checked"
      scenario. The visible not-checked signal itself is
      `ActionListEditor.tsx`'s badge (task 5.5), not a `ChecksRail.tsx`
      rendering; this task asserts only `chainingSiteStatus` and the CEL
      group's own issue list, the two data-layer facts that scenario
      states, per design.md's "chainingSiteStatus mirrors
      subprocessStepStatus, keyed by the action's own id" decision
- [x] 6.14a In `packages/web/test/studio-checksRail.test.ts`, assert that
      while `useRegistry` has not resolved a registry description, the
      registry group's type-resolution half reads held back and
      `registryConfigHeldBack` reads `true` independently; then assert that
      once the registry response resolves, the type-resolution half's
      held-back state clears while `registryConfigHeldBack` stays `true` —
      covering both the still-loading and the failed-fetch-resolved-to-undefined
      states `useRegistry` can produce, per the studio-checks-rail delta's
      "The type-resolution half holds back while the registry description
      has not resolved" scenario
- [x] 6.14b In `packages/web/test/studio-checksRail.test.ts`, assert
      `unknownKeysHeldBack` is `true` on the structural group for a fully
      valid, compiling draft, alongside that group's own clear structural
      issues, and assert the publish control still reads available — per
      studio-checks-rail's "A fully valid draft runs every group" and "A
      held-back structural group's unknown-key check does not block
      publish" scenarios
- [x] 6.14c In `packages/web/test/studio-checksRail.test.ts`, assert that with
      the registry group's type-resolution half clear and
      `registryConfigHeldBack: true`, `allChecksClear` reads `true` and the
      publish control stays available — per studio-checks-rail's "A held-back
      registry group does not block publish" scenario, mirroring 6.14b's
      structure but for the registry group's config-validation half
- [x] 6.15 Assert a body invalid in both the action-registry and CEL dimensions
      at once raises `RegistryValidationError`, carrying only the action-registry
      issues, never `CelValidationError` — the precedence `publishBody` has today
      (action registry → assignment registry → data source registry → CEL),
      preserved when `validateReferences` batches all four dimensions for the
      studio's benefit
- [x] 6.16 Assert a Draft with a `workflow.steps` array but one timer missing
      `onFire` — importable via the JSON surface, not reachable through
      `TimersPanel.tsx`'s own timer creation, which always sets `onFire: {}` —
      reports only Zod issues from `validateStructure`/`runValidation`, and
      never throws, per the widened "Duration and structural checks keep
      running before the Zod gate" decision in design.md
- [x] 6.16a Assert that `validateStructure` called with a body lacking a
      `workflow.steps` array entirely (the cheap shape check fails
      immediately, e.g. `{}`) returns `dimensions.duration` and
      `dimensions.structural` both `"not-run"`, `dimensions.zod: "ran"` with
      `zodIssues` non-empty, and `compiled: undefined` — the base
      fall-through-to-Zod-only case design.md's "Duration and structural
      checks keep running before the Zod gate" section describes, distinct
      from the `TypeError` case (task 6.16), the `superRefine`-only `ZodError`
      case (task 6.18a) and the idempotent-branch case (task 6.18b)
- [x] 6.17 Assert a body invalid in both a module-owned dimension (action
      registry, assignment registry, data source registry or CEL) and the
      cross-process/chaining dimension at once raises the module-owned
      dimension's error class at publish, never `CrossProcessValidationError`
      — the same earlier-precedence order task 3.1 and design.md's "Process
      chaining and cross-process checks split into a resolution half and a
      comparison half" decision give `validateReferences` over
      `validateCrossProcess`/`validateProcessChaining`
- [x] 6.18 Assert `validateStructure` re-throws (does not swallow) an error
      that is neither `DurationValidationError`, `CompileValidationError`,
      `TypeError`, nor `ZodError` — an unrelated bug elsewhere in
      `compileProcessBody` must not be silently misreported as "only Zod
      issues" by the task 2.2 try/catch
- [x] 6.18a Assert a body that clears duration and the seven structural
      checks but violates a `processBody`-only `.superRefine` rule (for
      example, a path whose `to` targets a deleted step) reports only Zod
      issues from `validateStructure`/`runValidation`, and never throws — the
      ZodError fall-through task 2.2 adds
- [x] 6.18b Build a body via
      `compileProcessBody(readExample("subprocess-credit-check-child.json"))`,
      the same fixture `studio-strip-compiled.test.ts` already builds, and
      pass it to `validateStructure` directly (not `runValidation`). Assert
      `zodIssues` is non-empty, and assert `dimensions.duration` and
      `dimensions.structural` both read `"not-run"` despite `compiled`
      carrying the idempotent branch's own returned value and no exception
      being thrown — per design.md's widened "Duration and structural
      checks keep running before the Zod gate" decision, the fifth
      fall-through state, distinct from the `TypeError`/`ZodError` cases
      tasks 6.18/6.18a/6.20 cover, since here `compileProcessBody` succeeds
      outright through its own idempotent early return
- [x] 6.18c In `packages/web/test/studio-strip-compiled.test.ts`, extend the
      existing "passes stripped and fails compiled" test to also assert
      that `runValidation`'s result over the un-stripped `compiled` body
      reports the CEL and registry groups as held back, never as clear —
      proving `heldBackFor` keys off `dimensions.structural` (now
      `"not-run"` per task 6.18b) rather than off `compiled`'s own
      presence, closing the contradiction with `studio-checks-rail`'s "A
      Zod-invalid draft shows every group held back" scenario
- [x] 6.19 Assert `publishBody` itself (not `validateStructure` or
      `compileProcessBody` called directly) raises `DurationValidationError`
      for a duration-invalid body and `CompileValidationError` for a
      structural-invalid body, each carrying the same issues it raises
      today, and raises before ever computing a hash — the re-throw task 3.1
      adds for `validateStructure`'s two non-Zod tolerated dimensions
- [x] 6.20 Assert that a `TypeError` thrown from inside a structural check,
      for a reason unrelated to the documented onFire shape, against a body
      that is otherwise Zod-valid, is neither silently reported as a clean
      pass nor surfaced as a content-free `ZodError`: mock or monkeypatch one
      structural check to throw a `TypeError` unrelated to `onFire` against a
      Zod-valid, duration-valid body, then assert `validateStructure` returns
      `duration`, `structural` and `zodIssues` all empty with `discardedError`
      set to that `TypeError`, and that `publishBody` re-throws that same
      `TypeError` rather than a `ZodError([])` — task 2.2's `discardedError`
      field and task 3.1's fourth precedence branch, per design.md's widened
      "Duration and structural checks keep running before the Zod gate"
      decision
- [x] 6.21 In `packages/web/test/studio-checksRail.test.ts`, port the
      existing "a Zod-valid, uncompilable draft holds back only CEL and
      registry" case onto the new per-dimension `ValidationResult`: build a
      draft that passes Zod and duration validation but fails to compile, so
      `dimensions.structural` reads `"ran"` with a non-empty structural
      issue list, and assert the structural group shows its own
      `CompileValidationError` issues while the CEL and registry groups
      still read held back. That is the exact combination task 4.6's
      three-booleans-to-one-record merge put at risk: `dimensions.structural`
      alone cannot distinguish "compiled cleanly" from "ran and failed,"
      which is why task 5.1's `heldBackFor` also checks the structural
      group's own issue list
- [x] 6.22 In a new `packages/web/test/` file, mock `listProcesses`/
      `getVersionBody` and render `DraftProvider` with a draft carrying two
      `process.start` sites that target the same `processId`; assert exactly
      one `listProcesses` + `getVersionBody` pair fires for that `processId`
      — mirroring task 4.8's existing `GET /registry` mocking pattern inside
      a jsdom-rendered `DraftProvider`. Then dispatch an edit to an unrelated
      field and assert neither mock fires again for that already-resolved
      target. This is task 4.2a's `chainingFetchState` dedup guard's only
      automated coverage: per CLAUDE.md's "every invariant that lands ships
      with a test that rejects a violating input" and
      `development-toolchain`'s "an assertion can observe the property with
      no browser" split-rule scenario, this invariant needs a `bun:test`
      assertion, not only the manual browser-check entries task 7.3 adds
- [x] 6.22a In `packages/web/test/studio-draftProvider-chainingFetch.test.ts`,
      alongside task 6.22's assertion, build a draft with two
      `process.start` action sites — A at an earlier array position, B later
      — each already resolved to its own, distinct `loadedChainingTargets`
      entry. Delete or reorder A so B's `collect()` loc shifts to the array
      index A held before the edit. Assert `chainingSiteStatus` and
      `loadedChainingTargets` still key on B's own `action.id` after the
      shift, and that `checkProcessChainingTarget` validates B against B's
      own target body, never against A's — the wrong-verdict hazard
      design.md's "loadedChainingTargets and chainingSiteStatus key by the
      action's own id, not by site loc" decision exists to prevent, distinct
      from task 6.22's same-`processId` dedup coverage
- [x] 6.22b In `packages/web/test/studio-draftProvider-chainingFetch.test.ts`,
      render `DraftProvider` with `initial={{ baseLocale: "en" }}` — the exact
      body `processListLogic.ts::seededDraftInput` seeds a brand-new
      `+ New process` draft with, carrying no `workflow` key — and assert it
      mounts without throwing and fires neither `listProcesses` nor
      `getVersionBody`. This is task 4.2's regression guard: its
      `process.start`-site walk must tolerate a `workflow`-less draft rather
      than reaching for `collect()` (`src/engine/registry-check.ts`), whose
      unguarded `body.workflow.steps.forEach(...)` throws a `TypeError`
      against exactly this shape

## 7. Documentation

- [x] 7.1 Add the new export to `docs/current-state.md`, and rewrite three
      passages there that this change makes stale, not just add the export
      line: the `runValidation` "Known gap" passage (`docs/current-state.md`
      around line 152-159) to describe `unknownKeysHeldBack` reporting
      instead of a silent, undocumented-to-the-rail absence; the
      `checkDataSourceRegistry` passage (around line 849-851) to drop "wired
      into `publishBody` in the same in-process slot
      `checkActionRegistry`/`checkAssignmentRegistry` occupy," since after
      this change it is reached indirectly through `validateReferences`, not
      directly; and the `draft/validation.ts` passage (around line 3862) to
      say it calls `validateStructure`, which internally calls
      `compileProcessBody`, rather than calling `compileProcessBody` itself.
      Re-derive these three line numbers against the file's actual state
      before editing — `docs/current-state.md` lists exported symbols and
      behavior by hand, so a line number recorded here can drift as the file
      changes; the quoted phrases above stay the reliable anchor
- [x] 7.2 Record the two-phase seam (`validateStructure` then
      `validateReferences`) in `docs/current-state.md`'s engine section,
      beside task 7.1's new-export note — not in
      `.claude/rules/authoring-invariants.md`, whose bullets each name a
      rejectable shape a process body can take, not an internal module
      call pattern
- [x] 7.3 Add a browser check for the widened rail to `docs/browser-checks.md`,
      including two check-items for task 4.2a's fetch de-duplication —
      real-browser sanity checks alongside task 6.22's `bun:test` assertion,
      not the only verification of that dedup guard: with a
      draft that already has a resolved chaining target, edit an unrelated
      field elsewhere in the draft and confirm no repeated `GET /processes`
      or `GET /processes/:id/versions/:v` request fires for that target; and,
      separately, with a draft carrying two `process.start` action sites that
      target the same `processId`, confirm only one `GET /processes/:id/
      versions/:v` request fires for that shared target and that both sites'
      badges read checked
- [x] 7.4 Rewrite `.claude/rules/process-contract.md`'s Extensibility
      paragraph (the sentences describing registry validation at publish
      time) to name `resolveType`/`checkConfigOnly`, called via
      `validateReferences`, as what `publishBody` actually invokes at publish
      time, and to describe `checkActionRegistry`/`checkAssignmentRegistry`/
      `checkDataSourceRegistry` only as the still-exported combined wrapper
      over both halves that `publishBody` no longer calls directly. Keep the
      placement claim — before CEL and cross-process validation, on the
      compiled body, after the hash-hit no-op return — since that stays true
- [x] 7.5 Add a bullet to `docs/decisions.md`'s "Open questions" section
      recording that `checkUnknownKeys` stays held back in the studio pending
      a tolerant walk, per design.md's "The unknown-key check stays held back
      in the studio" decision and this change's own "Open Questions" section

## 8. Verification

- [x] 8.1 Run `bun run typecheck`
- [x] 8.2 Run `bun run build`
- [x] 8.3 Run the full `bun test` with `DATABASE_URL` set
- [x] 8.4 Read the skip count that run reports
- [x] 8.5 Run the antislop linter over every Markdown file this change touched
- [x] 8.6 Run `git diff --check`
- [x] 8.7 Run `git ls-files --eol`, then read its `w/` column
- [x] 8.8 Open a seeded example in a browser
- [x] 8.9 Read that example's rail
- [x] 8.10 Confirm `requireAuthoring` gates `GET /registry` the same as the
      four draft routes and the publish route (already true per
      `src/http/studio-routes.ts`'s docstring; this step reads the single
      implementation to confirm, not to investigate)
