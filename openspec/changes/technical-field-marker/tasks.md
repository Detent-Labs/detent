## 1. Definition contract

- [ ] 1.1 Add `technical?: boolean` to the `FieldDef` TS type and the
      `fieldDef` Zod schema in `src/schema/definition.ts`.
- [ ] 1.2 Add one `checkTechnicalFields` function to `src/schema/compile.ts`,
      covering both rules: reject `technical: true` on a `type: "group"`
      field, and reject a `view.fields[]` entry naming a technical field
      that declares `required` or `readonly` at all (literal `true`,
      literal `false`, or CEL). Do not nest either rule inside
      `checkFieldTree` or `checkViewFieldPatterns` — a technical group
      field with no view entry would then never reach the group check.
- [ ] 1.3 Add `checkTechnicalFields` as its own entry in `structuralIssues`'s
      array (`compile.ts:737-746`), the one call site every structural
      write-path check already funnels through.
- [ ] 1.4 Test: publish rejects `technical: true` on a group field.
- [ ] 1.5 Test: publish rejects `required: true`, `readonly: true`,
      `readonly: false`, and CEL in either key, on a technical field's
      view entry.
- [ ] 1.6 Test: publish accepts a technical field's view entry declaring
      only a display-only key (`order`).
- [ ] 1.7 Test: a body declaring no field's `technical` hashes identically
      before and after this change.

## 2. Engine resolution

- [ ] 2.1 In `resolveFields` (`src/runtime/api.ts`), force
      `required: false, readonly: true` for a `ViewField` resolving to a
      `technical: true` field, the same two lines that already force
      `false, false` for a group field.
- [ ] 2.2 Test: `getInstanceView` reports `required: false, readonly:
      true` for a technical field, regardless of the view entry's own
      declaration (construct the `ProcessBody` directly, not via compile,
      since compile now refuses a body violating task 1.2's rule).
- [ ] 2.3 Test: `submitAndTransition` rejects a submitted key naming a
      technical field with the existing `readonly-field` issue.

## 3. Field catalog

- [ ] 3.1 Add a Technical checkbox to the field catalog's Field tab
      (`packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`),
      following the existing convention: write `technical: true` on
      check, delete the key on uncheck.
- [ ] 3.2 Disable the control for a field of `type: "group"`.

## 4. Form editor

- [ ] 4.1 In the per-step strip, stop offering `required`/`readonly`
      controls when the selected field's `FieldDef` declares
      `technical: true`; keep `visible`, `group`, `span` offered.
      Confirm the exact visual treatment with
      `/frontend-design:frontend-design` (design.md Open Questions).

## 5. Field matrix

- [ ] 5.1 Add a technical-field row marker to `FieldMatrixGrid`/
      `fieldMatrixLogic.ts`, visually distinct from the flagged-cell
      marker. Confirm the exact visual treatment with
      `/frontend-design:frontend-design` (design.md Open Questions).
- [ ] 5.2 Give `gatedKeys` (`draft/view-flags.ts`) an optional
      technical-field signal, so it gates `required` and `readonly`
      unconditionally for a technical field's entry, the same way it
      already gates both when `visible` is `false`. This is the shared
      gate three call sites already use: the form editor's strip
      (`FormEditorScreen.tsx`), the matrix's per-cell checkbox
      `disabled` computation (`FieldMatrixGrid.tsx:314`), and
      `cellEligible`/`eligibleTargetEntries` (`fieldMatrixLogic.ts`),
      which the bulk badges call. Widening `gatedKeys` here covers all
      three from one source of truth. Do not filter `rowLiveTargets`/
      `columnLiveTargets` instead: those functions are shared by the
      `visible` bulk badge too, which stays offered for a technical
      field.
- [ ] 5.3 Test: a technical field's individual matrix cell shows its
      `required`/`readonly` checkboxes disabled, its row offers no
      `required`/`readonly` bulk badge, a column's bulk badge does not
      change a technical field's cell, and the row's `visible` bulk
      badge still works.

## 6. Checks rail

- [ ] 6.1 Add the inverse finding to `view-flags.ts` (or a sibling): a
      field declaring `technical: true`, with no structural writer
      (per `writtenFieldCounts`) and no `default`, reports under the
      `view` source, anchored on the field (`entityType: "field"`).
- [ ] 6.2 Test: the finding fires for an unwritten, default-less
      technical field.
- [ ] 6.3 Test: the finding does not fire for a technical field carrying
      a `default`, even when nothing structurally writes it (the
      default-exemption clause named in design.md's Risks section).
- [ ] 6.4 Test: the finding does not fire for a technical field a
      structural writer targets.

## 7. Documentation

- [ ] 7.1 Add `technical` to `docs/authoring-guide.md`.
- [ ] 7.2 Add a sentence to `.claude/rules/process-contract.md`'s "Data
      vs presentation" section, noting `technical` refines rather than
      breaches the "requiredness lives only in the view" rule.
- [ ] 7.3 Rewrite ROADMAP.md stage 44 from "NOT STARTED, no decision made"
      to reflect the decisions in this change: declared boolean marker,
      runtime and publish enforcement, the inverse checks-rail finding,
      and inference explicitly deferred.
- [ ] 7.4 Remove the technical-field open question from
      `docs/decisions.md` (lines 18-26), which still asks "inference or
      a declared schema key" after this change settles it.

## 8. Browser check

- [ ] 8.1 On `loan_application`, mark `result` technical. Confirm the
      form editor's strip and the field matrix stop offering
      Required/Read-only for it, the checks rail reports it as unwritten
      (before any writer is wired), and publish blocks while a stale
      `required: true` entry from before this change remains on it.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck`.
- [ ] 9.2 Run `bun run build`.
- [ ] 9.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm
      the skip count, not only the pass count.
- [ ] 9.4 Run the antislop linter over every Markdown file this change
      touched.
- [ ] 9.5 Run `git diff --check` for trailing whitespace and blank lines
      at EOF.
