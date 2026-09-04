## Context

See proposal.md, Why. Full detail comes from three places read in full this
session: `stylex-phase-0-tooling`'s `design.md` (the six-phase Migration
Plan and its Risks), all four archived phase changes
(`stylex-phase-{1,2,3,4}-*`) for the conventions they set, and the current
state of every file this change touches — not memory, since a prior
phase's own file layout is exactly what this change corrects where it
drifted.

Five hand-written stylesheets remain: `shell.css` and the four areas'
`app.css` files. Each holds only what phases 0-4 could not compile:

- `shell.css`: `.shell` and `.shell > *`, two rules reaching every screen
  through a universal descendant selector.
- `areas/{admin,app,studio}/app.css`: one `prefers-reduced-motion` block
  each, identical: `transition: none !important; animation: none
  !important;`.
- `areas/reporting/app.css`: the same block, but with a different,
  pre-existing technique: `animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;`. `git log --diff-filter=A`
  traces this file to `87e2a0e`, about a month before this migration
  started (`d8a25d5`, the StyleX proof of concept). No code in the repo
  listens for a `transitionend` or `animationend` event, so nothing
  depends on the distinction today.
- `areas/studio/app.css`: the block above, plus `.studio-dialog::backdrop`.
  `docs/decisions.md` already records why: `::backdrop` fails a real
  `@stylexjs/unplugin` build, an observed failure, not a guess (phase
  0's D12).

`global.css`, the one hand-written sheet `web-styling` already permits,
currently holds the reset, the `:focus-visible` ring and the element
defaults, at 79 lines. `main.tsx` imports `tokens.css`, then `global.css`,
then `shell.css`. Each area's `root.tsx` imports its own `app.css`.

`.btn`/`.app-back` (tokens.css:107-179) are a separate matter, already
settled by phase 2's D1 and untouched by this change. They live in
`tokens.css`, not in any file this change deletes.

## Goals / Non-Goals

**Goals:**

- Delete the five files. `global.css` absorbs every rule they still hold
  that StyleX cannot compile, deduplicated where they were only
  accidentally different.
- `packages/web/test/boundaries.test.ts` drops a test that both files
  its own inputs out of existence and stops meaning anything the moment
  it does.
- Every literal-class citation this migration left stale in
  `.claude/rules/`, `DESIGN.md` and `docs/` gets corrected or removed.
- Close the two decisions the migration left open: `.btn`/`.app-back`'s
  permanence, and this change's own choice not to rewrite historical code
  comments.

**Non-Goals:**

- Migrating `.btn`/`.app-back`. See Decisions, D1.
- Touching any of the 58 code comments, across 47 files in
  `packages/web/src`, that cite a deleted stylesheet's file name in
  prose. See Decisions, D2.
- Removing the three dead, CSS-less literal `className` leftovers this
  change's own research found (`studio-player-form`,
  `studio-player-record`, `studio-header-bar-menu-trigger`). See
  Decisions, D3.
- An ESLint plugin. See Decisions, D4.
- Any change to `src/`, the engine, or the definition contract.

## Decisions

