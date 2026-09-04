## 1. Branch and dependencies

- [x] 1.1 Branch from `d8a25d5` on `StyleX`. Verify: `git log -1` shows the proof-of-concept commit as the parent.
- [x] 1.2 Revert the nine non-pilot proof-of-concept files to `main`: `CanvasView.tsx`, `OutboxScreen.tsx`, `components.tsx`, `PathButtons.tsx`, `TaskScreen.tsx`, `PlayerScreen.tsx`, `studio/app.css`, `reporting/app.css` and `packages/form-ui/src/form-ui.css`. The last one carries the `.form-ui-paths` rule the reverted `PathButtons.tsx` needs. Verify: `git diff main --stat` lists none of the nine, and `CanvasView.tsx` still emits the literal classes `canvas-node` and `panzoom-exclude`.
- [x] 1.3 Keep the `@stylexjs/stylex` entries the proof of concept added to `packages/form-ui/package.json`; task 4.2 requires them. Verify: `git diff main -- packages/form-ui/package.json` shows only those two entries.
- [x] 1.4 Delete `packages/web/src/shell/buttonStyles.ts`, which nothing imports after 1.2. Keep `packages/web/src/stylex-virtual.d.ts`: it declares the dev-only module `main.tsx` imports. Verify: `bun run typecheck` passes.
- [x] 1.5 Keep `@stylexjs/stylex@0.19.0` and `@stylexjs/unplugin@0.19.0` pinned in `packages/web`. Verify: `bun install --frozen-lockfile` exits 0.
- [x] 1.6 Keep the dev-only `virtual:stylex:runtime` import in `main.tsx`. Verify: a dev server shows the pilot header styled, and `dist/assets/*.js` carries no reference to the virtual module. (Fixing this exposed a real dev-mode regression from task 4.2's move. `form-ui` resolves through `node_modules`. Vite's dependency scanner pre-bundled `tokens.stylex.ts` with esbuild before the StyleX plugin ran, throwing "Unexpected `stylex.defineVars` call at runtime." Fixed by adding `optimizeDeps: { exclude: ["form-ui"] }` to `vite.config.ts`.)

## 2. Build setup

- [x] 2.1 Move `contentSecurityPolicy()` into `packages/web/csp.ts` with a type-only Vite import; re-export nothing else. Verify: `vite.config.ts` imports it and the build passes.
- [x] 2.2 Point `packages/web/test/vite-config.test.ts` at `../csp.js`. Verify: the file no longer imports `vite.config`.
- [x] 2.3 Configure `stylex.vite()` before `react()` with `unstable_moduleResolution` at the workspace root, `cssInjectionTarget` matching `index-*.css`, and no `useCSSLayers`. Verify: `dist/assets/index-*.css` holds the compiled block, and no rule in it sits inside an `@layer` block.
- [x] 2.4 Add the browserslist key to `packages/web/package.json`. Verify: the emitted media query matches Vite's target list.
- [x] 2.5 Add a `closeBundle` assertion that the stylesheet linked by `dist/index.html` contains the prefix `clip-path: polygon(`. Only the header's compiled rule produces that declaration once `shell.css` loses its copy. Grep the prefix, not the full value: the emitted CSS normalizes `0.4rem` to `.4rem`. Verify: point `cssInjectionTarget` at `root-*.css` instead, so the compiled rules land in an area sheet. The assertion then fails and names the file it checked.

## 3. Test story

