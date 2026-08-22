## 1. Definition contract

- [x] 1.1 Add `technical?: boolean` to the `FieldDef` TS type and the
      `fieldDef` Zod schema in `src/schema/definition.ts`. Carry a doc
      comment on the new member in the shape `columnMapping`'s already
      has three keys above: name `compile.ts::checkTechnicalFields` as
      the home for both rejections, and state that a refinement here
      would make an already-published body throw on READ, since
      `definition.ts` also deserializes stored immutable bodies. The
      trap that comment exists to prevent sits close by — `fieldDef`
      already ends in a `.refine()` (the `options`/`dataSource` XOR,
      `definition.ts:301-304`) and `type: "group"` is visible on the
      same object, so "reject technical on a group" has a working
      refinement right there to copy. Add NO refinement to `fieldDef` or
      `viewField`.
- [x] 1.2 Add one `checkTechnicalFields` function to `src/schema/compile.ts`,
      covering both rules: reject `technical: true` on a `type: "group"`
      field, and reject a `view.fields[]` entry naming a technical field
      that declares `required` or `readonly` at all (literal `true`,
      literal `false`, or CEL). Both rules test `technical === true`
      alone, never truthiness: `technical: false` is an ordinary field.
      Do not nest either rule inside `checkFieldTree` or
      `checkViewFieldPatterns` — a technical group field with no view
      entry would then never reach the group check. Emit `loc` in the
      shape the sibling checks use:
      `steps[si].view.fields[vi].required` / `.readonly` for the view
      rule (following `checkViewFieldPatterns`'s general dotted-index
      PREFIX convention, `steps[${si}].view.fields[${vi}]`,
      `compile.ts:569-577` — that check only ever calls `checkPatterns`,
      which emits `.validation.pattern`; the `.required`/`.readonly`
      suffix here is new, not copied from the sibling itself), and
      `fields.<fieldId>.technical` for the group rule — the DOTTED
      form, never `fields[<fieldId>]`. `tokenize` (`draft/issues.ts`)
      matches a bracket holding digits alone, so the bracketed form
      yields one unparsed token and `resolveLoc` falls through to the
      process root, which is what task 1.10 rejects. The dotted form
      reaches `resolveLoc`'s bare-`fields` branch, which resolves a
      field by id rather than by flattened index, so a nested field
      anchors correctly too.

      `walkFieldsIndexed`'s `floc` argument is bracket-indexed
      (`fields[0].fields[2]`) and MUST NOT be used as this rule's
      `loc`. Only the array-walk mechanism is reused, never its loc
      convention: construct `fields.${f.id}.technical` from the
      field's own `id` directly, discarding `floc` entirely.

      The check reads duck-typed input, like every sibling.
      `structuralIssues(body)` runs at `compile.ts:754`, ahead of
      `authoredProcessBody.parse`, and its own doc comment calls the
      `ProcessBody` type "a lie at this exact call site". A plain
      `body.fields.filter(...)` throws a `TypeError` on a malformed
      body, turning a 400 `CompileValidationError` into an unhandled
      500. Reuse `walkFieldsIndexed` for the catalog side and guard the
      view side the way `checkViewFieldPatterns` does. A body with no
      `fields` array, a non-array `fields`, a non-string `type`, or a
      `view.fields` entry with no `ref` yields zero issues, never a
      throw.
- [x] 1.3 Add `checkTechnicalFields` as its own entry in
      `structuralIssues`'s array (`compile.ts:737-745`), the one call
      site every structural write-path check already funnels through.
      That array holds SIX entries today, so the five `compile.ts`
      comments reading "seven" are stale by one and become correct at
      seven once this entry lands: the module header (`:4`, `:22`), the
      section header "Seven checks, one placement" (`:112`),
      `CompileValidationError`'s "one of the seven structural checks"
      (`:131`), and `compileProcessBody`'s call-site comment (`:754`).
      Leave all five as they stand. Leave `compile.ts:459` alone too
      ("Seven rules, all write-path") — it counts `checkColumnMapping`'s
      own rules, not this array. In `structuralIssues`' doc comment, add
      `checkTechnicalFields` to the duck-typed list beside
      `checkReservedActionPrefix` and `checkUnknownKeys`; "the remaining
      four" there stays correct, since the new check reads duck-typed
      input (task 1.2).

      Three studio-side comments state "six" accurately today and move
      to seven: `draft/issues.ts:18`, `draft/validation.ts:32` and
      `draft/validation.ts:125`. Two of those enumerate the checks by
      name (`draft/issues.ts:19-22`, `draft/validation.ts:125-130`) and
      gain `checkTechnicalFields`. `draft/validation.ts:75` reads "The
      other five structural checks" and enumerates them too; it moves to
      six and gains the name as well, since the new check inspects
      DECLARED values, which survive the studio's Zod parse intact.