**D1. `.btn`/`.app-back` stay in `tokens.css`, permanently.** Phase 2's D1
deferred them "to whichever phase converts the last file still writing
that literal string." No phase ever did, and this is the last one. The
migration's own exit bar already treats this as settled fact rather than
an open question: it grandfathers `tokens.css` as an allowed CSS
survivor, not just `global.css`. That only makes sense if this 208-site
shared family (55 files, per phase 2's own audit) stays hand-written
there. Converting it now would mean giving every one of those 208 call
sites its own compiled, call-site-scoped class for a style family that
is deliberately shared and generic — the opposite of what StyleX's model
is for. `web-styling`'s "A shared class stays literal until its last
consumer migrates" requirement gains a closing sentence recording this
as the terminal case its own wording left open ("until the phase that
converts its last remaining consumer" — none is coming).

Rejected alternative: convert `.btn`/`.app-back` in this phase, since it
is the last one. Rejected on cost alone — 208 call sites across 55
files, none of which this phase's own scope (five stylesheet deletions
and a doc sweep) otherwise touches. That is a phase of its own, not a
line item in a cleanup phase.

**D2. This change does not rewrite the historical code comments that
cite a deleted stylesheet by name.** `git grep '\.css' packages/`, run
before this change, returns 78 matches across 55 files. Traced line by
line:

1. Nine matches are legitimate, permanent references to
   `tokens.css`/`global.css` (`tokens.stylex.ts`'s own doc comment,
   `global.css`'s own header, `main.tsx`'s two surviving imports,
   `vite.config.ts`'s own mention of `global.css`). Unaffected.
2. Nine matches vanish mechanically as a direct result of this change's
   own Groups 1-3: two because their file is deleted whole
   (`shell.css:5`, `studio/app.css:3`, each mentioning `tokens.css` in
   its own header), five because they are the import statement Group 2
   removes, and two because they sit inside the exact
   `boundaries.test.ts` block Group 3 deletes.
3. Three matches are `vite.config.ts`'s own `.css`-extension-matching
   regexes: the `cssInjectionTarget` picker and the D3 build assertion
   reading `index.html` for the linked stylesheet. These match the
   pattern structurally — they process any `.css` asset name — but name
   no specific deleted file. This is the tooling the migration itself
   built, not leftover debt, and a maximally literal reading of the exit
   line would force rewriting it for no reason. (One of the three also
   names `global.css`, so it double-counts into category 1 above:
   9 + 9 + 3 + 58 = 79 category members, less that one double-count,
   equals the 78 distinct matches `git grep` actually reports.)
4. The remaining 58 matches, across 47 files, cite `app.css` (or once
   `form-ui.css`, or a few `shell.css`) by name in a comment explaining
   what a compiled style used to look like: `` `app.css`'s
   screen/controls/table/badge rules, as StyleX.` `` These are accurate
   historical documentation, written during phases 1-4's own conversion
   work. This change's own dispatched scope for the literal-class sweep
   names `.claude/rules/`, `DESIGN.md` and `docs/` explicitly — not
   `packages/web/src`.

Category 4 is the one a maximally literal reading of "`git grep '.css'`
finds only `tokens.css` and `global.css`" would still reject. Rewriting
it is 47 files of wording-only churn, zero behavior change, for a
citation that is true and useful exactly as written: a component's
styles did live in `app.css`, once. This change verifies the exit bar as
it actually matters — no `.css` file survives beyond `tokens.css` and
`global.css`, no import references a deleted file, and every other match
falls into category 1 or 3 above — documented here rather than silently
narrowed.

**D3. The three dead, CSS-less literal classNames this change's research
found stay as they are.** `studio-player-form`/`studio-player-record`
(`PlayerScreen.tsx`) and `studio-header-bar-menu-trigger`
(`ProcessHeaderBar.tsx`) render today with zero effect: `git show
<phase-3-commit>^:.../app.css` confirms neither ever had a CSS rule,
even before phase 3 touched either file. They are harmless, not new
breakage, and design.md's own phase 5 row names two jobs — delete five
files, correct stale docs — neither of which this is. Leaving three
inert `className` strings out of a change whose own stated scope does
not include a source-wide dead-code sweep is the smaller risk. A
broader, pre-existing convention of bare "screen root marker" classes
(`app-tasks`, `shell-login`, and others) predates this migration by
about a month (`87e2a0e`, versus `d8a25d5`'s StyleX proof of concept),
confirmed via `git log --diff-filter=A` and `git show`, and is untouched
by the same reasoning, at greater scale.

**D4. No ESLint plugin.** Design.md's own phase 5 row marks this
"optional." This repo has never had an ESLint config, dependency, or
CI step; `tsc --noEmit`, `bun test`, and the antislop/whitespace gates
are its enforcement stack. Adding an entirely new tool for the sake of
one closing phase, with no other phase or team decision asking for it,
is a scope expansion this phase's own goals do not need. Revisit if a
real StyleX authoring mistake (an invalid token, an unmigrated call
site) ships past `bun run typecheck` and `bun run build` in a way only
a lint rule would catch — none has, across five phases.

**D5. Consolidate four `prefers-reduced-motion` blocks into one,
adopting reporting's technique.** Three areas use `transition: none
!important; animation: none !important;`; reporting uses
`animation-duration`/`transition-duration: 0.01ms !important;`. No code
in this repo depends on the difference (checked: no
`transitionend`/`animationend` listener exists anywhere in
`packages/web`). Between the two, the near-zero-duration form is the
safer default in general: it still runs a transition to completion (at
imperceptible speed) rather than skipping it outright, so a value that a
`transitionend` handler applies still gets applied, should one ever get
added later. Both read as instantly-settled to a human either way. One
block, in `global.css`, replaces all four.

Rejected alternative: keep both techniques, scoped per area, inside
`global.css`. Rejected because scoping a global reset per area
reintroduces exactly the per-area split this phase exists to close, and
no current behavior depends on the split.

**D6. `.studio-dialog::backdrop` moves into `global.css` unchanged,
studio prefix and all.** It is the only remaining destination `web-styling`
permits, and it is harmless there: `global.css` already carries rules with
no area-neutral pretension (the reduced-motion block above is one), and
`.studio-dialog` composes on no element outside studio. Renaming it to
drop the prefix would break nothing today, but it would also cost every
`<dialog>` call site a rename for no behavior change; the existing
identifier stays.

**D7. `global.css`'s new size supersedes the old "under about 60
lines" line.** Absorbing `.shell`/`.shell > *`, the deduped
reduced-motion block and `.studio-dialog::backdrop` brings the file to
118 lines, drafted and counted before writing this document. The
`web-styling` delta replaces the 60-line figure with 118, and drops the
sentence that put reduced-motion blocks in the areas — false the moment
no area stylesheet exists to hold one.

## Risks / Trade-offs

- [Consolidating reporting's `prefers-reduced-motion` technique onto the
  other three areas is a real, if tiny, behavior change: a reduced-motion
  user's transitions now finish in ~0.01ms instead of not running at
  all] → both read as instant to a human; the production build's browser
  probe checks this phase's own claim by triggering a transition under
  `prefers-reduced-motion: reduce` in one screen per area and confirming
  no visible motion.
- [A maximally literal reading of the exit line stays unsatisfied by
  design: 58 historical comments still name a deleted file] → documented
  as D2, with the exact category breakdown and the concrete check this
  change runs instead.
- [Deleting `boundaries.test.ts`'s class-collision test removes a check
  that, on paper, still runs] → it has proven nothing since the last
  area stylesheet lost its last shared-with-another-area class name; a
  compiled StyleX class cannot collide across areas the way a
  hand-written one could, so the risk moved from "guarded" to
  "structurally impossible," not to "unguarded."
- [`global.css` grows past what a "global stylesheet" reader expects] →
  D7 updates `web-styling`'s own ceiling to the actual, counted number
  rather than leaving stale prose next to a bigger file.

## Migration Plan

This closes the six-phase plan `stylex-phase-0-tooling`'s design.md laid
out. No phase follows this one. Rollback is `git revert` of this
change's commits: it deletes no data, and the five files this change
removes are fully recoverable from git history if any regression
surfaces after archive.

Order inside this phase: `global.css` first (the new home has to exist
before anything can move into it), then the five deletions and their
five import removals (each area's `root.tsx`, plus `main.tsx`), then
`boundaries.test.ts`, then the doc sweep, then verification.

## Open Questions

(none — every decision this phase needed is closed above)
