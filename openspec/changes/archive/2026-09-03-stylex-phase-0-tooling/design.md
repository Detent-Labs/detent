## Context

See proposal.md, Why. The facts below come from the StyleX evaluation of
2026-09-03 and its proof of concept, commit `d8a25d5` on branch `StyleX`.
The evaluation record lives outside the repository, in the owner's artifact
and in `tmp/stylex-eval/`. This document carries what the migration needs
from it.

Measured in the proof of concept:

- StyleX 0.19.0 compiles under Vite 8.2.1, rolldown and
  `@vitejs/plugin-react` 6.0.5. The config change is nine lines. The
  unplugin runs its own Babel pass, so `@rolldown/plugin-babel` stays out.
- Typecheck passes under TypeScript 7.0.2 with the shipped declarations.
- The build appends compiled rules to one CSS asset at `generateBundle`. At
  0.19.0 the picker matches a literal `index.css`. Otherwise it takes the
  first asset. This build emits five hashed assets. The proof of concept
  landed in the entry sheet by bundle order alone. `cssInjectionTarget`
  makes the choice deterministic.
- Class names and variables hash. Every rule carries `:not(#\#)` padding.
  The bundle holds no `insertRule`, no `adoptedStyleSheets` and no style
  element. The runtime chunk is 1442 bytes.
- Build wall time roughly doubles, 0.35 s to 0.76 s container-local. On the
  Windows bind mount the plugin's module load alone costs about 10 s.
- `bun test` transpiles `.tsx` itself. An uncompiled `stylex.create` throws.
  The shipped Bun adapter is bundler-only. A stub preload that maps keys to
  class names gives the same 1318 DOM passes as a compile preload.
- One suite, `vite-config.test.ts`, fails when Vite's Node bundle loads in a
  `bun test` process that a StyleX-affected suite has touched. A
  `follow-redirects` constructor calls `Error.captureStackTrace` on a
  non-Error and throws. The test imports `vite.config.ts` only for the CSP
  plugin.
- In Chromium the migrated header, tab, canvas node and path buttons carried
  compiled classes only. Their computed values equalled the deleted CSS.
  The ancestor-state focus ring appeared under keyboard focus alone.
- The audit counted 604 rules in 5008 CSS lines and 1085 `className` sites
  in 76 files. It found 450 class names and 0 without an emitter.

Constraints from `CLAUDE.md`: the engine carries no UI dependency. Every UI
change is an OpenSpec change. The four verification checks and a browser
check gate every change. `bun.lock` is frozen.

## Goals / Non-Goals

**Goals:**

- A green gate with StyleX installed and zero red tests: typecheck, build,
  the full suite with `DATABASE_URL`, prose and whitespace gates.
- The token home, the test story and the CSS placement settled once. Phases
  1 to 5 inherit them without a decision each.
- One pilot screen that proves the path end to end in a browser.
- The full migration path written down below. Each later phase becomes a
  small change against a known plan.

**Non-Goals:**

- Migrating any component beyond the shell header and register tab.
- Cascade layers, the ESLint plugin, a `packages/tokens` package.
- Re-expressing the token values. `tokens.css` stays the source.
- Any change under `src/`.

## Decisions

**D1. The unplugin, configured in `vite.config.ts`, before `react()`.**
`@stylexjs/unplugin/vite` is the documented Vite path. It carries its own
Babel pass. The community `vite-plugin-stylex` pins Vite 5 and is stale.
The postcss plugin would add a second config file for no gain.

**D2. `cssInjectionTarget` matches `index-*.css`.** The 0.19.0 picker falls
back to the first asset, which is bundle order. A chunking change could move
the rules into a lazy area sheet. Three areas would then lose their styles
with every check green. One predicate closes that. The upstream picker fix
on `main` (PR 1817) changes nothing here. Naming the target stays the
deterministic choice.

