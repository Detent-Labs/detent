## Context

See `proposal.md` for the "Why". `StepsPanel.tsx` today drives one
piece of state: `openSection: StepSection | undefined`. That state
spans eight section keys: `identity`, `assignment`, `paths`, `timers`,
`actions`, `subprocess`, `view`, `developerView`. `chooseSection`
toggles the state. For `view` it instead calls `navigate(step.id)`.

Each section renders as a separate `<section hidden={!shows(section)}>`.
Every section sits below the full `step-section-index` list, in
declaration order. That order holds no matter which entry the
developer clicked.

A Claude Design canvas mockup settled the direction with the user
before this change. Three zones (identity, behavior, diagnostics)
replace the one flat list. `specs/studio-canvas/spec.md` in this same
change carries the resulting requirements in full. This document
covers the "how," not the "what."

## Goals / Non-Goals

**Goals:**
- Replace `openSection`'s eight-key disclosure state with a smaller
  state shape that matches the three-zone model.
- Keep every existing panel mounted with unchanged props: `PathsPanel`,
  `TimersPanel`, `ActionListEditor`, `PluginEnvelopeEditor`,
  `SubprocessSpecEditor`, `IssueList`, `ChecksRail`.
- Keep the path-edge-click-to-Paths-tab behavior.
<!-- Why: "surface toggle" (ui-glossary.md) is a fixed UI term here, -->
<!-- not a synonym for "render". -->
<!-- antislop: allow synonym-rotation -->
- Keep the keyboard-activatable tab pattern already established
  elsewhere in studio: field tabs, dock tabs, the structure/JSON
  surface toggle.

**Non-Goals:**
- No change to `Draft`, `DraftField`, or any mutation helper
  (`updateInDraftArray`, `addToDraftArray`).
- No change to `PathsPanel`, `TimersPanel`, `ActionListEditor`,
  `PluginEnvelopeEditor`, or `SubprocessSpecEditor` internals.
- No change to the multi-select `.canvas-selection` column.
- No change to `ChecksRail`'s own collapsed and expanded logic.
- No change to the form editor's routed page, or how the view button
  reaches it.

## Decisions

**State shape: `activeTab` replaces `openSection`.**

`StepsPanel` SHALL hold `activeTab: BehaviorTab`. `BehaviorTab` is
`"assignment" | "paths" | "timers" | "actions" | "subprocess"`, a
required field with no `undefined` state. Unlike `openSection`, this
state can never read "nothing shown." The behavior zone always shows
exactly one tab's content. There is no accordion-closed state left to
represent.

Alternative considered: keep `openSection | undefined`, and treat
`undefined` as "default to Assignment" at render time. Rejected. That
shape still carries a state neither the type nor the UI can express:
an inspector with no tab shown. Every read site would need the same
`?? "assignment"` fallback the narrower type expresses directly.

**Default and reset rules live in one function.**

A single `defaultTabFor(selection)` helper decides `activeTab` on
every selection change. It answers `"paths"` when the selection
carries a `selectedPathId`. It answers `"assignment"` otherwise.
`StepsPanel`'s existing `useEffect` calls it. That effect already keys
on `[selectedStepId, selectedPathId]`; it is the same effect that
resets `openSection` today.

Leaving the Subprocess tab shown resets through a second, narrower
effect, keyed on `step?.type`. That transition happens without a
selection change, so the first effect cannot see it.

<!-- Why: "update" here names React's functional-setState pattern, a -->
<!-- different concept from "change", the fixed OpenSpec term this -->
<!-- document uses elsewhere for the proposal as a whole. -->
<!-- antislop: allow synonym-rotation -->
That second effect MUST use a functional state update
(`setActiveTab((prev) => ...)`), never a plain `setActiveTab("assignment")`.
Selecting a different, non-subprocess step changes `step?.type` too. Both
effects can then fire in the same React commit. The selection effect sets
`"paths"` from a path-edge click; the type effect resets away from
`"subprocess"`. A plain `setActiveTab("assignment")` in the second effect
would read a stale closure and clobber the first effect's `"paths"` value.
Queued functional updates in the same batch see prior updates from that
same batch, so reading `prev` closes the race.

**Identity zone fields stay uncontrolled by tab state.**

They already render unconditionally today, outside any accordion
section but identity's own. Moving them out of the eight-way switch is
a subtraction, not a new control flow.

**Diagnostics drawer wraps, rather than replaces, `ChecksRail`.**

