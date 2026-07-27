## 1. Shared helper

- [x] 1.1 Add `pushIssues(issues, body, items, source)` local function to
      `validation.ts` per `design.md`.

## 2. Call-site migration

- [x] 2.1 Duration loop: replace with `pushIssues(issues, body, validateDurations(body), "duration")`.
- [x] 2.2 Registry loop: replace with `pushIssues(issues, body, checkActionRegistry(compiled, registry), "registry")`
      (still guarded by `if (registry)`).
- [x] 2.3 CEL-main loop: replace with `pushIssues(issues, body, validateProcessBody(compiled), "cel")`.
- [x] 2.4 CEL-subprocess loop: replace with `pushIssues(issues, body, checkSubprocessChildRefs(body, stepIndex, childBody), "cel")`.
- [x] 2.5 Leave the Zod-issues `.map()` branch untouched (out of scope per design.md).

## 3. Verification

- [x] 3.1 Run `packages/editor/test/validation.test.ts` directly and
      confirm all cases still pass unmodified. 9/9 pass, 18 expect() calls.
- [x] 3.2 Run `bun run typecheck`. Passed (engine + editor).
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun). 859 pass, 0 fail, 2286 expect() calls.