- [x] 1.4 Test: publish rejects `technical: true` on a group field.
- [x] 1.5 Test: publish rejects `required: true`, `readonly: true`,
      `readonly: false`, and CEL in either key, on a technical field's
      view entry.
- [x] 1.6 Test: publish accepts a technical field's view entry declaring
      only a display-only key (`order`).
- [x] 1.7 Test: `technical: false` gates nothing: it publishes on a
      `type: "group"` field, and it publishes on a field whose view
      entry carries `required: true`. Both compile checks read
      `=== true`, never truthiness.
- [x] 1.8 Test: a malformed body (no `fields` array, or a `view.fields`
      entry with no `ref`) reaches the Zod error rather than a
      `TypeError` raised inside `checkTechnicalFields`.
- [x] 1.9 Test: a body declaring no field's `technical` hashes
      identically before and after this change.
- [x] 1.9a Test: a field declaring `technical: false` hashes
      differently from the same body with the key omitted. JCS
      serializes a declared key, `false` included; only an absent key
      drops out.
- [x] 1.10 Test: the studio's `runValidation` anchors each new issue on
      the right entity — the view rule on its step, the group rule on
      its field — not on the process root.

## 2. Engine resolution

- [x] 2.1 In `resolveFields` (`src/runtime/api.ts`), force
      `required: false, readonly: true` for a `ViewField` resolving to a
      `technical: true` field, the same two lines that already force
      `false, false` for a group field. A group wins where a body
      declares both: `required: false, readonly: false`. Compile rejects
      that pair, but `resolveFields` also runs on a body nobody compiled
      — task 2.3 builds one.
- [x] 2.2 Test: `getInstanceView` reports `required: false, readonly:
      true` for a technical field, regardless of the view entry's own
      declaration (construct the `ProcessBody` directly, not via
      compile, since compile now refuses a body violating task 1.2's
      rule).
- [x] 2.3 Test: a `ViewField` whose `FieldDef` is `type: "group"` AND
      declares `technical: true` resolves `required: false, readonly:
      false` — the group branch, not the technical one. Construct the
      `ProcessBody` directly; the compile rule rejects this pair.
      `api.ts:482-484` is two ternaries, and the new arm's position
      inside them is otherwise untested.
- [x] 2.4 Test: `submitAndTransition` rejects a submitted key naming a
      technical field with the existing `readonly-field` issue, and
      `createProcessInstance` rejects a seeded key naming one the same
      way. Both reach the editable set through `validateSubmissionData`
      (`api.ts:815`, `:979`), so the second follows from task 2.1 with
      no further code.
- [x] 2.5 Test: a submission writing a picker whose `columnMapping`
      targets a `technical: true` field still lands the mapped
      attribute in `data`. `applyColumnMapping` SHALL NOT filter by the
      resolved editable set, which task 2.1 now forces `readonly: true`
      for every technical target.
- [x] 2.6 Test: a submission carrying a value for a `technical` field
      that is also a `columnMapping` target is rejected with
      `readonly-field`, and the mapping does not run.
- [x] 2.7 Test: `getInstanceView` resolves a field declaring
      `technical: false` from its view entry's own `required`/
      `readonly`, identically to a field declaring no `technical` key.

## 3. Field catalog

- [x] 3.1 Add `applyTechnicalMarker(draft, fieldId, next: boolean)` to
      `packages/web/src/areas/studio/draft/field-usage.ts`, modelled on
      `applyVisibleOverride` (`:97`) — a `mutate` recipe body, not a
      patch. It sets `field.technical = true` or deletes the key on the
      field found by id anywhere in the catalog. On `true` it also walks
      every `draft.workflow.steps[].view.fields[]` entry whose `ref` is
      that field and deletes `required` and `readonly` on each. On
      `false` it writes no flag key back. Walk `draft.workflow.steps` in
      full: the pass runs in `FieldCatalogPanel`, which holds no step
      filter of its own, so nothing narrows the set for it — and nothing
      may.