**D3. A build assertion in `vite.config.ts`, not a gate script.** A
`closeBundle` hook reads the emitted `index.html` and finds the linked
stylesheet. It greps that file for the prefix `clip-path: polygon(`. Once
this change lands, only the pilot's compiled rule produces that declaration.
The one other occurrence, `shell.css:54`, is the rule the pilot deletes.

The grep stops at the prefix on purpose. The plugin's lightningcss pass
normalizes numbers, so the emitted value drops the leading zero of the
source's rem value.

The `development-toolchain` capability already puts build failures in the
build, not under `scripts/gates/`. The assertion never hardcodes a class or
variable hash; it greps a literal CSS value instead.

**D4. A browserslist key in `packages/web/package.json`.** The plugin runs
lightningcss with browserslist defaults, independent of Vite's
`build.target`. The proof of concept saw a media query rewritten to range
syntax. That sits within today's targets, but two lists drift. One key
aligns them: `chrome >= 114, safari >= 17, firefox >= 125`.

**D5. A stub preload, not the compile preload.** The stub is a
`mock.module("@stylexjs/stylex", ...)` call. The evaluation's adversarial
review measured this shape green at 1318 DOM passes with no Babel
(experiment E1).

It supplies four exports. The `create` export returns its argument with
each style object's values replaced by the key name, so `header` renders
where `styles.header` compiles today. A module mock sees no caller file
name. Two components sharing a key therefore share a test-time class, and
no markup test here distinguishes them.

The `props` export joins the class names its arguments carry. The
`defineVars` export returns its argument's keys as their own values. A token
read like `colors.surface` then resolves to a readable string instead of a
hash. The `defaultMarker` export is an identity no-op; no case in this
change reads it.

The stub compiles nothing. It imports neither `@babel/core` nor the
unplugin, only `bun:test`.

The proof of concept's compile preload needed three Bun-specific shims. It
also transformed every matching file, including some in the engine's own
directories.

A module mock has no file filter, so that risk does not carry over.

`bun run build` runs in the same `check` command. It still validates every
style object, so the gate keeps its teeth.

**D6. The mock stays inert in engine suites.** `bunfig.toml` has one
`[test] preload` list for the whole workspace. This module therefore loads
in every `bun test` process, the same way `test/preload-db.ts` already
does. No engine module imports `@stylexjs/stylex`. The mock registers, and
nothing in `src/` or `test/` ever resolves it.

The mock's process-wide reach is a documented Bun behavior in this repo.
The file `studio-actionListEditor-registryBadge.test.tsx` records that
`mock.module` replaces a specifier for the rest of the run. It also
records that `mock.restore()` does not undo it. A preload is the one place
a change should want that reach. It must apply to every test process
alike.

A test in `packages/web/test/` asserts two things. Its `import` of
`@stylexjs/stylex` resolves to the stub's shape. The preload module's own
source imports only `bun:test`.

**D7. `contentSecurityPolicy()` moves to `packages/web/csp.ts`.**
`vite.config.ts` imports it from there. The test imports it from there too.
The test then stops loading Vite's Node bundle. Vite's `Plugin` type comes
in as a type-only import, so nothing of Vite executes under `bun test`.
This clears the one red test without touching Bun or Vite.

**D8. The token module lives in form-ui.** Both packages import it from
`packages/form-ui/src/tokens.stylex.ts`. The form-ui package already sits
below web in the dependency graph, so no direction inverts. A `packages/tokens` package would add a
third workspace member for 46 lines.

Values alias `tokens.css`. For example `colors.surface` reads `var(--color-surface)`.
Dark mode stays in the stylesheet. The `.stylex.ts` suffix satisfies the
compiler's token-file rule. `unstable_moduleResolution` uses
`type: "commonJS"` with `rootDir` at the workspace root. That value
resolved `packages/form-ui/src/PathButtons.tsx`'s own `stylex.create` call
in the proof of concept.

The proof of concept never imported a `.stylex.ts` file across the package
boundary. Its token file lived in `packages/web` and stayed there.
`rootDir` alone resolved a form-ui-exported token module from a
`packages/web` import. Task 4.2 needed no `aliases` entry.

