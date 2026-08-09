## 1. Build-time version constant

- [x] 1.1 In `packages/web/vite.config.ts`, read the repo-root `VERSION`
      file with `readFileSync`, resolved via
      `fileURLToPath(new URL("../../VERSION", import.meta.url))` rather
      than a `cwd`-relative path (a workspace-filtered build's `cwd` sits
      at `packages/web/`). Trim the trailing newline, and add a `define`
      entry inlining the result as `__APP_VERSION__`.
- [x] 1.2 Add a `declare const __APP_VERSION__: string;` ambient
      declaration (new `packages/web/src/vite-env.d.ts`, or an existing
      ambient `.d.ts` if one already declares globals), so
      `tsc --noEmit` resolves the identifier.

## 2. Account menu

- [x] 2.1 In `packages/web/src/shell/Chrome.tsx`, render `__APP_VERSION__`
      as a plain, non-interactive line inside the account menu, placed
      after the Logout button and outside the menu's `role="menuitem"`
      elements.
- [x] 2.2 In `packages/web/src/shell/shell.css`, add a rule for that line:
      the mono type face, and a 1px hairline rule above it separating it
      from Logout, following the existing `shell-menu-*` naming and the
      hairline-vs-divider convention in `.claude/rules/design-language.md`.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`.
- [x] 3.2 Run `bun run build`.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm
      the skip count, not just the pass count.
- [x] 3.4 Build `packages/web` and open it in a real browser. Sign in,
      open the account menu, and confirm the version line matches the
      repo's `VERSION` file, sits below Logout behind a hairline, renders
      in the mono face, and is not announced as a menu item by the
      accessibility tree.