- [x] 3.2 Add a Technical checkbox to the field catalog's Field tab
      (`packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`),
      following the existing convention: write `technical: true` on
      check, delete the key on uncheck. The checkbox calls
      `mutate((d) => applyTechnicalMarker(d, field.id, next))`, never
      the panel's `onChange` patch. `FieldEditor`'s `onChange` runs
      `Object.assign` (`draft/draft-array-crud.ts:16`) and
      `SubFieldRow`'s spreads (`draft/list-ops.ts:6`), so neither can
      delete a key: `onChange({technical: undefined})` leaves
      `"technical" in field` true, the hazard `setFlag`'s own comment
      records (`view-flags.ts:34-41`). Add it to `SubFieldRow`
      (`FieldCatalogPanel.tsx:52`) too, so a group's child at any depth
      reaches it: that component already carries `columnMapping`,
      recurses into its own children (`:281`), and both the compile rule
      and the rail's finding read the flattened catalog. The tabbed
      `FieldEditor` (`:345`) covers the selected top-level field alone.
      Pass `mutate` into `SubFieldRow`, which today destructures `draft`
      and `contentLocale` alone (`:53`). `applyVisibleOverride` is
      already imported at `:19`. Take the control's visual treatment
      from `.claude/rules/design-language.md` (checkbox states, class
      naming) and run `/frontend-design:frontend-design` before
      implementing, per CLAUDE.md's Conventions.
- [x] 3.3 Disable the control for a field of `type: "group"`, at any
      nesting depth.
- [x] 3.4 Add `fieldCatalog.technicalLabel`,
      `fieldMatrix.technicalRowMark`, `fieldMatrix.legendTechnical` and
      `fieldCatalog.technicalClearConfirm` (a count-interpolated
      string, `"Checking Technical will clear {count} required/readonly
      key(s) across this draft's steps. Continue?"`, following the
      existing `fieldCatalog.translationGap: "{count} missing"`
      precedent, `FieldCatalogPanel.tsx:511`) to
      `packages/web/src/i18n/catalogs/studio.ts`, and add
      `"fieldMatrix.legendTechnical"` to `LEGEND_KEYS`
      (`panels/FieldMatrixPanel.tsx:7-13`). The legend is a fixed list,
      and every marker the grid draws has a line there —
      `fieldMatrix.legendFlagged` is the nearest analogue. The studio
      catalog ships `en` alone, so the i18n parity test needs no `de`
      entry. The rail finding itself needs no catalog key:
      `checkViewFlags` builds its messages as hardcoded English template
      literals (`view-flags.ts:186-206`).
- [x] 3.4a Test: the field matrix's legend renders one entry per
      `LEGEND_KEYS` member, six once `legendTechnical` is added.
- [x] 3.5 Test: checking Technical on a field whose entry on one step
      carries `required: true` and whose entry on another carries
      `readonly: false` leaves neither key, and the draft then compiles.
- [x] 3.6 Test: unchecking Technical deletes the key. `"technical" in
      field` reads false afterwards, not `technical: false`, and no
      `required` or `readonly` key comes back. The two shapes differ by
      a moved `definitionHash`.
- [x] 3.7 Confirm before the clearing pass runs, using the existing
      `t()`-backed `confirm()` convention (`panels/DraftToolbar.tsx:118`,
      `:144` — not `screens/ProcessesScreen.tsx:310`'s inline template
      string, the same mechanism but a different, uncataloged message):
      `confirm(t("fieldCatalog.technicalClearConfirm").replace("{count}",
      String(n)))`, naming the count of `required`/`readonly` keys the
      pass will delete, gating the whole checkbox action. That pass
      destroys authored data across every step in one `mutate`, the
      load-bearing `required: true` case from the proposal's Why
      included, and uncheck restores none of it. Declining SHALL leave
      `technical` unset and clear no key — mirror `discard()`'s
      `if (!confirm(...)) return`. Skip the confirm where the count is
      zero.
- [x] 3.8 Test: checking Technical on a field carrying no `required` or
      `readonly` key runs no confirmation.
- [x] 3.9 Test: declining the confirmation leaves every `required` or
      `readonly` key in place across every step, and writes no
      `technical` key.

## 4. Form editor

