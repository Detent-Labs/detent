<!-- antislop: allow-file synonym-rotation -->
<!-- This file uses "update" throughout for editing a file (e.g. task 2.3's
     "Update `structuralIssues`"). It uses "change" for the OpenSpec change
     itself, in sections 3 and 4. Two different concepts sharing a word
     family, not a rotation to fix. -->

## 1. Shared leafFields helper (finding 66)

- [x] 1.1 Add `export function leafFields(fields: FieldDef[]): FieldDef[]`
      to `src/schema/definition.ts`, beside `collectFieldsDeep`: return
      `collectFieldsDeep(fields)` filtered to drop every field whose
      `type` is the string `"group"`. Update `collectFieldsDeep`'s own
      doc comment too: it currently tells a caller that needs leaves
      only to filter out `f.type === "group"` itself. Point it at
      `leafFields` instead, since all three current callers of that
      inline-filter pattern (task 1.2, 1.3) now go through the new
      helper.
- [x] 1.2 Rewrite `dataSchema` and `contractFieldSchema`
      (`src/cel/check.ts`) to call `leafFields(fields)` in place of their
      own `collectFieldsDeep(fields)` + inline `type === "group"` filter.
      Keep each function's own subsequent logic (the `celType` mapping in
      `dataSchema`, the `allowed`-id filter in `contractFieldSchema`)
      unchanged.
- [x] 1.3 Rewrite `fieldKeyById` (`src/cel/eval.ts`) to call
      `leafFields(fields)` the same way, dropping its own inline group
      filter.
- [x] 1.4 Run `test/cel.test.ts` and `test/eval.test.ts` and confirm they
      pass unchanged — these exercise `dataSchema`, `contractFieldSchema`,
      and `fieldKeyById`'s observable output and must show no behavior
      change.

## 2. Merge the compile.ts field-tree checks (finding 65)

- [x] 2.1 Read `test/compile-validation.test.ts` and
      `test/column-mapping.test.ts` in full before touching `compile.ts`
      (design.md D2): note any assertion that depends on the current
      four-pass issue order (e.g. array-index or full-array equality)
      rather than per-issue containment.
- [x] 2.2 Write one merged field-tree walk in `src/schema/compile.ts`: a
      single `walkFieldsIndexed(body.fields, "fields", ...)` callback
      that, per field, calls `checkPatterns`, `checkColumnMapping`, and
      `checkFieldKeyFormat` by name, in that fixed sequence, followed by
      the field-key-length check inlined in the same callback (design.md
      "D2 (continued)"). Reshape each of the three named functions to
      take one field, plus its indexed location, instead of iterating
      `body.fields` itself — the three keep their pre-change names so
      every existing reference to `checkPatterns` and `checkColumnMapping`
      outside this change (`studio-column-mapping-form/spec.md`,
      `studio-field-validation-form/spec.md`, `docs/current-state.md`)
      keeps naming a real, callable function. Push each check's issues
      with its pre-existing `loc`, `value`, and `message` text unchanged.
      `checkColumnMapping` alone also needs whole-body state no sibling
      check uses: the `fieldsById` map (`compile.ts:518`), built once via
      `collectFieldsDeep(body.fields)` over the WHOLE tree, not the field
      under walk. It resolves `columnMapping` targets and detects a
      group-typed target, a self-target, and a duplicate target
      (`compile.ts:542-556`) — three issue kinds `checkPatterns` and
      `checkFieldKeyFormat` have no equivalent of, since neither reads
      any field but the one it is checking. Build `fieldsById` once,
      outside the merged `walkFieldsIndexed` callback, the same way
      `checkColumnMapping` builds it today; pass it into the reshaped
      `checkColumnMapping(field, floc, fieldsById)` on every call rather
      than rebuilding it per field.
- [x] 2.3 Update `structuralIssues` to call the merged function once in
      place of the four separate calls it made before. Leave
      `checkIdResolution` untouched (design.md Non-Goals) and leave
      `checkLengthBounds`'s other three sweeps (plugin-type length,
      expression length, duration length) as their own function, now
      without the field-key-length loop. Update `checkLengthBounds`'s own
      doc comment (`compile.ts:704-706`) to match: it currently reads
      "Length bounds on key, Plugin.type, duration and Expression.src",
      which overclaims once the field-key-length loop moves into the
      merged walk. Drop `key` from that sentence, the same way task 1.1
      updates `collectFieldsDeep`'s doc comment to match its own
      narrowed behavior.
- [x] 2.4 Update any order-sensitive assertion identified in 2.1 to an
      order-independent form (e.g. `toContainEqual` per expected issue)
      rather than reordering the merged walk to match the old output.
