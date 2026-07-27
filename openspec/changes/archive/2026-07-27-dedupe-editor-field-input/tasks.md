## 1. Hoist option list

- [x] 1.1 `FieldInput.tsx`: compute `options` once (before the `if`/`else
      if` chain) from `field.options`, per `design.md`.
- [x] 1.2 Update the `select` branch to render `<option value="" />
      {options}`.
- [x] 1.3 Update the `multiselect` branch to render `{options}`.

## 2. Merge text branches

- [x] 2.1 Delete the `isFreeTextFallback` variable and its `if` branch.
- [x] 2.2 Move its explanatory comment to sit above the chain's final
      `else` branch.
- [x] 2.3 Confirm `reference`/`file`/plugin-envelope types still render a
      text input by falling through to the final `else` (no explicit
      `else if` matches them).

## 3. Verification

- [x] 3.1 Run `packages/editor/test/player-field-input-rendering.test.tsx`
      and confirm all pass (covers every `BaseFieldType`, the free-text
      fallback cases, and the dataSource-bound option-rendering case).
      15/15 pass, 23 expect() calls.
- [x] 3.2 Run `bun run typecheck`. Passed (engine + editor).
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm 0 failures. 859 pass, 0 fail, 2286
      expect() calls.