- [x] 4.1 In the per-step strip, stop offering `required`/`readonly`
      controls when the selected field's `FieldDef` declares
      `technical: true`; keep `visible`, `group`, `span` offered.
      Compute a technical-field-id `Set<string>` once in
      `FormEditorScreen.tsx` (e.g. from the draft's flattened field
      catalog) for this control-omission logic; task 5.2 threads that
      same computed set into its two `gatedKeys` calls in the same
      file rather than computing it twice. Choose the exact visual
      treatment with `/frontend-design:frontend-design` (design.md
      Open Questions).
- [x] 4.2 Test: `renderToStaticMarkup` of the form editor's strip for a
      field declaring `technical: true` emits no `required` and no
      `readonly` control, and still emits `visible`, `group` and `span`.
      Follow `packages/web/test/studio-editorDock-fieldMatrixTab.test.tsx`:
      a synchronous server render, no DOM, no listening socket.

## 5. Field matrix

- [x] 5.1 Add a technical-field row-header marker to `FieldMatrixGrid`/
      `fieldMatrixLogic.ts`, visually distinct from the flagged-cell
      marker. Choose the exact visual treatment with
      `/frontend-design:frontend-design` (design.md Open Questions).
- [x] 5.2 Give `gatedKeys` (`draft/view-flags.ts`) a technical-field
      signal, so it gates `required` and `readonly` unconditionally for
      a technical field's entry, the same way it already gates both when
      `visible` is `false`. Pass the signal as a `Set<string>` of
      technical field ids, the shape `written` already threads: a
      `DraftViewField` carries only `ref`, so the entry alone cannot
      answer whether its field is technical. Make the parameter
      REQUIRED, not optional, so `tsc` names every missed call site
      instead of letting the gate no-op at one nobody noticed.

      Thread it to the matrix's per-cell `disabled` computation
      (`FieldMatrixGrid.tsx:314`) and through the private chain
      `cellEligible` (`fieldMatrixLogic.ts:112`) →
      `eligibleTargetEntries` (`:141`) → `bulkBadgeOn` (`:161`) /
      `applyBulkToggle` (`:172`). All four take the new parameter.
      `FormEditorScreen.tsx` holds two `gatedKeys` calls (`:404` for
      `required`, `:412` for `readonly`), and both move with the
      required third argument. Task 4.1 computes a technical-field-id
      `Set<string>` for its own control-omission logic in that file;
      thread that same computed set into both calls rather than
      computing it twice. Task 4.1, not this gate, is what removes the
      two controls for a technical field.

      Two test files move with the required parameter: nine
      two-argument `gatedKeys(` calls in
      `packages/web/test/studio-viewFlags.test.ts` (`:74`-`:117`), one
      more at `packages/web/test/studio-fieldMatrix.test.ts:99`, and the
      `bulkBadgeOn`/`applyBulkToggle` callers in that same
      `studio-fieldMatrix.test.ts`.

      Do not filter `rowLiveTargets`/`columnLiveTargets` instead: the
      `visible` bulk badge shares those, and it stays offered for a
      technical field. Widening `gatedKeys` alone only makes the toggle
      a no-op; it leaves the button rendered. Task 5.3 removes it.
- [x] 5.3 Give `BulkBadges` (`FieldMatrixGrid.tsx:55`) a per-key
      suppression: skip a `FLAG_KEYS` entry whose eligible target set is
      empty for that key, computed from the same `eligibleTargetEntries`
      the toggle calls. Export `eligibleTargetEntries`, which is module
      private today. Do not test the row's `technical` flag directly.
      `BulkBadges` renders today on `targets.length > 0` alone (`:244`,
      `:270`; the target sets they test are computed at `:236` and
      `:259`) and then maps all three keys unconditionally, so a gated
      technical row keeps three live-looking buttons, two of which
      answer no click.
- [x] 5.4 Test: a technical field's individual matrix cell shows its
      `required`/`readonly` checkboxes disabled, its row header offers
      no `required`/`readonly` bulk badge but still offers `visible`, a
      column's bulk badge does not change a technical field's cell, and
      the row's `visible` bulk badge still works.
- [x] 5.5 Test: a non-technical row the studio gates for `required` on
      every live cell offers no `required` badge either. The suppression
      is the general empty-eligible rule, not a technical-field case.

## 6. Checks rail