- [x] 3.1 Replace `test/preload-stylex.ts` with a `mock.module("@stylexjs/stylex", ...)` call. The `create` export returns its argument with each value replaced by its key name. The `props` export joins the class names its arguments carry. The `defineVars` export returns its argument's keys as their own values. The `defaultMarker` export is an identity no-op. Verify: the file imports only `bun:test`.
- [x] 3.2 Add `packages/web/test/preload-stylex-mock.test.ts`, asserting that `import("@stylexjs/stylex")` resolves to the stub's shape and that `test/preload-stylex.ts` imports only `bun:test`. Verify: the test passes.
- [x] 3.3 Run the web and form-ui DOM suites. Verify: every suite passes, including `vite-config.test.ts`.
- [x] 3.4 Run the full suite with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`, with the pilot in place and every other conversion reverted. Verify: zero failures and the gate exits 0.

## 4. Tokens and global styles

- [x] 4.1 Move `tokens.stylex.ts` from `packages/web/src/shell/` to `packages/form-ui/src/`, aliasing every custom property `tokens.css` declares. Verify: the module lists 39 variables across its groups.
- [x] 4.2 Add the `./tokens.stylex` export to `packages/form-ui/package.json`. Task 1.3 already kept the `@stylexjs/stylex` peer. Change `Chrome.tsx`'s import from the web-local `./tokens.stylex` to the form-ui-exported path. Verify: `packages/web` imports the module and typecheck passes. The built entry stylesheet then contains a hashed declaration of a token the module defines.
- [x] 4.3 Move every element and universal selector out of `tokens.css` into `packages/web/src/shell/global.css`: `*`, `body`, the `button, input, select, textarea` group, `:focus-visible`, `button`, `button:disabled`, `select`, `select:focus-visible`, `h1` and `h2`. Leave the `.btn` family and `.app-back` where they are; phase 2 owns them. Leave the four area reduced-motion blocks with their areas. Verify: `tokens.css` holds no element or universal selector.
- [x] 4.4 Import `tokens.css`, then `global.css`, then `form-ui.css`, then `shell.css` from `main.tsx`, keeping `shell.css` last as it is on `main` today. Delete the four area `@import` lines for `tokens.css` and the one in `shell.css`. Verify: the build's CSS contains one copy of `:root`. A form-ui field's computed border, padding and font match the values `form-ui.css` declares. Task 6.1 and 7.5 cover this same live-DOM check.

## 5. Pilot: shell header and register tab

- [x] 5.1 Keep the `Chrome.tsx` conversion from the proof of concept, importing tokens from form-ui. Verify: `shell.css` no longer declares `.shell-header` or `.shell-tab`.
- [x] 5.2 Add a test that the shell renders its header with role `banner` and the area name inside it. No test asserts on `shell-header` or `shell-tab` today, so this is the guard the migration leaves behind. Verify: the test passes under the stub.
- [x] 5.3 Build and inspect. Verify: `dist/assets/*.js` holds no `insertRule`, `adoptedStyleSheets` or style element. The header's rule sits in the linked stylesheet.

## 6. Docs, rules and roadmap

- [x] 6.1 Add the computed-style probe to `docs/browser-checks.md`. It covers hash-only classes, values equal to the removed declarations, wrap below 30rem, and hover and focus firing. Add the form-ui field probe from task 4.4. A field's computed border, padding and font equal the values `form-ui.css` declared before the import reorder. Verify: the entry names this change and covers both the header and a form-ui field.
- [x] 6.2 Record the decision and the six-phase path in `docs/decisions.md` and as an open stage in `ROADMAP.md`. Verify: both name the artifact and the reopen triggers.
- [x] 6.3 Run the design-detector hook against `Chrome.tsx`, or amend `DESIGN.md`'s token rule to name the token module. Verify: the hook passes or the amendment lands. (This worktree carries no detector hook. `.claude/skills/impeccable/` and `.claude/settings.local.json` are absent, per CLAUDE.md's per-machine install note. Took the amendment branch: "The Role Rule" under Colors > Named Rules now names `packages/form-ui/src/tokens.stylex.ts`.)
- [x] 6.4 Add one paragraph to `.claude/rules/design-language.md` naming the pilot and pointing at `web-styling`. Correct its existing `**The register tab** (`.shell-tab`)` line. The class leaves `shell.css` once the pilot lands, so name `Chrome.tsx`'s compiled style instead. Verify: antislop reports no rise on the file, and no line in it names `.shell-tab` as the register tab's home.
- [x] 6.5 Change `.claude/rules/ui-glossary.md`'s `header` and `register tab` rows. Replace the literal `.shell-header`/`.shell-tab` class references with `Chrome.tsx`'s compiled styles: both classes leave `shell.css` once the pilot lands. Verify: the file names no literal class for either row.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`. Verify: exit 0 for the engine and both packages.
- [x] 7.2 Run `bun run build`. Verify: exit 0 and the closeBundle assertion prints the stylesheet it checked.
- [x] 7.3 Run the full `bun test` with `DATABASE_URL` set, through `scripts/gates/silent-green.sh`. Verify: zero failures, skip count at the floor, gate exit 0.
- [x] 7.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same for `whitespace.sh`. Verify: both exit 0. (Both exit 0 only because this change carries no commit yet: the gates diff `origin/main..HEAD` and see nothing. Hand-verified instead: running `python3 antislop.py check <file>` exits 0 on every touched Markdown file. Running `git diff --check` is clean, and every changed file's line endings read `lf` with no blank line at EOF. Re-run this gate for real once the work lands in a commit.)
- [x] 7.5 Start this worktree's stack with `bash scripts/dev-up.sh`. Run the header probe from 6.1 in all four areas, at 1280px and 400px. Run the form-ui field probe from 6.1 on one migrated field. Verify: every probe passes. Keep a screenshot per area in `tmp/`.