`ChecksRail` keeps mounting at the inspector's bottom edge, unchanged,
with the same `collapsed` prop. A new wrapper element,
`.step-diagnostics`, surrounds it. That wrapper also holds the
per-step issue count and the raw-JSON toggle. `IssueList` stays inside
the same wrapper too.

**Tab row accessibility follows the existing field-tabs shape.**

Three existing tab rows already render `role="tablist"` /
`role="tab"` / `aria-selected` on plain `<button>` elements, with no
roving `tabindex`. Those three are `FieldCatalogPanel`'s field tabs,
`EditorDock`'s dock tabs, and `EditScreen.tsx`'s structure/JSON toggle
(rendered through `ProcessHeaderBar`'s `surfaceToggle` slot). The
behavior zone's tab row follows that same shape. It does
not adopt the full WAI-ARIA APG tabs pattern, roving `tabindex` and
arrow-key navigation included. No tab row in this codebase implements
that fuller pattern today.

**CSS: new classes, old ones retire.**

`.step-section-index` and `.step-section-entry` named the old
accordion index. `StepsPanel` stops rendering them, so they lose their
only mount point. Their rules retire from `app.css`.

Three rules replace them. `.step-identity-zone` names the identity
zone. `.step-behavior-tabs` and `.step-behavior-tab` name the tab
row. That pair mirrors `.studio-dock-tabs`'s existing button styling.
`.step-diagnostics` names the drawer.

## Risks / Trade-offs

<!-- Why: the linter's sentence splitter does not treat the bold -->
<!-- "**Mitigation**:" marker after a period as a sentence boundary, -->
<!-- so it merges the Risk and Mitigation halves of these bullets. -->
<!-- antislop: allow sentence-length -->

- **[Risk]** A developer's muscle memory for the old accordion order
  breaks: identity, assignment, paths, timers, actions. Paths now sits
  second in the tab row. Identity is no longer a disclosure at all.
  **Mitigation**: none needed beyond the redesign itself. The old
  order was hard to learn in the first place; see the proposal's
  "Why."
- **[Risk]** `stepIssueCount` today drives the issue-count line in the
  `.step-section-issues` paragraph between the section index and the
  expanded section, while `IssueList` renders the issue messages below
  it. The diagnostics drawer moves that number. A developer looks in a
  new place for it, mid-task.
  **Mitigation**: the drawer sits where `ChecksRail` already sits, at
  the column's bottom edge. The reading position stays put. Only what
  precedes it changes.
- **[Note]** `PathsPanel`'s `terminal` prop becomes vestigial after task
  3.3: the tab row shows the empty state instead of `PathsPanel` itself
  when `step.terminal` is true, so no call site renders `PathsPanel`
  with `terminal={true}` any longer. The prop stays in `PathsPanel`'s
  own signature since this change touches nothing inside `PathsPanel`
  (see Non-Goals). A future reader should not mistake it for live
  code.
- **[Risk]** A hand-written Playwright locator, or an existing
  browser-check screenshot, may key on `.step-section-entry` or on
  `aria-controls="step-section-*"`. Either one breaks.
  **Mitigation**: `tasks.md` adds a task to grep the repo for those
  selectors. That task runs before this change counts as done.

## Migration Plan

This is a studio-only presentation change. No database migration
applies. No API version bump applies. No persisted-data shape
changes. Deploy is a normal `packages/web` build and release.
Rollback is a normal revert of the same commits.

`StepsPanel` carries no part of the definition contract. No running
instance depends on its old inspector shape.

## Open Questions

None blocking. Design raised two questions. One: the default tab on a
fresh selection. Two: what happens when the Subprocess tab loses its
trigger. The Decisions section above answers both, and
`specs/studio-canvas/spec.md` now states both as requirements.

One follow-up sits out of this change's scope. Line 340 of
`studio-app/spec.md` also says "the section index's identity
section," in a six-site `LocalizedTextInput` warning list.

`studio-app` is not a capability this change touches. No delta spec
here can update that base spec's wording. A future change should
update it once this change archives and the `studio-canvas` base spec
carries "identity zone."

A second, lower-priority terminology-freshness follow-up sits in this
change's own base spec, `studio-canvas/spec.md`. The untouched
requirement is "A set of several steps offers a count and a delete
control." One of its scenarios says "...and shows no step sections."
That scenario stays factually true under this change. It concerns
multi-select, a different requirement from the ones this change
modifies.

Once this change lands, though, "sections" reads as leftover
accordion-era terminology. A future change should reword it to match
the zone/drawer vocabulary this change introduces.
