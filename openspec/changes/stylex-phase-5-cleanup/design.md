## Context

See proposal.md, Why. Full detail comes from three sources, each read in
full this session.

The first is `stylex-phase-0-tooling`'s `design.md`. It carries the
six-phase Migration Plan and its Risks.

The second is all four archived phase changes
(`stylex-phase-{1,2,3,4}-*`). They set the conventions this change
follows.

The third is the current state of every file this change touches. This
change reads that state directly, not from memory. A prior phase's own
file layout is exactly what this change corrects, where it drifted.

Five hand-written stylesheets remain: `shell.css` and the four areas'
`app.css` files. Each holds only what phases 0-4 could not compile:

- `shell.css`: `.shell` and `.shell > *`, two rules reaching every screen
  through a universal descendant selector.
- `areas/{admin,app,studio}/app.css`: one `prefers-reduced-motion` block
  each, identical: `transition: none !important; animation: none
  !important;`.
- `areas/reporting/app.css`: the same block. It uses a different,
  pre-existing technique instead: `animation-duration: 0.01ms
  !important; transition-duration: 0.01ms !important;`. `git log
  --diff-filter=A` traces this file to `87e2a0e`. That commit lands
  about a month before this migration started, at `d8a25d5`, the
  StyleX proof of concept. No code in the repo listens for a
  `transitionend` or `animationend` event, so nothing depends on the
  distinction today.
