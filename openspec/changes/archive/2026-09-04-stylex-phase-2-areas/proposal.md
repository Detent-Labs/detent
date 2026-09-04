## Why

Phase 1 (`stylex-phase-1-form-ui`, archived) closed the gap for the field
renderer. Four more surfaces still carry hand-written CSS with no compiler
behind it. That set is the shell's own account menu, plus the three
participant-facing areas' own stylesheets. A wrong token name or a
mistyped property in any of them still reaches `main` past every gate.

Phase 2 closes that gap. It covers `shell.css`'s remaining rules, plus
`areas/app/app.css`, `areas/admin/app.css` and `areas/reporting/app.css` in
full. It also answers two questions phase 0's plan left open. Does a native
`:popover-open` state compile correctly under StyleX 0.19? Does an
ancestor-hover child style? This phase is the first to need either.

## What Changes

- `shell.css`'s account group and account menu (`.shell-account-group`
  through `.shell-menu-version`, 37 rule blocks) move into typed
  `stylex.create` style objects in `Chrome.tsx`. Both read
  `form-ui/tokens.stylex`. `.shell-menu:popover-open` becomes a StyleX
  conditional value keyed on the native `:popover-open` pseudo-class.
- `areas/app/app.css` (38 rule blocks), `areas/admin/app.css` (65 rule
  blocks) and `areas/reporting/app.css` (61 rule blocks) move into typed
  style objects. Each area's own components read the same token module.
  Each area keeps its own duplicate stamp/badge tone styles, per
  `design-language.md`'s existing "duplicate on purpose" rule.
- A status or kind string picks its style from a typed lookup instead. Three
  examples: an outbox delivery status, an instance status, a report cell's
  data kind. Each lookup keys on that area's own known status literals. It
  falls back to a neutral style for a status the lookup does not name. This
  generalizes phase 1's fixed two-value ternary. There the value had two
  outcomes; here it has an open-ended value with a small, closed set of
  outcomes instead.
- One ancestor-hover rule, `.app-task-link:hover .app-task-step`, attempts
  StyleX's `when.ancestor` API. A build-and-browser check runs the moment
  this change writes it. A documented literal-CSS fallback exists if that
  check fails.
- The reporting area's duration bar keeps its numeric `width` as a literal
  inline style; only its class-driven tone selection compiles.
- `test/preload-stylex.ts` gains a `when` export, since no style object in
  the package used it before this phase.
- `.btn`, `.btn-primary`, `.btn-destructive`, `.btn-secondary`, `.btn-ghost`
  and `.app-back` stay in `tokens.css`, unmigrated. Phase 0's plan and
  phase 1's proposal both named these "phase 2's own scope." This phase's
  own audit found 208 call sites across 55 files instead.

  Roughly half sit in studio, which this phase does not touch. The rest
  sit inside this phase's own four areas. Migrating any of them now would
  delete the CSS rule an unconverted file's still-literal
  `className="btn btn-primary"` depends on. Every such button would
  break, until its own file's phase converts it. These classes move
  together with whichever phase converts the last `.btn` caller instead.
- `docs/browser-checks.md` gains a probe per area, naming what each probe
  confirms. `docs/decisions.md` and `ROADMAP.md` stage 45 record phase 2
  as done.

  `docs/decisions.md` also resolves its own still-open question: does
  phase 2 split into two changes? It does not.

No definition contract rule changes. No engine file changes. This change
does not touch studio's own stylesheet, `areas/studio/app.css`; that is
phase 3 and 4's scope.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unified-shell`: the account group and account menu compile from StyleX.
  `:popover-open` becomes a build-verified conditional value.
- `end-user-app`: `areas/app/app.css` compiles from StyleX. The task-status
  stamp picks its tone from a typed lookup.
- `admin-app`: `areas/admin/app.css` compiles from StyleX. The outbox
  status badge, the instance status badge and every other admin badge pick
  their tone from a typed lookup.
- `reporting-app`: `areas/reporting/app.css` compiles from StyleX. The
  duration bar's tone picks from the same typed-lookup pattern; its numeric
  width stays a literal inline style.
- `web-styling`: records the open-ended typed-lookup pattern. Phase 1
  only needed a fixed two-value one.

  This entry also records the shared-class deferral pattern this phase
  applies to `.btn`. One more pattern joins it: verify a first-use
  compiler feature against a real build. That is the discipline behind
  the `:popover-open` and `when.ancestor` decisions.

## Impact

- Code: `packages/web/src/shell/Chrome.tsx`, plus `shell.css` losing its
  migrated rules. Every component under `packages/web/src/areas/app/`,
  `packages/web/src/areas/admin/` and `packages/web/src/areas/reporting/`
  that carries a `className` referencing that area's stylesheet, plus each
  area's `app.css` losing its migrated rules. `test/preload-stylex.ts`.
- Tests: this phase's own audit found no area-local test asserting a
  literal class name. The one test file asserting `.btn`-family classes,
  `packages/web/test/studio-processHeaderBar-publishGate.test.tsx`, needs no
  change, since `.btn` stays out of scope.
- Specs: `openspec/specs/unified-shell/spec.md`,
  `openspec/specs/end-user-app/spec.md`, `openspec/specs/admin-app/spec.md`,
  `openspec/specs/reporting-app/spec.md`, `openspec/specs/web-styling/spec.md`.
- Docs: `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md`.
- Dependencies: none new. `@stylexjs/stylex` is already installed.
- Out of scope: `.btn`/`.app-back`, `areas/studio/app.css`, any engine file,
  any change under `src/`.