- [x] 2.5 Run `test/compile-validation.test.ts` and
      `test/column-mapping.test.ts` and confirm every pre-existing
      assertion still passes (after 2.4's updates, if any were needed).

## 3. Gate: audit published bodies for view.renderer

- [x] 3.1 Run the audit query from design.md's Migration Plan against the
      `definitions` table (production snapshot or read replica). This
      repo documents no procedure for reaching such an environment
      (`openspec/specs/deployment-runbook/spec.md` names none): if none
      is reachable, or the person or agent applying this change lacks
      access to one, do not treat the gate as satisfied. Record that
      explicitly in this change's PR description or a follow-up comment
      — the query did not run, and why — rather than proceeding as if it
      returned zero rows. Note in the same record that design.md's
      Context section already found zero producers of `view.renderer` by
      grep and no example that sets it, which makes a zero-row outcome
      the expected one even without running the query; that expectation
      is not a substitute for the query's own result. When the query
      does run, confirm whether any published `ProcessBody` sets a
      step's `view.renderer` and record the result (row count and, if
      non-zero, the affected `(process_id, version)` pairs).

      **Result, recorded 2026-08-17**: the query did not run. This repo
      names no procedure for reaching a production snapshot or read
      replica, confirmed by reading `openspec/specs/deployment-runbook/
      spec.md` in full — it covers only the runbook's environment-variable
      table, and names no path to production data. The only database this
      environment can reach is the devcontainer's own local dev/test
      Postgres instance, which carries no production history and cannot
      answer whether a real deployment ever published a body setting
      `view.renderer`. Running the query there would prove nothing about
      production and is not a substitute for the query design.md
      specifies.
- [x] 3.2 If the audit found zero rows: proceed to section 4 (finding 67).
      If it found any rows: stop before section 4, drop finding 67 from
      this change per design.md D1, and open a separate follow-up for it.
      If the query could not be run at all (no reachable environment, or
      no access to one): treat that identically to the any-rows branch —
      stop before section 4 and record why, per 3.1, rather than
      proceeding as if it had returned zero rows. Sections 1-2 (findings
      65/66) are unaffected either way and proceed regardless of this
      gate's outcome.

      **Outcome**: the query could not run (3.1). Per this task's own
      instruction, that outcome is treated identically to the any-rows
      branch. Section 4 (finding 67, deleting `view.renderer`) does NOT
      proceed in this change. It drops out per design.md's D1 ("Review
      may find the risk below unacceptable. If so, finding 67 can drop
      out of this change. It can then get re-proposed alone, without
      touching findings 65/66."), to be re-proposed as its own change once
      a reachable production audit environment exists. Sections 1 and 2
      (findings 65/66) proceeded and are complete, unaffected by this
      gate.

## 4. Delete view.renderer (finding 67, gated by section 3)

**Out of scope for this change.** Section 3's gate did not clear. The audit
query could not run; see 3.1/3.2's recorded result. None of the tasks below
apply here. They stay unchecked and undone by design, not as a defect to fix
before archiving this change. Finding 67 needs its own, separate change once
a reachable production audit environment exists.

- [ ] 4.1 Delete `renderer: plugin.optional()` from the `view` object
      schema in `src/schema/definition.ts`.
- [ ] 4.2 Delete the `view.renderer` shape check inside `walkViewKeys`
      (`src/schema/compile.ts`) that validates a `renderer` object's keys
      against `PLUGIN_KEYS`.
- [ ] 4.3 Delete the `view.renderer` push (`if (s.view?.renderer)
      pushType(...)`) inside `collectPluginTypeSites`
      (`src/schema/compile.ts`). Update that function's doc comment too:
      drop `view.renderer.type,` from the list of `Plugin.type` sites it
      names, since the function no longer visits that site.
- [ ] 4.4 Search `test/` for any existing fixture or assertion that sets or
      asserts on `view.renderer` (a compile/publish test, a CEL test, or an
      example-loading test). Update it, or delete it, to match the new
      unknown-key rejection.
- [ ] 4.5 Add a regression test asserting that an authored body with a
      step's `view.renderer` set fails to publish as an unknown key at
      `workflow.steps[<i>].view.renderer` (per CLAUDE.md: "every invariant
      that lands ships with a test that rejects a violating input"; this
      applies symmetrically to a deleted field newly becoming a
      rejection).

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes with no errors.
- [x] 5.2 Run `bun run build` and confirm it succeeds.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, with no silent
      skips (check the skip count, not only the pass count).
- [x] 5.4 Run the antislop linter over `proposal.md`, `design.md`, the
      spec delta under `specs/`, and `tasks.md`.
- [x] 5.5 Run `git diff --check` for trailing whitespace and blank-at-eof.
