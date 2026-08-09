<!-- antislop: allow-file synonym-rotation -->
<!-- "error" throughout this file names DraftToolbar's own network/save failure message; "issue" names a validation.issues[] entry (studio-checks-rail's own term). Different concepts, both already established by the base specs. -->

## Context

See `proposal.md` - Why for the motivation. This section covers only the
current composition the design changes.

`EditScreen.tsx`'s `EditorArea` renders several pieces in order. Three
`studio-back` buttons come first, then an `<h1>`. Next comes the
`ProcessHeader` fieldset (key, baseLocale, label). Then `DraftToolbar`
comes, with its own Save, Discard, and Publish buttons.
`ContentLocaleSwitcher` and `RegistryPanel` follow as their own
fieldsets.

A bare Structure/JSON `role="tablist"` comes next, then
`ProcessHeaderBar`, a read-only summary strip. Last comes
`studio-canvas-layout`: `StepPalette`, `CanvasView`, a `StepsPanel`
inspector, and `ChecksRail`. All four mount together, always.

`EditorArea` already lifts `saveState` and passes it down as controlled
props. The `studio-canvas` capability's header-bar requirement names
this pattern. This change extends it. It introduces no new one.

The design source is `design-import`'s `Process Studio cleanup_1.zip`.
Its manifest lives at the path recorded in this conversation, not in
the repo. Turns 4 and 5 of that exploration are what the specs deltas
encode.

## Goals / Non-Goals

**Goals:**
- Collapse the stacked-fieldset chrome into one header row plus a rail,
  per the specs deltas.
- Keep every relocated control's existing mutation path unchanged:
  `useDraft()`, `mutate()`, `setRegistry()`, and `DraftToolbar`'s save
  logic.
- Keep the shared `EditPanelsModal` and its own internal rail untouched.

**Non-Goals:**
- Redesigning the modal, the canvas graph, or any step-inspector section
  beyond swapping its column-mate.
- Deciding narrow-viewport behavior for the rail. See Open Questions.
- Changing what `RegistryPanel` or `ContentLocaleSwitcher` mutate.

## Decisions

**One rail component, not two side-by-side ones.**

The palette (Step, Subprocess, End) and the Process section (Fields,
Data sources, Contract) render as one `EditRail` component. It carries
two labeled groups. `StepPalette` does not stay a second, separate
element.

Every converged mockup (3b, 4a, 4b) already shows the two groups
sharing one column. A single component also gives the narrow-viewport
question one place to answer later, not two.

**`ChecksRail` owns its own collapsed presentation.**

`ChecksRail` gains a `collapsed` prop. The collapsed state shows the
one-line summary and an expand control. The expanded state shows
today's grouped list.

`StepsPanel` docks it at its bottom edge whenever the developer selects
a step or a path. When the developer selects nothing, `EditScreen`
mounts the same component uncollapsed, beside the canvas.

This keeps the `validation.issues[]` grouping and counting logic in one
place. The alternative duplicates a count computation into `StepsPanel`.
Two implementations of "how many open issues" drift apart over time.
This design keeps one.

The collapsed summary carries three states, not two. It shows a count,
or "no count" when every group is genuinely clear. It shows a
held-back indicator when the draft is not yet structurally valid.
`studio-checks-rail`'s own held-back requirement already forbids a
held-back group from reading as empty or passing. The summary keeps
that rule instead of collapsing it away.

A new `totalOpenIssueCount`-style pure function computes this. It gets
tested beside `groupChecksBySource` and `allChecksClear`, in
`packages/web/test/studio-checksRail.test.ts`. That is where their own
coverage already lives. The count does not become new, untested logic
left inside `ChecksRail.tsx`.

**`DraftToolbar` keeps its logic. `ProcessHeaderBar` renders the
buttons.**

`DraftToolbar` keeps owning save, discard, and publish state. It also
keeps owning pending flags and error handling. It stops rendering its
own visible buttons. `EditorArea` lifts those handlers into
`ProcessHeaderBar`'s `⋮` menu, the same way it already lifts
`saveState`.

An alternative keeps `DraftToolbar`'s own buttons mounted, hidden by
CSS. The menu's own triggers would then call duplicate copies. This
design rejects that. It would bring back the "second copy" the
original header-bar requirement guards against.

Only the action buttons move into the menu. `DraftToolbar`'s error
message, its save-conflict banner (with the Reload action), and its
publish-success confirmation stay inline in the header row. They render
outside the `⋮` menu.

