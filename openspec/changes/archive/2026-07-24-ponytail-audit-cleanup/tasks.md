## 1. Delete dead editor draft-validation file

- [x] 1.1 Grep `validateDraft`, `DraftValidationIssue`, `DraftValidationResult`
      across `src/` and `packages/` to confirm zero callers remain (the audit
      finding is a snapshot and may be stale).
- [x] 1.2 Delete `packages/editor/src/draft/validate.ts`.
- [x] 1.3 Run `bun run typecheck` for the editor package to confirm nothing
      imported it.

## 2. Merge the registry-validation error classes

- [x] 2.1 In `src/engine/definitions.ts`, collapse
      `RegistryValidationError` and `AssignmentRegistryValidationError` into
      one implementation (constructor `name` argument or a thin subclass),
      keeping both class names exported and both `error.name` values
      unchanged so `instanceof` checks and error messages at every call site
      keep working. (Also folded in `DataSourceRegistryValidationError`,
      found byte-identical to the other two but missed by the audit scan —
      same base class, no extra cost.)
- [x] 2.2 Grep call sites (`instanceof RegistryValidationError`,
      `instanceof AssignmentRegistryValidationError`, `.name ===`) to confirm
      none depend on internal class structure beyond name/instanceof.
      Confirmed: `test/definitions.test.ts`, `test/assignment-registry.test.ts`,
      `test/data-source-registry-publish.test.ts` all use
      `instanceof <SpecificClass>` + `.issues`, both preserved.

## 3. Deduplicate the registry-check issue-mapping loop

- [x] 3.1 In `src/engine/registry-check.ts`, extract the shared
      Zod-issue-to-`RegistryIssue` mapping loop (`.config.` path join +
      push) used by `checkActionRegistry` and `checkAssignmentRegistry` into
      one local `mapConfigIssues(loc, type, zodResult)` helper. (Also found
      and folded in a third identical copy in `checkDataSourceRegistry`,
      missed by the audit scan — same helper, no extra design cost.)
- [x] 3.2 Update both call sites to use the helper, preserving identical
      `RegistryIssue` output (same fields, same ordering). (All three call
      sites updated.)

## 4. Verification

- [x] 4.1 Run `bun run typecheck` for the whole workspace. Clean (engine +
      editor).
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun — see `CLAUDE.md`), and confirm
      `test/definitions.test.ts` and the registry-validation test files pass
      unmodified. 732 pass / 0 fail / 1990 expect() calls across 46 files.