Crossing that boundary cost one dev-only fix. `form-ui` resolves through
`node_modules`, the workspace linker's own path. Vite's dependency scanner
therefore treated it as pre-bundlable. It handed `tokens.stylex.ts` to
esbuild before the StyleX plugin ever ran. That threw `Unexpected
'stylex.defineVars' call at runtime`, on the login screen alone, under
`bun run dev`. `vite.config.ts` now excludes `form-ui` from
`optimizeDeps`. Every import from that package stays on Vite's own
transform pipeline instead. The production build never hit this: `vite
build` runs no dependency pre-bundling pass.

**D9. `global.css` splits out of `tokens.css`.** The compiler has no global
selector. Every element and universal selector moves into
`packages/web/src/shell/global.css`. That covers `*`, `body`, the
`button, input, select, textarea` group, `:focus-visible`, `button`,
`button:disabled`, `select`, `select:focus-visible`, `h1` and
`h2`.

Two groups stay behind. The `.btn` family and `.app-back` are class rules
with 209 call sites, and phase 2 owns them. The four
`prefers-reduced-motion` blocks live in the area stylesheets, not in
`tokens.css`, so they move with their areas in phases 2 and 3.

`main.tsx` imports `tokens.css`, then `global.css`, then `form-ui.css`,
then `shell.css`, keeping `shell.css` last as it is on `main` today.
Four area stylesheets and `shell.css` each drop one `@import` line for
`tokens.css`. The entry import makes the dependency explicit.

The order matters. Today `main.tsx` loads `form-ui.css` first. Then
`shell.css` pulls the tokens in behind it. The form-ui package reads 13
tokens it does not declare, so an equal-specificity tie changes hands. Task
4.4 verifies a form-ui field's computed border, padding and font against
`main`.

**D10. The pilot is the shell header and tab.** Two rules and one media
query. Tokens for color, font and spacing, plus one clip-path. Every area
shows it, so one probe covers the whole app. The proof of concept already
converted it, and the browser check passed.

**D11. Other conversions revert.** The canvas node, outbox badge, duration
bar and path buttons return to CSS. Each belongs to a
later phase with its own spec delta. Those are `studio-canvas`,
`admin-app`, `reporting-app` and `form-ui`.

Keeping them would touch four more specs here. It would also leave four
hybrid components for months. The
reverts are `git checkout main -- <file>` for eight files.

**D12. No `useCSSLayers`.** With `useCSSLayers: true` every compiled rule
sits below unlayered CSS. The global `:focus-visible` ring would then
outrank a component's own indicator. The `web-styling` spec forbids layers
while the global sheet has unlayered rules. Revisit only after the global
sheet moves into a named layer.

**D13. The probe is a documented playwright-cli snippet.** It reads computed
styles through `playwright-cli -s=<session> eval`. It lands in
`docs/browser-checks.md`, the file that holds what stays manual. A script
under `scripts/` would be a fourth place to keep current. If a later phase
copies the snippet a third time, extract it then.

**D14. The dev-only StyleX runtime import stays.** The plugin appends
compiled CSS to the built stylesheet. In dev it serves that CSS at a virtual
URL and injects nothing into `index.html`. A converted component therefore
renders bare until `main.tsx` imports `virtual:stylex:runtime` behind
`import.meta.env.DEV`. That branch and the module both drop out of a
production build. `packages/web/src/stylex-virtual.d.ts` declares the
module, so it stays too.

## Risks / Trade-offs

- [A StyleX release breaks the build; `main` already queues a class-name
  change] → exact pins and a changelog read before every bump. Two
  consecutive releases that each cost a fix reopen the decision.
- [The stub hides a bad style object from `bun test`] → `bun run build`
  runs in the same `check`; a missing `default` key fails there.
- [Bind-mount build time doubles to about 16 s] → container-local builds
  take 0.76 s, and the gate runs in the container. Accept.
