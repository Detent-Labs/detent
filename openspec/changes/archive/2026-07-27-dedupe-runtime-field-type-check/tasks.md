## 1. JS_TYPE table

- [x] 1.1 `src/runtime/api.ts`: add the `JS_TYPE: Record<BaseFieldType,
      string>` table per `design.md`, importing `BaseFieldType` from
      `../schema/definition.js` if not already imported.
- [x] 1.2 Rewrite `typeMatches` to use `JS_TYPE` plus the plugin-type and
      `"any"`/`"string[]"` guards per `design.md`.
- [x] 1.3 Rewrite `expectedTypeLabel` to use `JS_TYPE` per `design.md`.
- [x] 1.4 Diff every `JS_TYPE` entry against both original switches'
      corresponding case to confirm no transcription errors (this is
      submission validation at a trust boundary).

## 2. Verification

- [x] 2.1 Run `test/runtime-api.test.ts` and confirm all pass, especially
      the `type-mismatch` tests (line ~341: `field_amount` expects
      `"number"`; line ~493-494: a wrongly-shaped value is rejected).
      50/50 pass, 125 expect() calls.
- [x] 2.2 Run `bun run typecheck` — confirms `JS_TYPE` is exhaustive over
      `BaseFieldType`. Passed (engine + editor).
- [x] 2.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm 0 failures. 859 pass, 0 fail, 2286
      expect() calls.