`studio-app`'s base requirement calls for a conflict message the author
sees, not one reachable after a click. A closed menu would hide it from
an author who never opens the menu. That is the exact moment a
conflict most needs attention.

`design-language.md`'s own rule agrees. A failed request shows its
error where the data would normally sit. It never shows as a toast,
and never behind a disclosure.

**The rail's Process rows stay modal-openers.**

Per turn 5b, Fields, Data sources, and Contract stay entry points into
the existing `EditPanelsModal`. They render as rail rows with a count
and a chevron. No inline editing moves into the rail itself.

The modal keeps its own internal rail too, per `studio-app`'s "shared
editing modal" requirement. It lists the same three views again, with
entity and issue counts. The two are deliberately two layers, not one
duplicated. `EditRail`'s rows are outer navigation into the modal. The
modal's own rail navigates between views once it is open.

**The overflow menu groups by persistence, not by topic.**

The menu carries two groups. "Process, saved with the draft" holds the
key and the base locale. "This session only" holds the action
registry. The groups split by what happens to the value, not by where
it lives in the schema.

This matches `RegistryPanel`'s actual behavior. `useDraft()`'s
in-memory `registry` never reaches `PUT /drafts/:processId`. The
grouping makes that fact visible instead of implicit.

**`ContentLocaleSwitcher`'s add-locale control moves into that same
"Process, saved with the draft" group, not just its dropdown.**

Today's `ContentLocaleSwitcher` renders two things. A `<select>`
switches the edited content locale. A text input plus a "+ add locale"
button starts authoring a new one (`resolveAddLocaleAttempt`). Every
converged mockup only carries the switch forward, as the header row's
compact locale badge.

Dropping the add-locale input would leave an author no way to start a
`de`, or any new, content locale. This change does not intend that
loss.

The switch becomes the header row's badge. The add-locale input and
button move into the `⋮` menu's "Process, saved with the draft" group,
beside key and base locale. Adding a locale is itself a draft-scoped
concern, the same as those two. The alternative, giving add-locale no
new home and letting it quietly disappear, is what this decision
rejects.

**The inspector's standalone "+ Add step" button goes away.**

Today's no-selection inspector state carries its own "+ Add step"
button beside the palette's. The no-selection state now shows the
checks rail instead of the inspector. That button's slot no longer
renders. The palette's Step entry stays the one always-reachable way to
add the first step. This change does not touch that entry or its own
requirement.

An alternative docks a second "+ Add step" button onto the checks
rail's no-selection view. This design rejects that: it is the exact
redundant chrome this change removes everywhere else.

## Risks / Trade-offs

**Base locale and action registry lose default visibility** → an
author once saw both fieldsets on load. Now that author needs one `⋮`
click. Neither is a first-load concern for most edits. An author sets base
locale once early. The action registry is a session-only dev
convenience.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the Structure/JSON tab, the domain term studio-app's own spec uses; "render"/"renders" elsewhere in this file describes ordinary component output. Unrelated concepts. -->
The `studio-app` capability's base-locale requirement still requires
reaching the control without leaving the Structure surface. It just no
longer requires that without a click.

**Two in-flight changes touch the same files** → `CanvasView.tsx`
belongs to `fix-canvas-pan-dead-zone`, and `studio-canvas-layout`'s grid
belongs to this change. Sequence this change after
`fix-canvas-pan-dead-zone` lands, per proposal.md - Impact. Check
`openspec list` before starting implementation.

**`ChecksRail`'s collapsed count could disagree with its expanded
detail** if the two paths ever compute the count differently. The
single-component decision above mitigates this: both presentations read
the same `validation.issues[]` traversal.

## Migration Plan

No data migration applies. This is a client-only rendering change
behind no feature flag. `EditScreen.tsx` ships the new layout on
deploy. Rollback reverts the same commit range, since no persisted
shape changes.

## Open Questions

- **Narrow-viewport rail behavior.** The design source did not explore
  this. Resolve it during implementation as a CSS-level decision: a
  collapse breakpoint, or none. None applies if the studio's minimum
  supported width already exceeds the rail's natural width. It does
  not change the specs.
- **German label lengths in the single-line header.** `design-language.md`
  notes that German text runs up to 40% longer. Verify this in a real
  browser per `docs/browser-checks.md` once built. If the row overflows,
  wrapping or truncation is a CSS fix, not a spec change.
