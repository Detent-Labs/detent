## 1. Gate: audit published bodies for view.renderer

- [ ] 1.1 Run the audit query from design.md's Migration Plan against the
      `definitions` table (production snapshot or read replica):
      confirm whether any published `ProcessBody` sets a step's
      `view.renderer`. Record the result (row count and, if non-zero, the
      affected `(process_id, version)` pairs) in this change's PR
      description or a follow-up comment.
- [ ] 1.2 If the audit found zero rows: proceed to section 4 (finding 67).
      If it found any rows: stop before section 4, drop finding 67 from
      this change per design.md D1, and open a separate follow-up for it.
      Findings 65/66 (sections 2-3) are unaffected either way and proceed
      regardless of this gate's outcome.

## 2. Shared leafFields helper (finding 66)

- [ ] 2.1 Add `export function leafFields(fields: FieldDef[]): FieldDef[]`
      to `src/schema/definition.ts`, beside `collectFieldsDeep`: return
      `collectFieldsDeep(fields)` filtered to drop every field whose
      `type` is the string `"group"`.
- [ ] 2.2 Rewrite `dataSchema` and `contractFieldSchema`
      (`src/cel/check.ts`) to call `leafFields(fields)` in place of their
      own `collectFieldsDeep(fields)` + inline `type === "group"` filter.
      Keep each function's own subsequent logic (the `celType` mapping in
      `dataSchema`, the `allowed`-id filter in `contractFieldSchema`)
      unchanged.
- [ ] 2.3 Rewrite `fieldKeyById` (`src/cel/eval.ts`) to call
      `leafFields(fields)` the same way, dropping its own inline group
      filter.
- [ ] 2.4 Run `test/cel.test.ts` and `test/eval.test.ts` and confirm they
      pass unchanged — these exercise `dataSchema`, `contractFieldSchema`,
      and `fieldKeyById`'s observable output and must show no behavior
      change.

## 3. Merge the compile.ts field-tree checks (finding 65)

- [ ] 3.1 Read `test/compile-validation.test.ts` and
      `test/column-mapping.test.ts` in full before touching `compile.ts`
      (design.md D2): note any assertion that depends on the current
      four-pass issue order (e.g. array-index or full-array equality)
      rather than per-issue containment.
- [ ] 3.2 Write one merged field-tree walk in `src/schema/compile.ts` that
      replaces `checkPatterns`, `checkColumnMapping`,
      `checkFieldKeyFormat`, and the field-key-length loop inside
      `checkLengthBounds`: a single `walkFieldsIndexed(body.fields,
      "fields", ...)` callback that, per field, runs the pattern check,
      then the `columnMapping` check, then the key-format check, then the
      key-length check, pushing each check's issues with its pre-existing
      `loc`, `value`, and `message` text unchanged.
- [ ] 3.3 Update `structuralIssues` to call the merged function once in
      place of the four separate calls it made before. Leave
      `checkIdResolution` untouched (design.md Non-Goals) and leave
      `checkLengthBounds`'s other three sweeps (plugin-type length,
      expression length, duration length) as their own function, now
      without the field-key-length loop.
- [ ] 3.4 Update any order-sensitive assertion identified in 3.1 to an
      order-independent form (e.g. `toContainEqual` per expected issue)
      rather than reordering the merged walk to match the old output.
- [ ] 3.5 Run `test/compile-validation.test.ts` and
      `test/column-mapping.test.ts` and confirm every pre-existing
      assertion still passes (after 3.4's updates, if any were needed).

## 4. Delete view.renderer (finding 67, gated by section 1)

- [ ] 4.1 Delete `renderer: plugin.optional()` from the `view` object
      schema in `src/schema/definition.ts`.
- [ ] 4.2 Delete the `view.renderer` shape check inside `walkViewKeys`
      (`src/schema/compile.ts`) that validates a `renderer` object's keys
      against `PLUGIN_KEYS`.
- [ ] 4.3 Delete the `view.renderer` push (`if (s.view?.renderer)
      pushType(...)`) inside `collectPluginTypeSites`
      (`src/schema/compile.ts`).
- [ ] 4.4 Search `test/` for any existing fixture or assertion that sets or
      asserts on `view.renderer` (a compile/publish test, a CEL test, or an
      example-loading test). Update it, or delete it, to match the new
      unknown-key rejection.
- [ ] 4.5 Add a regression test asserting that an authored body with a
      step's `view.renderer` set fails to publish as an unknown key at
      `steps[<i>].view.renderer` (per CLAUDE.md: "every invariant that
      lands ships with a test that rejects a violating input"; this
      applies symmetrically to a deleted field newly becoming a
      rejection).

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and confirm it passes with no errors.
- [ ] 5.2 Run `bun run build` and confirm it succeeds.
- [ ] 5.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, with no silent
      skips (check the skip count, not only the pass count).
- [ ] 5.4 Run the antislop linter over `proposal.md`, `design.md`, the
      spec delta under `specs/`, and `tasks.md`.
- [ ] 5.5 Run `git diff --check` for trailing whitespace and blank-at-eof.