- `areas/studio/app.css`: the block above, plus `.studio-dialog::backdrop`.
  `docs/decisions.md` already records why: `::backdrop` fails a real
  `@stylexjs/unplugin` build. That is an observed failure, not a guess
  (phase 0's D12).

`global.css` is the one hand-written sheet `web-styling` already
permits. It currently holds the reset, the `:focus-visible` ring and
the element defaults, at 79 lines. `main.tsx` imports `tokens.css`,
then `global.css`, then `shell.css`. Each area's `root.tsx` imports its
own `app.css`.

`.btn`/`.app-back` (tokens.css:107-179) are a separate matter, already
settled by phase 2's D1 and untouched by this change. They live in
`tokens.css`, not in any file this change deletes.

## Goals / Non-Goals

**Goals:**

- Delete the five files. `global.css` absorbs every rule they still
  hold that StyleX cannot compile. It deduplicates the ones that were
  only accidentally different.
- `packages/web/test/boundaries.test.ts` drops a test that both files
  its own inputs out of existence and stops meaning anything the moment
  it does.
- Every literal-class citation this migration left stale in
  `.claude/rules/`, `DESIGN.md` and `docs/` gets corrected or removed.
- Close the two decisions the migration left open. They are
  `.btn`/`.app-back`'s permanence, and this change's own choice not to
  rewrite historical code comments.

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

**D1. `.btn`/`.app-back` stay in `tokens.css`, permanently.**

Phase 2's D1 deferred them: "to whichever phase converts the last file
still writing that literal string." No phase ever did. This is the
last one. The migration's own exit bar already treats this as settled
fact, not an open question. It grandfathers `tokens.css` as an allowed
CSS survivor, not just `global.css`. That only makes sense if this
208-site shared family, 55 files per phase 2's own audit, stays
hand-written there.

Converting it now would give every one of those 208 call sites its own
compiled, call-site-scoped class. This family stays shared and generic
on purpose instead. That is the opposite of what StyleX's
per-call-site model is for. `web-styling`'s "A shared class stays
literal until its last consumer migrates" requirement gains a closing
sentence.

That sentence records this as the terminal case. The requirement's own
wording left that case open: "until the phase that converts its last
remaining consumer." No such phase is coming.

Rejected alternative: convert `.btn`/`.app-back` in this phase, since
it is the last one. Rejected on cost alone. 208 call sites span 55
files. None of them sit in this phase's own scope: five stylesheet
deletions and a doc sweep. That conversion is a phase of its own, not
a line item in a cleanup phase.

**D2. This change does not rewrite comments naming a deleted file.**

Those comments cite deleted stylesheets by name, in historical code.
`git grep '\.css' packages/`, run before this change, returns 78
matches across 55 files. Traced line by line:

1. Nine matches are legitimate, permanent references to `tokens.css`/
   `global.css`. Four hold them: `tokens.stylex.ts`'s own doc comment
   and `global.css`'s own header. The other two are `main.tsx`'s two
   surviving imports and `vite.config.ts`'s own mention of
   `global.css`. Unaffected.

2. Nine matches vanish mechanically, as a direct result of this
   change's own Groups 1-3. Two vanish because Group 2 deletes their
   file whole: `shell.css:5` and `studio/app.css:3`, each mentioning
   `tokens.css` in its own header. Five vanish because Group 2 removes
   the import statement that carries them. Two vanish because Group 3
   deletes the exact `boundaries.test.ts` block that holds them.

3. Three matches are `vite.config.ts`'s own `.css`-extension-matching
   regexes: the `cssInjectionTarget` picker and the D3 build assertion
   that reads `index.html` for the linked stylesheet. These match the
   pattern structurally, since they process any `.css` asset name.
   They name no specific deleted file. This is tooling the migration
   itself built, not leftover debt. A maximally literal reading of the
   exit line would still force rewriting it, for no reason.

4. The remaining 58 matches, across 47 files, cite `app.css` (or once
   `form-ui.css`, or a few `shell.css`) by name. Each comment explains
   what a compiled style used to look like: `` `app.css`'s
   screen/controls/table/badge rules, as StyleX.` ``

   Each one is accurate, historical documentation. Phases 1-4 wrote
   them, during their own conversion work. This change's own
   dispatched scope for the literal-class sweep names
   `.claude/rules/`, `DESIGN.md` and `docs/` explicitly. It does not
   name `packages/web/src`.

One of category 3's three matches also names `global.css`, so it
double-counts into category 1 above. Sum the four categories, 9 + 9 +
3 + 58, for 79 category members. Subtract that one double-count, for
the 78 distinct matches `git grep` reports.

Category 4 is the one a maximally literal reading of "`git grep
'.css'` finds only `tokens.css` and `global.css`" would still reject.
Rewriting it touches 47 files for wording only, with zero behavior
change. The citation is true and useful exactly as written: a
component's styles did live in `app.css`, once.

This change verifies the exit bar as it matters instead. No `.css`
file survives beyond `tokens.css` and `global.css`. No import
references a deleted file. Every other match falls into category 1 or
3 above. This design document records that verification, rather than
silently narrowing the exit bar.

**D3. Three dead, CSS-less classNames stay unchanged.**

This change's research found them. `studio-player-form` and
`studio-player-record` live in `PlayerScreen.tsx`.
`studio-header-bar-menu-trigger` lives in `ProcessHeaderBar.tsx`. All
three show in the DOM today, with zero effect.

A check confirms it: `git show <phase-3-commit>^:.../app.css` never
had a rule for either file. That holds even before phase 3 touched
either one.

They sit there as harmless leftovers, not new breakage. Design.md's
own phase 5 row names two jobs: delete five files, and correct stale
docs. Neither job is this one. Leaving three inert `className` strings
alone is the smaller risk. This change's own stated scope excludes a
source-wide dead-code sweep.

A broader, pre-existing convention of bare "screen root marker"
classes exists too, `app-tasks`, `shell-login`, and others. It
predates this migration by about a month. That commit, `87e2a0e`,
lands before `d8a25d5`'s StyleX proof of concept. Both `git log
--diff-filter=A` and `git show` confirm it. The same reasoning leaves
it untouched, at greater scale.

**D4. No ESLint plugin.** Design.md's own phase 5 row marks this
"optional." This repo has never had an ESLint config, dependency, or
CI step. Its enforcement stack is `tsc --noEmit`, `bun test`, and the
antislop/whitespace gates instead.

Adding an entirely new tool is a scope expansion. Nothing about this
closing phase, or any other phase or team decision, asks for it. This
phase's own goals do not need it.

Revisit this the day a real StyleX authoring mistake ships anyway. An
invalid token, or an unmigrated call site, could pass `bun run
typecheck` and `bun run build` untouched. Only a lint rule would catch
it. None has, across five phases.

**D5. Consolidate four `prefers-reduced-motion` blocks into one,
adopting reporting's technique.** Three areas use `transition: none
!important; animation: none !important;`. Reporting uses
`animation-duration`/`transition-duration: 0.01ms !important;`
instead. No code in this repo depends on the difference: no
`transitionend`/`animationend` listener exists anywhere in
`packages/web`, confirmed by a direct check.

Between the two techniques, the near-zero-duration form is the safer
default in general. It still runs a transition to completion, at
imperceptible speed, rather than skipping it outright. A value some
future `transitionend` handler applies would still get applied. Both
techniques read as instantly settled to a human either way. One block,
in `global.css`, replaces all four.

Rejected alternative: keep both techniques, scoped per area, inside
`global.css`. Rejected, because scoping a global reset per area
reintroduces exactly the split this phase exists to close. No current
behavior depends on that split.

**D6. `.studio-dialog::backdrop` moves into `global.css` unchanged,
studio prefix and all.** It is the only remaining destination
`web-styling` permits. It is already harmless there. That file carries
rules with no area-neutral pretension, and the reduced-motion block
above is one. The `.studio-dialog` class composes on no element
outside studio. Renaming it to drop the prefix would break nothing
today. It would also cost every `<dialog>` call site a rename, for no
behavior change, so the existing identifier stays.

**D7. `global.css`'s new size supersedes the old "under about 60
lines" line.** Three things get added: `.shell`/`.shell > *`, the
deduped reduced-motion block, and `.studio-dialog::backdrop`. Together
they bring the file to 118 lines. That count comes from a draft,
written and counted before this document.

The `web-styling` delta replaces the 60-line figure with 118. It also
drops the sentence placing reduced-motion blocks in the areas. That
claim goes false the moment no area stylesheet exists to hold one.

## Risks / Trade-offs

- [Consolidating reporting's `prefers-reduced-motion` technique onto
  the other three areas is a real, if tiny, behavior change. The
  user's transitions now finish in ~0.01ms, instead of not running at
  all] → both read as instant. The production build's browser probe
  checks this phase's own claim. It triggers a transition under
  `prefers-reduced-motion: reduce`, in one screen per area, and
  confirms no visible motion.
- [A maximally literal reading of the exit line stays unsatisfied by
  design. Fifty-eight historical comments still name a deleted file] →
  documented as D2. D2 carries the exact category breakdown and the
  concrete check this change runs instead.
- [Deleting `boundaries.test.ts`'s class-collision test removes a
  check that, on paper, still runs] → in practice it already proves
  nothing. The last area stylesheet lost its last
  shared-with-another-area class name. A compiled StyleX class cannot
  collide across areas the way a hand-written one could. The risk
  moved from "guarded" to "structurally impossible," not to
  "unguarded."
- [`global.css` grows past what a "global stylesheet" reader expects]
  → D7 updates the ceiling. `web-styling`'s own ceiling becomes the
  actual, counted number. That replaces stale prose sitting next to a
  bigger file.

## Migration Plan

This closes the six-phase plan `stylex-phase-0-tooling`'s design.md
laid out. No phase follows this one. Rollback is `git revert` of this
change's commits. It deletes no data. The five files this change
removes stay fully recoverable from git history, if any regression
surfaces after archive.

Order inside this phase: `global.css` first, since the new home has to
exist before anything can move into it. Then the five deletions and
their five import removals, each area's `root.tsx` plus `main.tsx`.
Then `boundaries.test.ts`. Then the doc sweep. Then verification.

## Open Questions

None. This phase closes every decision it needed, above.