- [x] 6.1 Add the inverse finding as a new exported function in
      `view-flags.ts`, beside `checkViewFlags` and never inside it: a
      field declaring `technical: true` with no structural writer
      reports under the `view` source, anchored on the field
      (`entityType: "field"`). The base spec pins "`checkViewFlags`
      reports two findings" (`openspec/specs/studio-app/spec.md:1271`)
      and drives the per-cell flagged marker off that count, and a
      field-anchored finding has no cell to mark. Read
      `writtenFieldCounts` and report where
      `Number.isFinite(counts.get(fieldId) ?? 0)` holds. The four
      structural sources bump by `Infinity`, so a finite count means no
      structural writer; a live, editable view entry bumps by 1, and a
      technical field's entry can carry no `readonly` key, so every
      entry placing it visibly bumps. The `?? 0` is load-bearing: a
      field nothing writes has no map entry at all, and
      `Number.isFinite(undefined)` is `false`, so omitting it silences
      the finding for exactly the unplaced, unwritten field task 6.4
      covers. Do not use `writtenFieldIds`, which collapses both to
      presence and so never lets the finding fire for a placed field.
      `FieldDef.default` does not exempt: nothing applies it to
      `instance.data`.

      Append a paragraph to `writtenFieldCounts`' doc comment. Its
      headline sentence — "Every field id some source in the body
      supplies a value for" — stops holding for a technical field, whose
      visible entry bumps the count by one while supplying nothing, and
      the comment asserts its three consumers "cannot disagree about
      what 'already written' means". Record that one entry bump is not a
      writer, that the new finding reads finiteness rather than
      presence, that `writtenFieldIds` collapses the two and cannot
      serve it, and that the other two consumers are unaffected —
      `isCellFlagged` needs `required && readonly`, which a technical
      entry can never carry, and `gatedKeys` gates a technical entry
      before it reads the map.
- [x] 6.2 Wire the finding into the rail. The sibling needs its own
      `issues.push(...)` line in `runValidation`
      (`draft/validation.ts:112`), beside `checkViewFlags` and ahead of
      the `compileProcessBody` try-block.
- [x] 6.3 Change the three comments that state every `view`-source issue
      carries `entityType: "step"`: `draft/panel-rail.ts:86`,
      `PanelsScreen.tsx:40`, and `PanelsScreen.tsx:177-179`, the one
      directly above the matrix badge's own `issueCountForSource` call.
      The new finding is field-anchored, which is why the Fields view's
      `issueCountForEntityType` badge surfaces it and the matrix's
      `issueCountForSource` badge over-counts it (design.md Risks).
- [x] 6.3a Test: `issueCountForSource` (`draft/panel-rail.ts`) counts
      the unwritten-technical-field finding toward the field matrix's
      badge, and `issueCountForEntityType` surfaces it under the
      Fields view. The over-count is the accepted trade-off (design.md
      Risks), not a defect to filter away later.
- [x] 6.4 Test: the finding fires for a technical field no step's view
      places and no structural source writes — the case a missing `?? 0`
      silences.
- [x] 6.5 Test: the finding fires for a technical field placed visibly
      on a step that no structural source writes — the case the presence
      test would miss.
- [x] 6.6 Test: the finding fires for a technical field carrying a
      `default` that no structural source writes.
- [x] 6.7 Test: the finding does not fire for a technical field an
      action list targets. `writtenFieldCounts` gathers its four
      structural sources in three separate loops (`view-flags.ts:124-152`),
      so one case cannot stand for all four: a loop the test never
      enters contributes nothing to the assertion. Tasks 6.8-6.10 cover
      the other three sources.
- [x] 6.8 Test: the finding does not fire for a technical field a
      `subprocess.outputMapping` targets — the same per-step loop the
      action lists run in.
- [x] 6.9 Test: the finding does not fire for a technical field a
      `columnMapping` targets, which runs in its own loop over
      `fieldsById.values()`.
- [x] 6.10 Test: the finding does not fire for a technical field
      `contract.inputFields` names, which runs in a third loop over
      `body.contract`.
- [x] 6.11 Test: the finding does not fire for a non-technical field
      nothing writes.
- [x] 6.12 Test: a field declaring `technical: false` with no
      structural writer raises no finding from the sibling function —
      reads `=== true`, never truthiness, mirroring task 1.7's
      compile-side test.
- [x] 6.13 Confirm the new finding holds back with the view group: it
      reads the Zod-parsed body directly, never a compiled one, so it
      runs under exactly the `validation.zodValid` condition
      `checkViewFlags` already runs under.

## 7. Documentation