- [Compiled rules skip Vite's CSS minifier and ship pretty-printed] → gzip
  hides most of it; measured +1.1 KB gzip for nine components. Accept.
- [Compiled CSS lands in the entry sheet, shrinking the per-area lazy split]
  → total CSS is 16 KB gzip. Accept, and note it in `web-styling` at
  phase 2.
- [The design-detector hook may not parse `stylex.create`] → task 6.3
  verifies it against `Chrome.tsx` or amends `DESIGN.md`'s rule to name the
  token module.
- [No test covers the header, so a regression there is silent] → task 5.2
  adds one asserting role `banner` and the area name. Neither class name
  appears in any test on `main`.
- [`tokens.css` mixes tokens with control classes for one phase] → the
  `unified-shell` delta forbids only element and universal selectors there.
  Phase 2 moves the `.btn` family.

## Migration Plan

This change is phase 0. The table below is the full path. Each row is its
own OpenSpec change, reviewed before apply. The four verification checks and
the browser probe on every touched screen close each one.

Phases run back to back. A hybrid exists only between them. Counts come
from the audit.

| Phase | Scope | Exit |
|---|---|---|
| 0 (this change) | Tooling, tokens and the test story. The `global.css` split and the CSP module. The pilot header and tab. Docs and roadmap. | Gate green with zero red tests. The probe passes on the header in every area. |
| 1 form-ui | 23 rules and 5 test files. The `form-ui.css` export goes. `PathButtons` takes a style prop. Delta against `form-ui`. | Player and Task screens probe identical. |
| 2 shell, app, admin, reporting | 194 rules across four areas, about 250 `className` sites, 3 test files. Attribute states become conditions. Data-derived class maps become typed lookups. One delta per area spec. | Probes pass per area. The outbox badge and duration bar render with seeded data. |
| 3 studio, non-canvas | About 305 rules, about 750 sites, 6 test files. Pseudo-elements `::backdrop` and `:popover-open` see first use. Deltas against `studio-app`, `studio-form-editor` and the panel specs. | Probes pass on form editor, panels, dock and dialogs. Keyboard walks unchanged. |
| 4 canvas | 61 rules in `CanvasView.tsx` and `EditRail.tsx`. Edge recolor via `when.ancestor`. Runtime grid variables stay inline. The two CSS-text tests go. Delta against `studio-canvas`. | Keyboard walk of nodes and edges in Chromium and Firefox. A drag probe verifies Panzoom exclusion. |
| 5 cleanup | Delete `areas/*/app.css`, `shell.css`, `form-ui.css`. Rewrite the `design-language.md`, `DESIGN.md`, `browser-checks.md` and `current-state.md` passages. Optional ESLint plugin. | `git grep '\.css' packages/` finds only `tokens.css` and `global.css`. |

Rollback for phase 0: revert the change's commits. The change edits each
area stylesheet by one line, the `@import` for `tokens.css`. It touches
`tokens.css` for the `global.css` split, and `shell.css` for that same
`@import` plus the two pilot rules. A revert restores all of them, and
`main.tsx` regains its import order. The change touches no data and no
engine code.

Order inside phase 0: dependencies and config first, then the test story.
Then the token split, then the pilot's own checks, then docs. The pilot
arrives already converted in `d8a25d5`. Task 3.4 therefore runs the full
suite with that conversion in place and every other one reverted. A failure
there points at the tooling, not at a half-finished screen.

## Open Questions

- Whether the design-detector hook reads `stylex.create` objects. Task 6.3
  answers it, and either outcome fits the specs.
- Whether phase 2 should split into two changes. Decide when phase 1 closes,
  from its measured effort.
- Whether `unstable_moduleResolution.rootDir` alone resolves a form-ui token
  module from a `packages/web` import, or the `aliases` option is also
  needed. Answered by task 4.2: `rootDir` alone resolved it, no `aliases`
  entry required.
