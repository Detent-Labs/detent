## Why

Phases 0-4 moved every compilable rule in `packages/web` and
`packages/form-ui` onto StyleX. Five hand-written stylesheets remain:
`shell.css` and the four areas' `app.css` files. Each now holds only the
handful of rules StyleX cannot compile — a universal selector, a
`prefers-reduced-motion` block, or `::backdrop`. This is phase 5 of that
migration, the last one, per `stylex-phase-0-tooling`'s Migration Plan.

## What Changes

- Consolidate every rule the five files still hold into `global.css`, the
  one hand-written sheet `web-styling` already permits: `.shell`/`.shell
  > *` from `shell.css`, one canonical `prefers-reduced-motion` block
  (deduping four near-identical copies down to one), and
  `.studio-dialog::backdrop`.
- Delete `shell.css` and all four areas' `app.css` files, and their five
  import statements.
- Delete `boundaries.test.ts`'s `"no class name is defined in two areas'
  stylesheets"` test. It walks each area's own `.css` files for a
  collision; once none exist, it passes on two empty sets forever,
  proving nothing. A compiled StyleX class cannot collide across areas
  the way a hand-written one could, so the risk it guarded is gone too.
- Correct every literal-class citation the sweep found stale in
  `.claude/rules/design-language.md`, `.claude/rules/ui-glossary.md`, and
  six passages in `docs/current-state.md`. Each cites a class name no
  compiled or hand-written stylesheet declares any more.
- Add this phase's own dated section to `docs/browser-checks.md` and its
  own paragraph to `docs/decisions.md`, following the pattern every prior
  phase used. Mark `ROADMAP.md` stage 45 done.
- Close two decisions the migration left open: `.btn`/`.app-back` stay
  permanently literal in `tokens.css` (no further phase exists to convert
  their last consumer), and this change does not rewrite the roughly 45
  historical code comments across `packages/web/src` that cite a deleted
  stylesheet's file name by name — see design.md.
- No ESLint plugin. See design.md's rejected-alternative note.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-styling`: the global stylesheet's requirement changes to describe
  its final, consolidated scope — every permanent literal survivor this
  migration could not compile away — instead of a per-area split that no
  longer exists. The shared-class requirement gains a closing note that
  `.btn`/`.app-back` are the two classes that reach this migration's end
  still shared, and now stay literal permanently.

## Impact

- Deleted: `packages/web/src/shell/shell.css`,
  `packages/web/src/areas/{admin,app,reporting,studio}/app.css`.
- Changed: `packages/web/src/shell/global.css`, `packages/web/src/main.tsx`,
  each area's `root.tsx`, `packages/web/test/boundaries.test.ts`.
- Docs: `.claude/rules/design-language.md`, `.claude/rules/ui-glossary.md`,
  `docs/current-state.md`, `docs/browser-checks.md`, `docs/decisions.md`,
  `ROADMAP.md`.
- No engine, HTTP, or definition-contract file changes.