- [x] 7.1 Add `technical` to `docs/authoring-guide.md`, and change the
      three passages it affects. Line 183, on `columnMapping`: keep
      `readonly` in the view as the per-step shape and ADD `technical`
      as the stronger catalog-level one — an addition, never a
      substitution. Say what each costs. `readonly` on one step leaves
      the target editable on another and lets a submission carry a value
      the mapping then overwrites; `technical` forbids the target on
      every step, which turns that same submission into a
      `readonly-field` rejection before `applyColumnMapping` runs, so
      the "mapped value wins" rule never engages. Line 214
      ("Requiredness lives in the view, never in the catalog."):
      `technical` is a catalog fact that forces `required: false`;
      per-step requiredness still lives only in the view. Line 461: the
      strip omits `required`/`readonly` for a technical field. Change
      the same absolute in the code too, at
      `src/schema/definition.ts:254` — `fieldValidation`'s doc comment,
      "Catalog-level validation. Requiredness is per-step and lives in
      the view."
- [x] 7.2 Add a sentence to `.claude/rules/process-contract.md`'s "Data
      vs presentation" section, noting `technical` refines rather than
      breaches the "requiredness lives only in the view" rule.
- [x] 7.3 Add one bullet to `.claude/rules/authoring-invariants.md`'s
      compile-pass list, beside the `checkIdResolution` entry: a
      `technical` field is never `type: "group"`, and a `ViewField`
      naming a technical field declares neither `required` nor
      `readonly`, literal or CEL. The compile pass checks both
      (`compile.ts::checkTechnicalFields`), not a Zod refinement on
      `fieldDef` or `viewField`, for the same read-path reason its
      siblings carry: `definition.ts` also deserializes stored immutable
      bodies. The file states no total count, so nothing else there
      changes.
- [x] 7.4 Rewrite ROADMAP.md stage 44 from "NOT STARTED, no decision
      made" to reflect the decisions in this change: declared boolean
      marker, runtime and publish enforcement, the inverse checks-rail
      finding, and inference explicitly deferred.
- [x] 7.5 Delete the technical-field open question from
      `docs/decisions.md` (lines 18-26), which still asks "inference or
      a declared schema key" after this change settles it.
- [x] 7.6 Add a `### Technical fields (technical-field-marker)` entry to
      `docs/browser-checks.md`, beside `### The field matrix
      (field-matrix-toolbar-and-inline-editing)` (`:946`). It carries
      the two visual judgments this change makes: the
      technical-row-header marker's distinctness from the flagged-cell
      marker, and the form editor's strip layout once it omits two
      controls.
      `openspec/specs/development-toolchain/spec.md:776-781` makes a
      visual judgment an entry in that file.
- [x] 7.7 Change `docs/current-state.md` in three places. `:173-177`
      says "Two states earn it". That count stays two — the new check
      is a sibling function, not a third branch inside `checkViewFlags`
      (task 6.1). Add a sentence after it naming the sibling as a
      second studio-side function reporting under the same `"view"`
      source, with a third state: a technical field no structural
      source writes. `:3780`
      claims every `view`-source finding carries `entityType: "step"`,
      which the field-anchored finding breaks. `:171` describes
      `gatedKeys`, whose gate widens.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`.
- [x] 8.2 Run `bun run build`.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm
      the skip count, not only the pass count.
- [x] 8.4 Run the antislop linter over every Markdown file this change
      touched.
- [x] 8.5 Run `git diff --check` for trailing whitespace and blank lines
      at EOF, then `git ls-files --eol` and read the `w/` column:
      `git diff --check` does not report CRLF here.
- [x] 8.6 Browser check, which needs task 8.2's build: the engine
      answers every navigation with a JSON 404 while
      `packages/web/dist` is absent. Start from
      `examples/subprocess-loan-parent.json` (`key: "loan_application"`),
      whose `field_l_result` (`key: "result"`) is written by the `check`
      step's `subprocess.outputMapping` alone. That body declares no
      `view` on any step, so first place `result` on the `submit` step's
      form with `required: true` through the studio's JSON view
      (`panels/JsonView.tsx`, an editable textarea) — that creates the
      stale-key case. Then mark `result` technical and confirm the form
      editor's strip and the field matrix stop offering
      Required/Read-only for it, the row keeps its `visible` bulk badge,
      the stale `required: true` entry is gone from every step, and the
      draft publishes. Confirm the matrix draws the technical-row-header
      marker on that row header and none on a non-technical one's, that
      selecting a
      `type: "group"` field disables the Technical checkbox, and that a
      group's child offers it. Then unwire the `outputMapping` and
      confirm the checks rail reports the field as unwritten.
