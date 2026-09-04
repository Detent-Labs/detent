# Proposal: StyleX phase 0, tooling, tokens and the test story

## Why

Agents write and maintain this frontend. Today a wrong token name or a
mistyped property in a stylesheet reaches `main` past typecheck, build and
the full suite. Nothing in the repository validates a style. StyleX turns
those slips into compiler errors and keeps every style local to its
component.

The evaluation of 2026-09-03 closed GO WITH CONDITIONS on that premise. A
build, a suite run and a browser check of the proof of concept on branch
`StyleX` back it. This change is phase 0 of a six-phase migration path,
recorded in full in `design.md`'s Migration Plan. It installs the compiler,
settles the token home, gives `bun test` a story, and migrates one pilot
screen. Phases 1 to 5 follow as their own changes.

## What Changes

- `packages/web` gains `@stylexjs/stylex` and `@stylexjs/unplugin`, pinned
  exactly. The Vite build runs the StyleX compiler before `react()`.
- The plugin names its CSS target. StyleX rules land in the entry stylesheet
  by configuration, never by bundle order.
- A browserslist key aligns the plugin's own CSS pass with Vite's
  `build.target`.
- The build asserts that the stylesheet `index.html` links carries the
  compiled StyleX rules. A silent drop fails the build.
- `bun test` gains a stub preload: a `mock.module` replacement for
  `@stylexjs/stylex` that returns style keys as class names and compiles
  nothing. It loads in every `bun test` process, the way the database
  preload already does. It stays inert in engine suites, because no engine
  module imports that package.
- `contentSecurityPolicy()` moves out of `vite.config.ts` into its own
  module. The test that covers it stops importing Vite's Node bundle.
- `tokens.css` splits. The custom properties stay, and so do the shared
  control classes until phase 2. Every element and universal selector moves
  to a new `global.css`. The four area reduced-motion blocks stay with their
  areas.
- `packages/form-ui` exports `tokens.stylex.ts`. Its `defineVars` groups
  alias the existing custom properties, so `tokens.css` stays authoritative
  and dark mode carries over unchanged.
- The shell header and its register tab become the pilot. Their styles move
  from `shell.css` into `Chrome.tsx`.
- The proof of concept's other conversions revert to their stylesheets. The
  canvas node, the outbox badge, the reporting duration bar and the form-ui
  path buttons return to the CSS on `main`. That includes `form-ui.css`.
  Their phases own them.
- This change deletes the proof of concept's compile preload. Its filter matched the
  engine's `src/` and `test/`, which the engine boundary forbids.
- `docs/browser-checks.md` gains the computed-style probe for a migrated
  screen. `docs/decisions.md` and `ROADMAP.md` record the decision and the
  five remaining phases.

No definition contract rule changes. No engine file changes.

## Capabilities

### New Capabilities

- `web-styling`: the styling model for `packages/web` and
  `packages/form-ui`. It names StyleX for component styles and one global
  stylesheet for the rest. It fixes the literal class hooks that never hash,
  the token home and the test stub. It forbids `useCSSLayers` while a global
  rule stays unlayered. Later phases write their deltas against it.

### Modified Capabilities

- `development-toolchain`: the frontend build gains a compile step with a
  named CSS target and a build-time assertion. The test runner gains a
  preload whose scope excludes the engine.
- `unified-shell`: the header and register tab render from compiled styles.
  The shell's global rules live in their own stylesheet beside `tokens.css`.
- `form-ui`: the package exports the design token module. It stays
  source-only, and its consumer compiles it.

## Impact

- Dependencies: `@stylexjs/stylex@0.19.0` and `@stylexjs/unplugin@0.19.0`.
  They pull in `@babel/core`, `@stylexjs/babel-plugin` and `lightningcss`.
  `bun.lock` changes. The `frozen-lockfile` gate covers the pins.
- Build: `packages/web/vite.config.ts`, a new `packages/web/csp.ts`,
  `packages/web/package.json` (browserslist). Build wall time roughly
  doubles, measured 0.35 s to 0.76 s container-local.
- Tests: `bunfig.toml` and a new `test/preload-stylex.ts` (stub). A new test
  covers the stub's shape and its imports. `packages/web/test/vite-config.test.ts`
  gains a moved import. A new shell test asserts the header's `banner` role.
  No test asserts on `shell-header` or `shell-tab` today.
- Styles: `packages/web/src/shell/tokens.css`, a new `global.css`,
  `shell.css`, `Chrome.tsx`, `main.tsx`, `packages/web/src/stylex-virtual.d.ts`
  (kept for the dev runtime); a new `packages/form-ui/src/tokens.stylex.ts`;
  `packages/form-ui/package.json` exports and peer dependency. The four area
  stylesheets each lose one `@import` line.
- Docs and rules: `docs/browser-checks.md`, `docs/decisions.md`,
  `ROADMAP.md`, and `DESIGN.md` if task 6.3 amends its token rule.
  Two rule files change too. `.claude/rules/design-language.md` gains one
  paragraph naming the pilot and pointing at `web-styling`. It also
  corrects its stale `.shell-tab` line.
  `.claude/rules/ui-glossary.md`'s header and register-tab rows name
  `.shell-header`/`.shell-tab` today. Both move to naming `Chrome.tsx`
  instead.
- Branch: work starts from `d8a25d5` on branch `StyleX`, the proof of
  concept commit. That commit is not merged as is.
- Out of scope: every other component, the ESLint plugin, `useCSSLayers`,
  a `packages/tokens` package, and any engine file.
