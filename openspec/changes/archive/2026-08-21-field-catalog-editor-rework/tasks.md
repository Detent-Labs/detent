## 1. Runtime: default-value seeding

- [x] 1.1 In `src/runtime/api.ts`, the stub `Instance` (minted id,
      `currentStepId` at the initial step, `transitionSeq: 0`,
      `status` derived the way `store.ts::createInstance` derives it)
      is already built before validation runs today; this task
      changes no part of that. Initialize a working data object as a
      copy of `opts.data ?? {}` (mirroring the existing code's `const
      submitted = opts?.data ?? {}`), then add a helper that walks
      `leafFields(body.fields)` in array order and, for each field
      that carries a `default` and whose slot in the working object is
      still absent — whether because `opts.data` never set it, or
      because an earlier field's default has not filled it yet —
      fills `working[fieldId]`: a `Literal` default writes directly;
      an `Expression` default calls the already-exported
      `src/cel/eval.ts::evalFieldMap` once, as a single-entry map
      holding just that field (`evalFieldMap({ [fieldId]: field.default
      }, buildGuardContext(body, stub, actor))`), with the stub's
      `.data` set to the working object filled so far before that
      call. `evalFieldMap` already runs the exact evaluate-then-coerce,
      total-per-entry behavior this task needs — internally it calls
      `evalMapTotal`, which evaluates the expression (dropping it with
      reason `"expression-raised"` on a throw) and pipes a successful
      result through `coerceJson` (dropping it with reason
      `"value-out-of-range"` on a throw) — so no new export from
      `src/cel/eval.ts` is needed. `fieldId in patch` on the returned
      `{ patch, drops }` marks success: take `patch[fieldId]` (already
      coerced) into `working`. `fieldId`'s absence from `patch` covers
      both drop reasons and means: leave that field's slot unset.
      Skipping the `coerceJson` step `evalFieldMap` already runs would
      leave a bigint in the working object for a plain integer-literal
      default (cel-js models a CEL `int` as a JS `bigint`), which fails
      `typeMatches` for a `number` field and throws
      `SubmissionValidationError` on every instance creation.
- [x] 1.1a In `src/runtime/api.ts`, have the defaulting helper (1.1)
      return the set of field ids it filled (as distinct from ids
      `opts.data` supplied directly). Thread that set into
      `validateSubmissionData` by adding `defaultedIds?: Set<string>`
      to its existing `opts: { checkRequired: boolean }` parameter
      (defaulting to `new Set()` inside the function body when
      absent) — so `submitAndTransition`'s own existing call site
      (`src/runtime/api.ts:987`, which omits `opts` entirely) needs no
      change. Inside that function's per-key loop
      (`src/runtime/api.ts:716-724`), a field id present in
      `defaultedIds` MUST branch on whether `resolveFields` returns a
      `ResolvedViewField` for it, per design.md Decision 3's two
      exemption cases:
      - No `ResolvedViewField` at all (off-view): skip the
        `unknown-field` rejection. Validate the value directly against
        the field catalog entry's own declared `type` (`typeMatches`),
        its own static `options` (skipped entirely when the field is
        `dataSource`-bound, since there is no step context to resolve
        against), and its own `validation` constraints and
        `validation.rule`.
      - A `ResolvedViewField` that resolves readonly (on-view,
        including `technical: true`): skip only the `readonly-field`
        rejection. Take that field's ordinary `rf`-based path
        otherwise — check `rf.field.type`, the view-resolved
        `rf.options`, and `effectiveValidation(rf.field,
        viewFieldsByRef.get(fieldId))`, exactly as an editable field on
        that step already gets checked.

      Neither exemption MUST extend to a value `opts.data` supplies
      directly for that same field id: an explicitly submitted value
      for a field outside the initial step's view still throws
      `unknown-field`, and one for a field the view resolves readonly
      still throws `readonly-field`, both unchanged.
      Without this task, a default on any field the initial step's view
      does not reference throws `SubmissionValidationError` at every
      creation (see design.md Decision 3's added paragraphs), which
      makes task 1.12's assertion false.
- [x] 1.2 Wire that helper into `createProcessInstance` so it runs
      before `validateSubmissionData`. The working object already
      carries `opts.data` from the start; the loop only fills gaps
      `opts.data` left open, so an explicitly submitted value always
      wins over a default on the same field with no later overlay
      step, and a merged-in default gets validated the same way a
      submitted value does.
- [x] 1.2a Test: a field carrying only a `default` (no `opts.data`
      value for it) is visible to the initial step's assignment
      strategy resolver's `ctx.instance.data`, in
      `test/runtime-api.test.ts`, using a spy `AssignmentRegistry`
      entry (mirroring `test/assignment.engine.test.ts`'s
      `spyRegistry` pattern) passed as `createProcessInstance`'s
      `assignmentRegistry` argument. `resolveStepAssignment`
      (`src/runtime/api.ts:835`) reads the post-mapping `submitted`
      object, so this locks in that a default now resolves before
      assignment too, not only before validation.
- [x] 1.3 Test: a `Literal` default seeds a field `opts.data` leaves
      unset.
- [x] 1.4 Test: an explicitly submitted value wins over a default on
      the same field.
- [x] 1.5 Test: a later field's `Expression` default reads an earlier
      field's already-resolved value (submitted or defaulted) via
      `data`.
- [x] 1.5a Test: a default on a field NOT referenced by the initial
      step's view still seeds successfully, using
      `examples/expense-approval.json`'s `booking_status` field as the
      concrete case. The `book` step reads it only through its two
      automatic paths' guards. It writes it only through its onEntry
      action's output mapping; `book` declares no `view` key at all.
      The `booked` (terminal) step and the `booking_error` step both
      view-reference it readonly. The initial `capture` step's view
      references it nowhere. This is the prerequisite
      that makes task 1.12's assertion true; without task 1.1a this
      test throws `SubmissionValidationError` with an `unknown-field`
      issue instead of seeding.
- [x] 1.5b Test: an earlier-in-catalog-order field's `Expression`
      default that reads a later field's `data.<key>` raises for the
      missing key and leaves its own slot unset, locking in design.md
      Decision 4's catalog-order-only guarantee (a raise here, not a
      forward-visible read, is what makes catalog order sufficient
      without a dependency graph).
- [x] 1.6 Test: a raising `Expression` default leaves its field unset,
      and creation still succeeds.
- [x] 1.7 Test: a `group` field's own `default` is never read; its
      children's defaults still seed their own slots.
- [x] 1.8 Test: a default that resolves to a value failing type,
      option-membership, or a constraint (`min`/`max`/`minLength`/
      `maxLength`/`pattern`) throws `SubmissionValidationError`, the
      same as a bad `opts.data` value.
- [x] 1.8a Test: a default that fills a field id the initial step's
      resolved view marks readonly through a step-level `readonly`
      override, on a field whose catalog `validation` and whose
      step-level `validation` override disagree, is checked against
      the step's own overridden validation, not the catalog's.
- [x] 1.8b Test: a `FieldDef` declaring `technical: true` and a
      `Literal` default seeds that field's slot with no `opts.data`
      value for it, and creation raises no `readonly-field` issue.
- [x] 1.8c Test: an off-view, `dataSource`-bound field's `Literal`
      default seeds successfully regardless of its value, since
      creation has no step context to resolve the data source's
      options against for it.
- [x] 1.8d Test: an off-view field's default that fails its own
      effective `validation.rule` throws `SubmissionValidationError`
      with a `rule-failed` issue, using
      `examples/expense-approval.json`'s `booking_status` field (see
      1.5a) with an added `validation.rule` the default fails.
- [x] 1.8e Test: a field that is both a `columnMapping` write target
      and carries its own `default` has that default overwritten by
      the mapping's write, in `test/column-mapping.test.ts`. This
      locks in that `applyColumnMapping` (`src/runtime/api.ts:829-830`)
      runs after the defaulting loop and its `Object.assign` wins
      unconditionally, per design.md Decision 3's added paragraph.
- [x] 1.9 Test: a default `Expression` that reads `instance.status` or
      `instance.currentStepId` resolves against the stub's derived
      values and does not raise, locking in `buildGuardContext` as the
      evaluation context rather than a hand-rolled `{ id, startedBy }`
      shape.
- [x] 1.10 Test: an Expression default that evaluates to a CEL int
      (e.g. `default: { lang: "cel", src: "5" }` on a `number` field,
      or `data.qty * data.price` over two int fields) seeds a
      JSON-safe `number`, not a bigint, and does not throw.
- [x] 1.11 Test: a subprocess spawn (`core.spawnSubprocess`) and a
      `process.start` chain each create their instance through
      `createSeededInstance`, not `createProcessInstance`, so neither
      applies a catalog default the spawned/started process declares.
      This locks in design.md Decision 5's deliberate scope boundary
      as a regression test, in `test/subprocess.test.ts` and
      `test/process-chaining.test.ts`.
- [x] 1.12 Test: creating a fresh instance of
      `examples/expense-approval.json` with no `booking_status` in
      `opts.data` seeds `booking_status` to `"pending"` (its existing
      `default`) at creation; driving the instance through capture and
      review via `submitAndTransition` (the approve path) to reach the
      "book" step, that step still parks as a wait-state, since
      `"pending"` matches neither the `booked` nor the `failed` guard.
      Captures design.md's Risks-section note that this
      already-published example's dormant default goes live the
      moment this change ships.
- [x] 1.13 Nothing outstanding here: this change's own delta at
      `specs/runtime-api/spec.md` already carries the corrected
      wording verbatim, both on the "Submitted data is validated
      against field type, options, constraints, and rule" requirement
      ("`createProcessInstance` applies `default` once, at creation
      ... `submitAndTransition` never re-applies or re-checks it at a
      later transition") and on the "A declared default does not
      satisfy a missing required field" scenario ("`submitAndTransition`
      never applies `default`; only `createProcessInstance` does, once,
      at creation"). This task exists only as a marker that the two
      corrections landed; nothing here is left to write.

## 2. Studio: the Field tab's disclosure structure

- [x] 2.0 Before starting 2.1-2.7 and section 3's zone/Default-value
      work, invoke `/frontend-design:frontend-design` for visual
      direction on the Field tab's reorganization and the new
      Default-value zone; pull in `web-design-guidelines`,
      `vercel-react-best-practices` and `vercel-composition-patterns`
      per CLAUDE.md's UI-work convention
      (following `field-catalog-redesign`'s own precedent at its
      `tasks.md` 0.1); and check the result against
      `.claude/rules/design-language.md`.
- [x] 2.1 Restructure `FieldEditor`'s Field tab: key, label,
      description and type picker stay always visible; a group field's
      children stay outside any disclosure too. The developer view
      keeps its own existing, separate `<details>` disclosure,
      untouched by this change. The existing technical checkbox stays
      always-visible too, in its current position directly below the
      type picker (and its note).
- [x] 2.2 Replace the translation-status list with a badge beside the
      label input, reusing `fieldLocaleGaps` unchanged for the count.
- [x] 2.3 Wrap the preview ("How it will look") in a `<details>`,
      closed by default.
- [x] 2.4 Wrap the usage list ("Used in") in a `<details>`, closed by
      default.
- [x] 2.5 Remove field already sits last in the Field tab's JSX; wrap
      it in a rule and reduce its emphasis, with no reordering.
- [x] 2.6 CSS: the badge, the `<details>` disclosures, the
      `.field-tab-remove` rule and reduced-emphasis button, under the
      design language's structural-rule token.
- [x] 2.7 i18n: new `fieldCatalog.*` catalog keys for the badge and any
      new section text; remove now-unused translation-status-list keys.

## 3. Studio: Values/Rules zones and the Default-value editor

- [x] 3.1 Wrap the Values tab's existing sections ("Where values come
      from", the options/data-source block, the column-mapping block)
      in `.field-zone` wrappers with headings, ruled apart. Each new
      zone heading REPLACES that section's own existing inline
      heading: drop the options block's `<legend>{t("fieldCatalog.optionsLegend")}</legend>`,
      and drop the column-mapping block's own `<p
      className="studio-column-mapping-heading">{t("columnMapping.heading")}</p>`
      (it already reads "Column mapping," the same string the new zone
      heading uses). See design.md Decision 2.
- [x] 3.2 Wrap the Rules tab's existing sections (the condition row,
      `FieldValidationEditor`) in `.field-zone` wrappers with headings,
      ruled apart. The new zone heading REPLACES
      `FieldValidationEditor`'s own `<summary>{t("fieldValidation.legend")}
      ({carried.length})</summary>` label text: keep only the count in
      the `<summary>`, or make the zone heading itself the `<details>`
      disclosure's summary, so no redundant "validation (N)" toggle
      renders beneath a heading that already says Rules. See design.md
      Decision 2.
- [x] 3.3 Build the Default-value editor: a literal input whose type
      follows the field's `baseFieldType`, a link-styled toggle that
      switches to a raw CEL textarea (holding unparsed text in
      component state until it type-checks, matching
      `PluginEnvelopeEditor`'s `configText` pattern), writing
      `field.default` as a `Literal` or an `{ lang: "cel", src }`
      Expression.
- [x] 3.3a Extend the Default-value editor for the five types 3.3's
      plain literal input does not cover: a `<select>` bound to the
      field's own static `options` for `select`, and the multi-value
      equivalent for `multiselect` (either offering no option, while
      keeping the CEL toggle, when the field is `dataSource`-bound);
      and a disabled zone with a no-default note for `reference`,
      `file`, and `group` (mirroring the reference/file treatment,
      stating that a group's own default is never read).
- [x] 3.4 Clearing either input removes the `default` key.
- [x] 3.5 CSS: `.field-zone` heading/rule styles.
- [x] 3.6 i18n: new catalog keys for the zone headings and the
      Default-value editor's labels and toggle text.
- [x] 3.7 Test: writing through the literal input sets `default` to
      that literal value; writing through the CEL toggle sets it to an
      Expression; clearing either removes the key.
- [x] 3.7a Test: a `select` field's literal default writes its chosen
      option; a `dataSource`-bound field's literal control offers no
      option while its CEL toggle still writes an Expression; a
      `reference`/`file` field's Default-value zone renders disabled;
      a `group` field's Default-value zone renders disabled with a
      no-default note.

## 4. Studio: the Fields rail row

- [x] 4.1 Change the rail row markup in `PanelsScreen.tsx` to drop the
      key line, keeping the resolved label, the friendly type and the
      issue mark on one line.
- [x] 4.2 CSS: remove the now-unused `.studio-panels-rail-key` rule
      (or repurpose it), adjust row height for the single line.
- [x] 4.3 Test: a rail row renders no `key` text, for a field that
      carries one.

## 5. Docs

- [x] 5.1 `docs/decisions.md`: close the "No default-value editor for
      `FieldDef.default`" entry, replacing it with a record that this
      change landed the runtime-api trigger it named.
- [x] 5.2 `docs/authoring-guide.md`: add a subsection on
      `FieldDef.default` — its Literal | Expression shape, that it
      seeds `createProcessInstance`'s initial data only (not
      `submitAndTransition`, not a subprocess spawn or a
      `process.start` chain), catalog-order evaluation with
      cross-field visibility, and total-CEL semantics (a raise leaves
      the field unset, never a throw).
- [x] 5.3 `docs/browser-checks.md`: fix the panels-list-and-detail
      check's stale "lists all 22 field keys" line (task 4.1 drops the
      key from the rail row in favor of the resolved label, so the
      rail now lists labels, not keys), and add a new dated section
      sourced to this change covering the Field tab's disclosures, the
      rail row's dropped key, and a literal or CEL default write and
      read back, per task 6.5.
- [x] 5.3a `docs/current-state.md`: extend the Runtime API Layer
      entry's `createProcessInstance` description (`:352-360`) to
      mention default-seeding, the threaded `defaultedIds` validation
      exemption for an off-view or readonly-defaulted field, and the
      `evalFieldMap`-based evaluation path (task 1.1).
- [x] 5.4 Run the antislop skill on `docs/decisions.md`'s edited entry,
      `docs/authoring-guide.md`'s new subsection (5.2),
      `docs/browser-checks.md`'s fixed line and new dated section
      (5.3), `docs/current-state.md`'s edited entry (5.3a), and this
      change's own `proposal.md`, `design.md`, `tasks.md`, and
      `specs/**/spec.md`, for earlier feedback than the push gate's own
      antislop check.

## 6. Verification

- [x] 6.1 `bun run typecheck`
- [x] 6.2 `bun run build`
- [x] 6.3 Full `bun test` with `DATABASE_URL` set (not a single-file
      rerun); check the skip count, not only the pass count.
- [x] 6.4 `git diff --check` for trailing whitespace and blank-at-eof.
- [x] 6.5 A real browser check: the Field tab's disclosures open and
      survive a tab switch, the rail row prints no key, a literal
      default writes and reads back, and a CEL default writes and
      reads back.
